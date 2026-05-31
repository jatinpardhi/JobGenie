const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const a = await p.application.findUnique({ where: { id: "cmpspnq5l000nuk9sgiive82d" }, select: { status: true, progressMessage: true } });
  console.log("APP_STATUS:", a.status, "|", a.progressMessage);
  const profiles = await p.portalProfile.findMany({ where: { userId: "cmpsn5af10000a0pihud608un" } });
  for (const pr of profiles) {
    let q = [];
    try { q = JSON.parse(pr.questions); } catch {}
    const radios = q.filter(x => x.type === "radio-group").length;
    const selects = q.filter(x => Array.isArray(x.options) && x.options.length > 0).length;
    console.log("PORTAL:", pr.portal, "total=", q.length, "radioGroups=", radios, "withOptions=", selects, "completed=", pr.completed);
    const interesting = q.filter(x => Array.isArray(x.options) && x.options.length > 0).slice(0, 8);
    for (const w of interesting) {
      console.log("  [" + w.type + "] " + w.label.slice(0,80) + " -> " + (w.options||[]).slice(0,6).join(" | "));
    }
    const junk = q.filter(x => /^(input|select|textarea|text)$/i.test((x.label||"").trim())).length;
    console.log("  junk-labeled count:", junk);
  }
  await p.$disconnect();
})();
