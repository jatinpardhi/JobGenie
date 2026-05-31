"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QuestionsForm, type Question } from "../_components/QuestionsForm";

type ProfileSummary = {
  id: string;
  portal: string;
  sampleUrl: string | null;
  completed: boolean;
  questionCount: number;
  answered: number;
  totalRequired: number;
  pendingRequired: number;
  updatedAt: string;
};

type ProfileDetail = {
  id: string;
  portal: string;
  sampleUrl: string | null;
  completed: boolean;
  questions: (Question & { currentAnswer?: string })[];
};

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

function prettyPortal(p: string) {
  return PORTAL_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

export default function PortalsPage() {
  const [list, setList] = useState<ProfileSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadList() {
    try {
      const r = await fetch("/api/portal-profiles");
      if (r.ok) setList(await r.json());
    } catch {}
  }
  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 5000);
    return () => clearInterval(t);
  }, []);

  async function loadDetail(id: string) {
    setLoading(true);
    setSelectedId(id);
    setDetail(null);
    setValues({});
    try {
      const r = await fetch(`/api/portal-profiles/${id}`);
      if (r.ok) {
        const d = (await r.json()) as ProfileDetail;
        setDetail(d);
        // Seed values from existing saved answers (so user sees what's already filled).
        const seed: Record<string, string> = {};
        for (const q of d.questions) {
          if (q.currentAnswer) seed[q.label] = q.currentAnswer;
        }
        setValues(seed);
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!detail) return;
    setSaving(true);
    try {
      await fetch(`/api/portal-profiles/${detail.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: values }),
      });
      await loadList();
      await loadDetail(detail.id);
    } finally {
      setSaving(false);
    }
  }

  const incomplete = useMemo(() => list.filter((p) => !p.completed), [list]);
  const completed = useMemo(() => list.filter((p) => p.completed), [list]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Portal profiles</h1>
          <span className="text-xs text-slate-500">{list.length} portals</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Fill these question sets <strong>once per portal</strong>. JobGenie reuses your
          answers for every future job on that portal automatically.
        </p>

        {list.length === 0 && (
          <div className="card mt-4 p-6 text-center text-sm text-slate-500">
            No portals discovered yet. Run an apply on any job and we'll learn its
            portal questions automatically.
          </div>
        )}

        {incomplete.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Needs your input
            </div>
            <div className="card p-0">
              {incomplete.map((p) => <Row key={p.id} p={p} active={p.id === selectedId} onClick={() => loadDetail(p.id)} />)}
            </div>
          </div>
        )}
        {completed.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-300">
              Ready to auto-apply
            </div>
            <div className="card p-0">
              {completed.map((p) => <Row key={p.id} p={p} active={p.id === selectedId} onClick={() => loadDetail(p.id)} />)}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0">
        {!selectedId && (
          <div className="card flex h-64 items-center justify-center text-center text-sm text-slate-500">
            Select a portal on the left to fill in its standard questions.
          </div>
        )}
        {selectedId && loading && (
          <div className="card p-6 text-sm text-slate-500">Loading…</div>
        )}
        {detail && (
          <div className="card space-y-4">
            <header className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{prettyPortal(detail.portal)}</h2>
                {detail.completed ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">READY</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">FILL ME</span>
                )}
              </div>
              {detail.sampleUrl && (
                <a href={detail.sampleUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand underline">
                  Example job: {detail.sampleUrl}
                </a>
              )}
              <p className="text-xs text-slate-500">
                {detail.questions.length} question{detail.questions.length === 1 ? "" : "s"} for this portal.
                Required fields are marked with <span className="text-red-500">*</span>.
              </p>
            </header>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <QuestionsForm
                questions={detail.questions}
                values={values}
                onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                keyByLabel
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-[11px] text-slate-500">
                Saved here = used on every future {prettyPortal(detail.portal)} job.
              </span>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save answers"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ p, active, onClick }: { p: ProfileSummary; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 transition dark:border-slate-800 ${active ? "bg-brand/5 dark:bg-brand/10" : "hover:bg-slate-50 dark:hover:bg-slate-900/60"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{prettyPortal(p.portal)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {p.answered}/{p.questionCount} answered
            {p.totalRequired > 0 && (
              <> · {p.pendingRequired} required pending</>
            )}
          </div>
        </div>
        {p.completed ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">READY</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">FILL</span>
        )}
      </div>
    </button>
  );
}
