import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import Link from "next/link";
import { RecentApplications } from "./_components/RecentApplications";

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

  const stats = [
    { key: "SUBMITTED",         label: "Submitted",      value: submitted, href: "/dashboard/applications?status=SUBMITTED",         color: "bg-emerald-500", dot: "bg-emerald-500" },
    { key: "RUNNING",           label: "In progress",    value: pending,   href: "/dashboard/applications?status=RUNNING",           color: "bg-blue-500",    dot: "bg-blue-500" },
    { key: "AWAITING_APPROVAL", label: "Needs approval", value: awaiting,  href: "/dashboard/applications?status=AWAITING_APPROVAL", color: "bg-amber-500",   dot: "bg-amber-500" },
    { key: "FAILED",            label: "Failed",         value: failed,    href: "/dashboard/applications?status=FAILED",            color: "bg-rose-500",    dot: "bg-rose-500" },
  ];
  const trackedSum = submitted + pending + awaiting + failed;
  const other = Math.max(0, total - trackedSum);
  if (other > 0) {
    stats.push({ key: "OTHER", label: "Other", value: other, href: "/dashboard/applications", color: "bg-slate-400", dot: "bg-slate-400" });
  }
  const denom = total || 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      {incompletePortals.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <span className="text-amber-600 dark:text-amber-400">⚠</span>
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            {incompletePortals.length} portal{incompletePortals.length === 1 ? "" : "s"} need your input
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {incompletePortals.map((p) => {
              let count = 0;
              try { count = (JSON.parse(p.questions) as unknown[]).length; } catch {}
              return (
                <li key={p.id}>
                  <Link
                    href="/dashboard/portals"
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
                  >
                    {prettyPortal(p.portal)}
                    <span className="text-amber-600 dark:text-amber-400">· {count} q</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/dashboard/portals" className="ml-auto text-[11px] font-semibold text-brand underline">
            Fill now →
          </Link>
        </div>
      )}

      <section className="card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Applications · <span className="text-slate-900 dark:text-slate-100">{total}</span>
          </h2>
          <Link href="/dashboard/applications" className="text-xs text-brand underline">
            Open all →
          </Link>
        </div>
        {total === 0 ? (
          <p className="py-3 text-sm text-slate-500">No applications yet — create a search to start.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {stats.filter((s) => s.value > 0).map((s) => {
                const pct = (s.value / denom) * 100;
                return (
                  <Link
                    key={s.key}
                    href={s.href}
                    title={`${s.label}: ${s.value} (${pct.toFixed(0)}%)`}
                    style={{ width: `${pct}%` }}
                    className={`group relative h-full ${s.color} transition hover:brightness-110`}
                  >
                    <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow group-hover:block dark:bg-slate-100 dark:text-slate-900">
                      {s.label}: {s.value} ({pct.toFixed(0)}%)
                    </span>
                  </Link>
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {stats.map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.dot}`} />
                    {s.label} <span className="tabular-nums text-slate-400">· {s.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <RecentApplications initialTotal={total} />
    </div>
  );
}
