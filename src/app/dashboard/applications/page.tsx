"use client";
import { useEffect, useState } from "react";

type App = {
  id: string;
  jobUrl: string;
  jobTitle: string | null;
  status: string;
  matchScore: number | null;
  coverLetter: string | null;
  errorMessage: string | null;
  logs: string | null;
  createdAt: string;
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [selected, setSelected] = useState<App | null>(null);

  async function load() {
    const r = await fetch("/api/applications");
    setApps(await r.json());
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  async function retry(id: string) {
    await fetch(`/api/applications/${id}/retry`, { method: "POST" });
    load();
  }
  async function approve(id: string) {
    await fetch(`/api/applications/${id}/approve`, { method: "POST" });
    load();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
      <div>
        <h1 className="text-2xl font-bold">Applications</h1>
        <div className="card mt-4 max-h-[70vh] overflow-auto p-0">
          {apps.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={`block w-full border-b border-slate-200 p-3 text-left text-sm last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 ${selected?.id === a.id ? "bg-slate-50 dark:bg-slate-900" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate max-w-[60%]">{a.jobTitle ?? a.jobUrl}</span>
                <span className="badge bg-slate-100 dark:bg-slate-800">{a.status}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</div>
            </button>
          ))}
          {apps.length === 0 && <div className="p-6 text-center text-slate-500">No applications yet.</div>}
        </div>
      </div>

      <div>
        {selected ? (
          <div className="card space-y-4">
            <header className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">{selected.jobTitle ?? "Application"}</h2>
                <a className="text-sm text-brand underline" href={selected.jobUrl} target="_blank" rel="noreferrer">{selected.jobUrl}</a>
              </div>
              <span className="badge bg-slate-100 dark:bg-slate-800">{selected.status}</span>
            </header>
            <div className="flex gap-2">
              {selected.status === "AWAITING_APPROVAL" && (
                <button className="btn-primary" onClick={() => approve(selected.id)}>Approve &amp; submit</button>
              )}
              {(selected.status === "FAILED" || selected.status === "SKIPPED") && (
                <button className="btn-ghost" onClick={() => retry(selected.id)}>Retry</button>
              )}
            </div>
            {selected.errorMessage && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {selected.errorMessage}
              </div>
            )}
            {selected.coverLetter && (
              <div>
                <h3 className="text-sm font-semibold">Generated cover letter</h3>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">{selected.coverLetter}</pre>
              </div>
            )}
            {selected.logs && (() => {
              let parsed: any[] = [];
              try { parsed = JSON.parse(selected.logs!); } catch {}
              return Array.isArray(parsed) && parsed.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Automation log</h3>
                <div className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs font-mono dark:bg-slate-900">
                  {parsed.map((l: any, i: number) => (
                    <div key={i}>
                      <span className="text-slate-500">{l.t}</span>{" "}{l.msg}
                    </div>
                  ))}
                </div>
              </div>
              ) : null;
            })()}
          </div>
        ) : (
          <div className="card text-center text-slate-500">Select an application to view details.</div>
        )}
      </div>
    </div>
  );
}
