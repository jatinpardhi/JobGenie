"use client";
import { useEffect, useState } from "react";

type Search = {
  id: string;
  portalUrl: string;
  keywords: string;
  active: boolean;
  createdAt: string;
  lastRunAt?: string | null;
  lastJobCount?: number | null;
  lastStatus?: string | null;
  lastError?: string | null;
  lastProgress?: string | null;
};

export default function SearchesPage() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [portalUrl, setPortalUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/searches");
    setSearches(await r.json());
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // poll so RUNNING -> OK/ERROR updates live
    return () => clearInterval(t);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalUrl, keywords, filters: { workMode, location }, runNow: true }),
    });
    setPortalUrl(""); setKeywords("");
    setBusy(false);
    load();
  }

  async function rerun(id: string) {
    await fetch(`/api/searches/${id}/rerun`, { method: "POST" });
    load();
  }

  function statusBadge(s: Search) {
    const tone: Record<string, string> = {
      OK: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      ERROR: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      RUNNING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    };
    const label = s.lastStatus ?? "—";
    const cls = tone[label] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Searches</h1>

      <form onSubmit={create} className="card grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">Portal URL (LinkedIn, Greenhouse, Lever, Workday, careers page…)</label>
          <input className="input" value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} placeholder="https://boards.greenhouse.io/airbnb" required />
          <p className="mt-1 text-xs text-slate-500">
            Tip: many consumer job aggregators (remote.co, indeed, linkedin without login) actively block automated browsers.
            For best results, point at a company&apos;s Greenhouse, Lever, Workday, or Ashby page.
          </p>
        </div>
        <div>
          <label className="label">Keywords / job title</label>
          <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Software Engineer" required />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote / Bengaluru / NYC" />
        </div>
        <div>
          <label className="label">Work mode</label>
          <select className="input" value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
            <option value="">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button className="btn-primary" disabled={busy} type="submit">
            {busy ? "Starting…" : "Run search"}
          </button>
        </div>
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="p-3">Portal</th>
              <th className="p-3">Keywords</th>
              <th className="p-3">Status</th>
              <th className="p-3">Jobs found</th>
              <th className="p-3">Last run</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {searches.map((s) => (
              <>
                <tr key={s.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="p-3 truncate max-w-xs">{s.portalUrl}</td>
                  <td className="p-3">{s.keywords}</td>
                  <td className="p-3">
                    {statusBadge(s)}
                    {s.lastProgress && (
                      <div className="mt-1 text-xs text-slate-500 max-w-[18rem] truncate" title={s.lastProgress}>
                        {s.lastProgress}
                      </div>
                    )}
                  </td>
                  <td className="p-3">{s.lastJobCount ?? "—"}</td>
                  <td className="p-3 text-slate-500">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => rerun(s.id)} className="text-indigo-600 hover:underline text-xs">
                      Re-run
                    </button>
                  </td>
                </tr>
                {s.lastError && (
                  <tr key={s.id + "-err"} className="bg-red-50/50 dark:bg-red-950/30">
                    <td colSpan={6} className="px-3 pb-3 text-xs text-red-700 dark:text-red-300">
                      {s.lastError}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {searches.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No searches yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
