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

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "RUNNING" },
  });

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true, resumes: true, answers: true },
    });
    const resume = user.resumes.find((r) => r.isDefault) ?? user.resumes[0];
    if (!resume) throw new Error("No resume on file");

    const savedAnswers = Object.fromEntries(
      user.answers.map((a) => [a.questionText, a.answer])
    );

    const ctx = await newContext();
    const page = await ctx.newPage();
    push("Probing portal", { jobUrl });
    const probe = await probePortal(page, jobUrl);
    push("Probe complete", {
      platform: probe.detectedPlatform,
      requiresLogin: probe.requiresLogin,
      hasCaptcha: probe.hasCaptcha,
      fields: probe.fields.length,
    });

    if (probe.hasCaptcha) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "NEEDS_INFO",
          errorMessage: "CAPTCHA detected — human intervention required",
          logs: JSON.stringify(stepLogs),
        },
      });
      await ctx.close();
      return;
    }

    // Relevance scoring uses page text as a stand-in for job description.
    const jobText = await page.evaluate(() =>
      document.body.innerText.slice(0, 8000)
    );
    const score = await scoreMatch({
      jobTitle: probe.title,
      jobDescription: jobText,
      profile: user.profile ?? {},
      resumeText: resume.parsedText ?? "",
    });
    push("Match scored", score);

    if (score.score < 0.45) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "SKIPPED",
          matchScore: score.score,
          errorMessage: "Below match threshold",
          logs: JSON.stringify(stepLogs),
        },
      });
      await ctx.close();
      return;
    }

    const cover = await generateCoverLetter({
      jobTitle: probe.title,
      company: probe.detectedPlatform,
      jobDescription: jobText,
      profile: user.profile ?? {},
      resumeText: resume.parsedText ?? "",
    });
    push("Cover letter generated", { chars: cover.length });

    const answers = await mapFieldsToProfile(
      probe.fields,
      { ...(user.profile ?? {}), coverLetter: cover },
      resume.parsedText ?? "",
      savedAnswers
    );
    push("Fields mapped", { count: answers.length });

    // Persist any high-confidence net-new answers for future reuse.
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
          logs: JSON.stringify(stepLogs),
        },
      });
      push("Awaiting human approval before submit");
      await ctx.close();
      return;
    }

    const filled = await fillForm(page, answers, resume.filePath);
    push("Form filled", filled);

    // Walk up to 5 steps of a multi-step application.
    for (let i = 0; i < 5; i++) {
      const result = await clickNextOrSubmit(page);
      push("Step click", { step: i, result });
      if (result === "submit") break;
      if (result === "none") break;
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
        logs: JSON.stringify(stepLogs),
      },
    });
    push("Application submitted");
    await ctx.close();
  } catch (err) {
    log.error("Application failed", { err: String(err) });
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "FAILED",
        errorMessage: String(err),
        logs: JSON.stringify(stepLogs),
      },
    });
  }
}
