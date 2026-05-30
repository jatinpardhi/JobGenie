"use client";
import { useEffect, useState } from "react";

type Resume = { id: string; label: string; filePath: string; isDefault: boolean; createdAt: string };

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [label, setLabel] = useState("Default resume");
  const [file, setFile] = useState<File | null>(null);

  async function load() { setResumes(await (await fetch("/api/resumes")).json()); }
  useEffect(() => { load(); }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("label", label);
    await fetch("/api/resumes", { method: "POST", body: fd });
    setFile(null);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resumes</h1>
      <form onSubmit={upload} className="card space-y-3">
        <div>
          <label className="label">Label</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label">PDF or text resume</label>
          <input type="file" accept=".pdf,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <button className="btn-primary" disabled={!file}>Upload</button>
      </form>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr><th className="p-3">Label</th><th className="p-3">Default</th><th className="p-3">Uploaded</th></tr>
          </thead>
          <tbody>
            {resumes.map((r) => (
              <tr key={r.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="p-3">{r.label}</td>
                <td className="p-3">{r.isDefault ? "Yes" : "—"}</td>
                <td className="p-3 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {resumes.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-500">No resumes uploaded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
