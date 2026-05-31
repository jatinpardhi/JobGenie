const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  await p.portalProfile.deleteMany({ where: { userId: "cmpsn5af10000a0pihud608un" } });
  await p.application.update({
    where: { id: "cmpspnq5l000nuk9sgiive82d" },
    data: { status: "PENDING", progressMessage: "Re-probe with custom-widget detection", errorMessage: null, coverLetter: null, formSnapshot: null, logs: null, appliedAt: null, matchScore: null },
  });
  console.log("CLEAN");
  await p.$disconnect();
})();
