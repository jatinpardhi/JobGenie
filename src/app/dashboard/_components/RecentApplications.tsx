"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type App = {
  id: string;
  jobUrl: string;
  jobTitle: string | null;
  company: string | null;
  status: string;
  matchScore: number | null;
  createdAt: string;
};

const PAGE_SIZE = 15;

const STATUS_PILL: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  SUBMITTED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  NEEDS_INFO: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  SKIPPED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function RecentApplications({ initialTotal }: { initialTotal: number }) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [total, setTotal] = useState(initialTotal);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/applications?skip=${apps.length}&take=${PAGE_SIZE}`);
      if (!r.ok) return;
      const next: App[] = await r.json();
      const tot = Number(r.headers.get("x-total-count") || "0");
      if (tot) setTotal(tot);
      setApps((prev) => [...prev, ...next]);
      if (next.length < PAGE_SIZE || apps.length + next.length >= tot) setDone(true);
    } finally {
      setLoading(false);
    }
  }, [apps.length, loading, done]);

  // Initial load
  useEffect(() => { loadMore(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Scroll-triggered loading inside the card's own scroll container
  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: "200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Recent applications</h2>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            Showing {apps.length} of {total}
          </span>
          <Link href="/dashboard/applications" className="text-brand underline">
            Open all →
          </Link>
        </div>
      </div>
      <div className="card mt-3 overflow-hidden p-0">
        <div ref={scrollRef} className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="p-3">Job</th>
              <th className="p-3">Status</th>
              <th className="p-3">Score</th>
              <th className="p-3">When</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => {
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
            {apps.length === 0 && !loading && (
              <tr><td className="p-6 text-center text-slate-500" colSpan={4}>
                No applications yet — create a search.
              </td></tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} className="flex items-center justify-center px-3 py-4 text-xs text-slate-500">
          {loading ? "Loading…" : done ? (apps.length > 0 ? "End of list" : "") : "Scroll to load more"}
        </div>
        </div>
      </div>
    </section>
  );
}
