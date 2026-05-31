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

const STATUS_PILL: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  SUBMITTED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  NEEDS_INFO: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  SKIPPED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const PAGE_SIZE = 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const userId = await requireUserId();
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [total, submitted, pending, failed, awaiting, incompletePortals, recent] = await Promise.all([
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
    prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stats: Array<{ label: string; value: number; href: string; accent?: string }> = [
    { label: "Total", value: total, href: "/dashboard/applications" },
    { label: "Submitted", value: submitted, href: "/dashboard/applications?status=SUBMITTED", accent: "text-green-700 dark:text-green-400" },
    { label: "In progress", value: pending, href: "/dashboard/applications?status=RUNNING", accent: "text-blue-700 dark:text-blue-400" },
    { label: "Needs approval", value: awaiting, href: "/dashboard/applications?status=AWAITING_APPROVAL", accent: "text-amber-700 dark:text-amber-400" },
    { label: "Failed", value: failed, href: "/dashboard/applications?status=FAILED", accent: "text-red-700 dark:text-red-400" },
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
          <Link
            key={s.label}
            href={s.href}
            className="card group transition hover:border-brand hover:shadow-md"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${s.accent ?? ""}`}>{s.value}</p>
            <p className="mt-1 text-[10px] text-slate-400 opacity-0 transition group-hover:opacity-100">
              View →
            </p>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent applications</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              Showing {recent.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
              {(page - 1) * PAGE_SIZE + recent.length} of {total}
            </span>
            <Link href="/dashboard/applications" className="text-brand underline">
              Open all →
            </Link>
          </div>
        </div>
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
              {recent.map((a) => {
                const pill = STATUS_PILL[a.status] ?? STATUS_PILL.PENDING;
                return (
                  <tr key={a.id} className="border-t border-slate-200 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/40">
                    <td className="p-3">
                      <Link
                        className="text-brand underline"
                        href={`/dashboard/applications?status=${a.status}`}
                      >
                        {a.jobTitle ?? a.jobUrl}
                      </Link>
                      {a.company && (
                        <span className="ml-2 text-xs text-slate-500">· {a.company}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3">{a.matchScore != null ? a.matchScore.toFixed(2) : "—"}</td>
                    <td className="p-3 text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr><td className="p-6 text-center text-slate-500" colSpan={4}>
                  {page > 1 ? "No applications on this page." : "No applications yet — create a search."}
                </td></tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
              <span className="text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <PageLink page={1} disabled={page === 1} label="« First" />
                <PageLink page={page - 1} disabled={page <= 1} label="‹ Prev" />
                <PageLink page={page + 1} disabled={page >= totalPages} label="Next ›" />
                <PageLink page={totalPages} disabled={page === totalPages} label="Last »" />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="rounded border border-slate-200 px-2 py-1 text-slate-400 dark:border-slate-800">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/dashboard?page=${page}`}
      className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-300"
    >
      {label}
    </Link>
  );
}
