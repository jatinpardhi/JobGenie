import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import Link from "next/link";

const PORTAL_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  linkedin: "LinkedIn Easy Apply",
  indeed: "Indeed",
  "airbnb-greenhouse": "Airbnb (Greenhouse)",
};
const prettyPortal = (p: string) => PORTAL_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [total, submitted, pending, failed, awaiting, incompletePortals] = await Promise.all([
    prisma.application.count({ where: { userId } }),
    prisma.application.count({ where: { userId, status: "SUBMITTED" } }),
    prisma.application.count({ where: { userId, status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.application.count({ where: { userId, status: "FAILED" } }),
    prisma.application.count({ where: { userId, status: "AWAITING_APPROVAL" } }),
    prisma.portalProfile.findMany({
      where: { userId, completed: false },
      select: { id: true, portal: true, questions: true },
      orderBy: { updatedAt: "desc" },
    }),
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

      {incompletePortals.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg text-amber-600 dark:text-amber-400">⚠</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {incompletePortals.length} portal{incompletePortals.length === 1 ? "" : "s"} need your input
              </h2>
              <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/90">
                Fill standard questions <strong>once</strong> per portal and JobGenie will
                auto-apply every future job from that portal without asking again.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {incompletePortals.map((p) => {
                  let count = 0;
                  try { count = (JSON.parse(p.questions) as unknown[]).length; } catch {}
                  return (
                    <li key={p.id}>
                      <Link
                        href="/dashboard/portals"
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
                      >
                        {prettyPortal(p.portal)}
                        <span className="text-amber-600 dark:text-amber-400">· {count} q</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <Link
              href="/dashboard/portals"
              className="btn-primary shrink-0 whitespace-nowrap !py-1.5 !text-xs"
            >
              Fill now →
            </Link>
          </div>
        </div>
      )}

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
