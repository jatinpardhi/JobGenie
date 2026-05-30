"use client";
import { useEffect, useState } from "react";

type Answer = { id: string; questionText: string; answer: string; fieldType: string | null; updatedAt: string };

export default function AnswersPage() {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  async function load() { setAnswers(await (await fetch("/api/answers")).json()); }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/answers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionText: q, answer: a }),
    });
    setQ(""); setA("");
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Saved answers</h1>
      <p className="text-sm text-slate-500">Reusable answers JobGenie will use whenever a portal asks the same question.</p>
      <form onSubmit={save} className="card grid grid-cols-1 gap-3 md:grid-cols-2">
        <input className="input" placeholder="Question" value={q} onChange={(e) => setQ(e.target.value)} required />
        <input className="input" placeholder="Answer" value={a} onChange={(e) => setA(e.target.value)} required />
        <button className="btn-primary md:col-span-2">Save</button>
      </form>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr><th className="p-3">Question</th><th className="p-3">Answer</th><th className="p-3">Updated</th></tr>
          </thead>
          <tbody>
            {answers.map((a) => (
              <tr key={a.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="p-3">{a.questionText}</td>
                <td className="p-3">{a.answer}</td>
                <td className="p-3 text-slate-500">{new Date(a.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            {answers.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-500">No saved answers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
