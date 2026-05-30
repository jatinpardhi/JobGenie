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
    await progress(`Profile loaded (resume: ${resume.fileName ?? "uploaded"}, saved answers: ${user.answers.length}).`);

    const savedAnswers = Object.fromEntries(
      user.answers.map((a) => [a.questionText, a.answer])
    );

    await progress("Launching browser context…");
    const ctx = await newContext();
    const page = await ctx.newPage();
    await progress(`Opening job page: ${jobUrl}`);
    const probe = await probePortal(page, jobUrl);
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
    await progress(`Mapped ${answers.length} answer${answers.length === 1 ? "" : "s"}.`);

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

    if (env.humanApproval) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "AWAITING_APPROVAL",
          matchScore: score.score,
          coverLetter: cover,
          formSnapshot: JSON.stringify({ fields: probe.fields, answers }),
          progressMessage: "Ready for review — click Approve & submit to send.",
          logs: JSON.stringify(stepLogs),
        },
      });
      push("Awaiting human approval before submit");
      await ctx.close();
      return;
    }

    await progress("Filling form fields in the live page…");
    const filled = await fillForm(page, answers, resume.filePath);
    await progress(`Filled ${filled?.filled ?? "?"} field${filled?.filled === 1 ? "" : "s"}.`);

    for (let i = 0; i < 5; i++) {
      await progress(`Step ${i + 1}: clicking Next/Submit…`);
      const result = await clickNextOrSubmit(page);
      push("Step click", { step: i, result });
      if (result === "submit") {
        await progress("Submit button clicked.");
        break;
      }
      if (result === "none") {
        await progress("No further button found — assuming complete.");
        break;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "SUBMITTED",
        matchScore: score.score,
        coverLetter: cover,
        formSnapshot: JSON.stringify({ fields: probe.fields, answers }),
        appliedAt: new Date(),
        progressMessage: "Submitted!",
        logs: JSON.stringify(stepLogs),
      },
    });
    push("Application submitted");
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
