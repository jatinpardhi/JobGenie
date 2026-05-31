import { prisma } from "../db";
import { logger } from "../logger";
import { mapFieldsToProfile, generateCoverLetter, scoreMatch } from "../ai/agent";
import { newContext } from "./browser";
import { probePortal } from "./inspector";
import { clickNextOrSubmit, fillForm } from "./filler";
import { questionHash } from "../hash";
import { env } from "../env";

const log = logger.child("apply-engine");

export interface ApplyJobInput {
  applicationId: string;
  userId: string;
  jobUrl: string;
  /** Skip the AWAITING_APPROVAL gate (set by /approve route). */
  bypassApproval?: boolean;
}

export async function runApplication(input: ApplyJobInput) {
  const { applicationId, userId, jobUrl } = input;
  const stepLogs: any[] = [];
  const push = (msg: string, meta?: unknown) => {
    log.info(msg, meta);
    stepLogs.push({ t: new Date().toISOString(), msg, meta });
  };
  const progress = async (msg: string, meta?: unknown) => {
    push(msg, meta);
    try {
      await prisma.application.update({
        where: { id: applicationId },
        data: { progressMessage: msg.slice(0, 200), logs: JSON.stringify(stepLogs) },
      });
    } catch { /* ignore */ }
  };

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "RUNNING", progressMessage: "Starting…" },
  });

  try {
    await progress("Loading your profile, resume, and saved answers…");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true, resumes: true, answers: true },
    });
    const resume = user.resumes.find((r) => r.isDefault) ?? user.resumes[0];
    if (!resume) throw new Error("No resume on file — upload one in Profile first.");
    await progress(`Profile loaded (resume: ${resume.label ?? "uploaded"}, saved answers: ${user.answers.length}).`);

    const savedAnswers = Object.fromEntries(
      user.answers.map((a) => [a.questionText, a.answer])
    );

    await progress("Launching browser context…");
    const ctx = await newContext();
    const page = await ctx.newPage();
    await progress(`Opening job page: ${jobUrl}`);
    const { probe, target, activePage } = await probePortal(page, jobUrl);
    if (probe.ctaClicked) {
      await progress(`Clicked Apply CTA → ${probe.finalUrl}`);
    }
    await progress(
      `Probe complete — platform=${probe.detectedPlatform}, login=${probe.requiresLogin}, captcha=${probe.hasCaptcha}, fields=${probe.fields.length}.`
    );

    if (probe.hasCaptcha) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "NEEDS_INFO",
          errorMessage: "CAPTCHA detected — human intervention required",
          progressMessage: "Blocked by CAPTCHA.",
          logs: JSON.stringify(stepLogs),
        },
      });
      await ctx.close();
      return;
    }

    await progress("Reading job description text…");
    const jobText = await page.evaluate(() =>
      document.body.innerText.slice(0, 8000)
    );
    await progress(`Job text captured (${jobText.length} chars). Scoring match with local LLM…`);
    const score = await scoreMatch({
      jobTitle: probe.title,
      jobDescription: jobText,
      profile: user.profile ?? {},
      resumeText: resume.parsedText ?? "",
    });
    await progress(`Match score: ${(score.score * 100).toFixed(0)}% — ${score.reasons?.[0] ?? ""}`);

    // Hard skip only in autonomous mode. In human-approval mode the user
    // reviews every queued application, so a harsh local LLM score should
    // not silently drop candidates from the queue.
    if (!env.humanApproval && score.score < 0.45) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "SKIPPED",
          matchScore: score.score,
          errorMessage: "Below match threshold (45%)",
          progressMessage: `Skipped — match ${(score.score * 100).toFixed(0)}% < 45% threshold.`,
          logs: JSON.stringify(stepLogs),
        },
      });
      await ctx.close();
      return;
    }

    await progress("Generating cover letter with local LLM…");
    const cover = await generateCoverLetter({
      jobTitle: probe.title,
      company: probe.detectedPlatform,
      jobDescription: jobText,
      profile: user.profile ?? {},
      resumeText: resume.parsedText ?? "",
    });
    await progress(`Cover letter generated (${cover.length} chars). Mapping ${probe.fields.length} form field${probe.fields.length === 1 ? "" : "s"}…`);

    const answers = await mapFieldsToProfile(
      probe.fields,
      { ...(user.profile ?? {}), coverLetter: cover },
      resume.parsedText ?? "",
      savedAnswers
    );
    // Identify fields the engine could NOT confidently answer — these
    // become the interactive Q&A list shown to the user in the UI.
    const answeredIds = new Set(
      answers.filter((a) => a.value !== null && a.value !== undefined && a.value !== "" && a.confidence >= 0.7).map((a) => a.fieldId)
    );
    const pendingQuestions = probe.fields
      .filter((f) => !answeredIds.has(f.fieldId))
      .filter((f) => f.type !== "file")
      .map((f) => ({
        fieldId: f.fieldId,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        placeholder: f.placeholder,
      }));
    await progress(`Mapped ${answers.length} answer${answers.length === 1 ? "" : "s"}; ${pendingQuestions.length} need your input.`);

    for (const a of answers) {
      if (a.value && a.confidence >= 0.7) {
        const field = probe.fields.find((f) => f.fieldId === a.fieldId);
        if (!field) continue;
        await prisma.savedAnswer.upsert({
          where: {
            userId_questionHash: { userId, questionHash: questionHash(field.label) },
          },
          create: {
            userId,
            questionHash: questionHash(field.label),
            questionText: field.label,
            answer: String(a.value),
            fieldType: field.type,
          },
          update: { answer: String(a.value) },
        });
      }
    }

    // --- Portal profile: merge all detected questions (not just unanswered
    // ones) into a per-portal catalogue so the dashboard can prompt the
    // user to fill them once. Mark complete when no required questions are
    // pending. Existing saved answers automatically populate via the same
    // SavedAnswer pathway above.
    if (probe.detectedPlatform && probe.detectedPlatform !== "generic") {
      try {
        const existingProfile = await prisma.portalProfile.findUnique({
          where: { userId_portal: { userId, portal: probe.detectedPlatform } },
        });
        let merged = probe.fields
          .filter((f) => f.type !== "file")
          .map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options,
            placeholder: f.placeholder,
          }));
        if (existingProfile) {
          try {
            const prev = JSON.parse(existingProfile.questions) as typeof merged;
            const byLabel = new Map(merged.map((q) => [q.label, q]));
            for (const q of prev) if (!byLabel.has(q.label)) merged.push(q);
          } catch { /* ignore parse */ }
        }
        const completed = pendingQuestions.filter((q) => q.required).length === 0;
        await prisma.portalProfile.upsert({
          where: { userId_portal: { userId, portal: probe.detectedPlatform } },
          create: {
            userId,
            portal: probe.detectedPlatform,
            questions: JSON.stringify(merged),
            sampleUrl: jobUrl,
            completed,
          },
          update: {
            questions: JSON.stringify(merged),
            sampleUrl: existingProfile?.sampleUrl ?? jobUrl,
            completed,
          },
        });
      } catch (e) {
        log.warn("Portal profile upsert failed", { err: String((e as any)?.message ?? e) });
      }
    }

    if (env.humanApproval && !input.bypassApproval) {
      const msg =
        pendingQuestions.length > 0
          ? `Need your input on ${pendingQuestions.length} question${pendingQuestions.length === 1 ? "" : "s"} before submitting.`
          : "Ready for review — click Approve & submit to send.";
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "AWAITING_APPROVAL",
          matchScore: score.score,
          coverLetter: cover,
          formSnapshot: JSON.stringify({
            fields: probe.fields,
            answers,
            pendingQuestions,
            ctaClicked: probe.ctaClicked,
            finalUrl: probe.finalUrl,
          }),
          progressMessage: msg,
          logs: JSON.stringify(stepLogs),
        },
      });
      push("Awaiting human approval before submit");
      await ctx.close();
      return;
    }

    await progress("Filling form fields in the live page…");
    const filled = await fillForm(target, answers, resume.filePath);
    await progress(`Filled ${filled?.filled ?? "?"} field${filled?.filled === 1 ? "" : "s"}.`);

    let submitClicked = false;
    let lastClickResult: string = "none";
    for (let i = 0; i < 5; i++) {
      await progress(`Step ${i + 1}: clicking Next/Submit…`);
      const result = await clickNextOrSubmit(target);
      push("Step click", { step: i, result });
      lastClickResult = result;
      if (result === "submit") {
        submitClicked = true;
        await progress("Submit button clicked.");
        break;
      }
      if (result === "none") {
        await progress("No further button found.");
        break;
      }
      await activePage.waitForLoadState("domcontentloaded").catch(() => {});
    }

    // Honest terminal state:
    //  - SUBMITTED only if we actually clicked a submit button AND wrote some fields
    //    (a 0-field "submit" on a marketing page is meaningless).
    //  - NEEDS_INFO when we couldn't find a form / submit button — the user should
    //    open the link and apply manually (often the real ATS is behind an "Apply"
    //    redirect we can't follow without login).
    const fieldsFilled = filled?.filled ?? 0;
    const reallySubmitted = submitClicked && fieldsFilled > 0;

    if (reallySubmitted) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "SUBMITTED",
          matchScore: score.score,
          coverLetter: cover,
          formSnapshot: JSON.stringify({
            fields: probe.fields,
            answers,
            pendingQuestions: [],
            ctaClicked: probe.ctaClicked,
            finalUrl: probe.finalUrl,
          }),
          appliedAt: new Date(),
          progressMessage: `Submitted! (${fieldsFilled} field${fieldsFilled === 1 ? "" : "s"} filled)`,
          logs: JSON.stringify(stepLogs),
        },
      });
      push("Application submitted");
    } else {
      const reason =
        probe.fields.length === 0
          ? probe.ctaClicked
            ? "Clicked the Apply CTA but no form fields appeared — the destination may require login, a CAPTCHA, or render the form in a cross-origin iframe we can't inspect. Open the link and apply manually."
            : "No application form detected on this page and no 'Apply' CTA was found — open the listing manually and use the ATS link."
          : fieldsFilled === 0
            ? "Form fields were detected but none could be filled. Use the questions below to provide answers, then click Approve & submit."
            : `Form filled (${fieldsFilled} field${fieldsFilled === 1 ? "" : "s"}) but no submit button was clicked (last action: ${lastClickResult}). Review and submit manually.`;
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "NEEDS_INFO",
          matchScore: score.score,
          coverLetter: cover,
          formSnapshot: JSON.stringify({
            fields: probe.fields,
            answers,
            pendingQuestions,
            ctaClicked: probe.ctaClicked,
            finalUrl: probe.finalUrl,
          }),
          progressMessage: reason,
          errorMessage: reason,
          logs: JSON.stringify(stepLogs),
        },
      });
      push("Application needs manual completion", { reason });
    }
    await ctx.close();
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    log.error("Application failed", { err: msg });
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "FAILED",
        errorMessage: msg,
        progressMessage: `Failed: ${msg.slice(0, 160)}`,
        logs: JSON.stringify(stepLogs),
      },
    });
  }
}
