"use client";
import { useEffect, useState } from "react";

type Search = { id: string; portalUrl: string; keywords: string; active: boolean; createdAt: string };

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
  useEffect(() => { load(); }, []);

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

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Searches</h1>

      <form onSubmit={create} className="card grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">Portal URL (LinkedIn, Greenhouse, Lever, Workday, careers page…)</label>
          <input className="input" value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} placeholder="https://boards.greenhouse.io/acme" required />
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
            <tr><th className="p-3">Portal</th><th className="p-3">Keywords</th><th className="p-3">Created</th></tr>
          </thead>
          <tbody>
            {searches.map((s) => (
              <tr key={s.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="p-3 truncate max-w-xs">{s.portalUrl}</td>
                <td className="p-3">{s.keywords}</td>
                <td className="p-3 text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {searches.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-500">No searches yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
