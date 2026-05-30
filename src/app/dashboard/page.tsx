import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [total, submitted, pending, failed, awaiting] = await Promise.all([
    prisma.application.count({ where: { userId } }),
    prisma.application.count({ where: { userId, status: "SUBMITTED" } }),
    prisma.application.count({ where: { userId, status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.application.count({ where: { userId, status: "FAILED" } }),
    prisma.application.count({ where: { userId, status: "AWAITING_APPROVAL" } }),
  ]);

  const recent = await prisma.application.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const stats = [
    { label: "Total", value: total },
    { label: "Submitted", value: submitted },
    { label: "In progress", value: pending },
    { label: "Needs approval", value: awaiting },
    { label: "Failed", value: failed },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Recent applications</h2>
        <div className="card mt-3 overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="p-3">Job</th>
                <th className="p-3">Status</th>
                <th className="p-3">Score</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((a) => (
                <tr key={a.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="p-3">
                    <a className="text-brand underline" href={a.jobUrl} target="_blank" rel="noreferrer">
                      {a.jobTitle ?? a.jobUrl}
                    </a>
                  </td>
                  <td className="p-3"><span className="badge bg-slate-100 dark:bg-slate-800">{a.status}</span></td>
                  <td className="p-3">{a.matchScore != null ? a.matchScore.toFixed(2) : "—"}</td>
                  <td className="p-3 text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td className="p-6 text-center text-slate-500" colSpan={4}>No applications yet — create a search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
