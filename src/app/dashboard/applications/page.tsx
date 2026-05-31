"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QuestionsForm } from "../_components/QuestionsForm";

type App = {
  id: string;
  jobUrl: string;
  jobTitle: string | null;
  company: string | null;
  status: string;
  matchScore: number | null;
  coverLetter: string | null;
  errorMessage: string | null;
  progressMessage: string | null;
  logs: string | null;
  formSnapshot: string | null;
  createdAt: string;
  appliedAt: string | null;
};

type PendingQuestion = {
  fieldId: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

type StatusKey =
  | "ALL"
  | "AWAITING_APPROVAL"
  | "RUNNING"
  | "SUBMITTED"
  | "NEEDS_INFO"
  | "FAILED";

const STATUS_META: Record<string, { label: string; pill: string; dot: string }> = {
  PENDING:           { label: "Pending",   pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", dot: "bg-slate-400" },
  RUNNING:           { label: "Running",   pill: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",     dot: "bg-blue-500 animate-pulse" },
  AWAITING_APPROVAL: { label: "Review",    pill: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300", dot: "bg-amber-500" },
  SUBMITTED:         { label: "Submitted", pill: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", dot: "bg-green-500" },
  NEEDS_INFO:        { label: "Needs info",pill: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300", dot: "bg-orange-500" },
  SKIPPED:           { label: "Skipped",   pill: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", dot: "bg-slate-400" },
  FAILED:            { label: "Failed",    pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",         dot: "bg-red-500" },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label.toUpperCase()}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusKey>("ALL");
  const [showLog, setShowLog] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [portals, setPortals] = useState<
    Array<{ id: string; portal: string; completed: boolean; pendingRequired: number; questionCount: number }>
  >([]);

  async function load() {
    try {
      const r = await fetch("/api/applications");
      if (r.ok) setApps(await r.json());
    } catch {}
    try {
      const r2 = await fetch("/api/portal-profiles");
      if (r2.ok) setPortals(await r2.json());
    } catch {}
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const selected = apps.find((a) => a.id === selectedId) ?? null;

  // Reset draft answers when switching apps.
  useEffect(() => {
    setDraftAnswers({});
  }, [selectedId]);

  const snapshot = useMemo<{ pendingQuestions: PendingQuestion[]; ctaClicked?: boolean; finalUrl?: string } | null>(() => {
    if (!selected?.formSnapshot) return null;
    try {
      const s = JSON.parse(selected.formSnapshot);
      return {
        pendingQuestions: Array.isArray(s.pendingQuestions) ? s.pendingQuestions : [],
        ctaClicked: s.ctaClicked,
        finalUrl: s.finalUrl,
      };
    } catch {
      return null;
    }
  }, [selected?.formSnapshot]);

  const pending = snapshot?.pendingQuestions ?? [];
  const showQA = pending.length > 0 && (selected?.status === "AWAITING_APPROVAL" || selected?.status === "NEEDS_INFO");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: apps.length };
    for (const a of apps) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [apps]);

  const visible = useMemo(
    () => (filter === "ALL" ? apps : apps.filter((a) => a.status === filter)),
    [apps, filter]
  );

  async function retry(id: string) {
    setBusyId(id);
    try { await fetch(`/api/applications/${id}/retry`, { method: "POST" }); }
    finally { setBusyId(null); load(); }
  }
  async function approve(id: string) {
    setBusyId(id);
    try { await fetch(`/api/applications/${id}/approve`, { method: "POST" }); }
    finally { setBusyId(null); load(); }
  }
  async function saveAnswers(id: string) {
    setSavingAnswers(true);
    try {
      await fetch(`/api/applications/${id}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: draftAnswers }),
      });
      setDraftAnswers({});
    } finally {
      setSavingAnswers(false);
      load();
    }
  }

  const filterChips: { key: StatusKey; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "AWAITING_APPROVAL", label: "Review" },
    { key: "RUNNING", label: "Running" },
    { key: "SUBMITTED", label: "Submitted" },
    { key: "NEEDS_INFO", label: "Needs info" },
    { key: "FAILED", label: "Failed" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* LEFT: list */}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Applications</h1>
          <span className="text-xs text-slate-500">{apps.length} total · auto-refresh 3s</span>
        </div>

        {/* Portal-attention banner — surfaces portals where the user needs
            to fill standard questions once so future apps auto-fill. */}
        {portals.some((p) => !p.completed) && (
          <Link
            href="/dashboard/portals"
            className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
          >
            <span className="mt-0.5 text-amber-600 dark:text-amber-400">⚠</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                {portals.filter((p) => !p.completed).length} portal
                {portals.filter((p) => !p.completed).length === 1 ? "" : "s"} need setup
              </span>
              <span className="ml-1 opacity-80">
                — fill standard questions once for{" "}
                {portals
                  .filter((p) => !p.completed)
                  .slice(0, 3)
                  .map((p) => p.portal)
                  .join(", ")}
                {portals.filter((p) => !p.completed).length > 3 ? "…" : ""}
                {" "}so every future job on those portals auto-fills.
              </span>
            </span>
            <span className="shrink-0 underline">Open Portals →</span>
          </Link>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {filterChips.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-brand text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 ${active ? "opacity-80" : "text-slate-400"}`}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="card mt-4 max-h-[72vh] overflow-auto p-0">
          {visible.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              {apps.length === 0
                ? "No applications yet. Run a search to get started."
                : "No applications match this filter."}
            </div>
          )}
          {visible.map((a) => {
            const isSel = selectedId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 transition dark:border-slate-800 ${
                  isSel
                    ? "bg-brand/5 dark:bg-brand/10"
                    : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.jobTitle ?? a.jobUrl}
                    </div>
                    {a.company && (
                      <div className="truncate text-xs text-slate-500">{a.company}</div>
                    )}
                  </div>
                  <StatusPill status={a.status} />
                </div>
                {a.progressMessage && (
                  <div
                    className="mt-1.5 truncate text-xs text-slate-600 dark:text-slate-400"
                    title={a.progressMessage}
                  >
                    {a.progressMessage}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{timeAgo(a.createdAt)}</span>
                  {a.matchScore != null && (
                    <>
                      <span>·</span>
                      <span>match {Math.round(a.matchScore * 100)}%</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT: detail */}
      <div className="min-w-0">
        {selected ? (
          <div className="card space-y-4">
            {/* Header */}
            <header className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-xl font-semibold">
                  {selected.jobTitle ?? "Application"}
                </h2>
                <StatusPill status={selected.status} />
              </div>
              {selected.company && (
                <div className="text-sm text-slate-600 dark:text-slate-400">{selected.company}</div>
              )}
              <a
                className="block truncate text-xs text-brand underline"
                href={selected.jobUrl}
                target="_blank"
                rel="noreferrer"
                title={selected.jobUrl}
              >
                {selected.jobUrl}
              </a>
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span>Created {timeAgo(selected.createdAt)}</span>
                {selected.appliedAt && <span>Applied {timeAgo(selected.appliedAt)}</span>}
                {selected.matchScore != null && (
                  <span>Match {Math.round(selected.matchScore * 100)}%</span>
                )}
              </div>
            </header>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 py-3 dark:border-slate-800">
              {selected.status === "AWAITING_APPROVAL" && (
                <button
                  className="btn-primary disabled:opacity-50"
                  disabled={busyId === selected.id || pending.length > 0}
                  onClick={() => approve(selected.id)}
                  title={pending.length > 0 ? "Answer the pending questions below first" : undefined}
                >
                  {busyId === selected.id
                    ? "Submitting…"
                    : pending.length > 0
                      ? `Answer ${pending.length} question${pending.length === 1 ? "" : "s"} first`
                      : "Approve & submit"}
                </button>
              )}
              {(selected.status === "FAILED" ||
                selected.status === "SKIPPED" ||
                selected.status === "NEEDS_INFO") && (
                <button
                  className="btn-ghost disabled:opacity-50"
                  disabled={busyId === selected.id}
                  onClick={() => retry(selected.id)}
                >
                  {busyId === selected.id ? "Restarting…" : "Retry"}
                </button>
              )}
              {selected.status === "RUNNING" && (
                <span className="inline-flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Pipeline running — see live log below
                </span>
              )}
              {selected.status === "SUBMITTED" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                  ✓ Successfully submitted
                </span>
              )}
            </div>

            {/* Current step */}
            {selected.progressMessage && selected.status !== "FAILED" && (
              <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50/60 px-3 py-2 text-sm text-slate-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-slate-200">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Current step
                </div>
                <div className="mt-0.5 break-words">{selected.progressMessage}</div>
              </div>
            )}

            {/* Error / Needs-info message */}
            {selected.errorMessage && (
              <div
                className={`rounded-lg border-l-4 px-3 py-2 text-sm ${
                  selected.status === "NEEDS_INFO"
                    ? "border-orange-400 bg-orange-50/60 text-orange-900 dark:border-orange-600 dark:bg-orange-950/30 dark:text-orange-200"
                    : "border-red-400 bg-red-50/60 text-red-800 dark:border-red-600 dark:bg-red-950/30 dark:text-red-300"
                }`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    selected.status === "NEEDS_INFO"
                      ? "text-orange-700 dark:text-orange-300"
                      : "text-red-700 dark:text-red-300"
                  }`}
                >
                  {selected.status === "NEEDS_INFO" ? "Manual action required" : "Error"}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap break-words">{selected.errorMessage}</div>
              </div>
            )}

            {/* Pending questions — interactive Q&A */}
            {showQA && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-900">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Questions for you
                  </div>
                  <div className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                    {pending.length} field{pending.length === 1 ? "" : "s"} on the application form need your input
                    {snapshot?.ctaClicked ? " (form opened by clicking Apply Now)" : ""}.
                  </div>
                </div>
                <div className="space-y-3 px-3 py-3">
                  <QuestionsForm
                    questions={pending}
                    values={draftAnswers}
                    onChange={(k, v) => setDraftAnswers((d) => ({ ...d, [k]: v }))}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">
                      Your answers are saved and reused for similar future questions.
                    </span>
                    <button
                      className="btn-primary disabled:opacity-50"
                      disabled={
                        savingAnswers ||
                        Object.values(draftAnswers).every((v) => !v || !v.trim())
                      }
                      onClick={() => saveAnswers(selected.id)}
                    >
                      {savingAnswers ? "Saving…" : "Save answers"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Cover letter */}
            {selected.coverLetter && (
              <details className="group rounded-lg border border-slate-200 dark:border-slate-800" open>
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Generated cover letter
                  <span className="ml-2 text-[11px] font-normal text-slate-400">
                    {selected.coverLetter.length} chars
                  </span>
                </summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  {selected.coverLetter}
                </pre>
              </details>
            )}

            {/* Automation log */}
            {selected.logs && (() => {
              let parsed: any[] = [];
              try { parsed = JSON.parse(selected.logs!); } catch {}
              if (!Array.isArray(parsed) || parsed.length === 0) return null;
              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setShowLog((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span>
                      Automation log
                      <span className="ml-2 text-[11px] font-normal text-slate-400">
                        {parsed.length} events
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">{showLog ? "Hide" : "Show"}</span>
                  </button>
                  {showLog && (
                    <div className="max-h-80 overflow-auto border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono dark:border-slate-800 dark:bg-slate-900/60">
                      {parsed.map((l: any, i: number) => (
                        <div key={i} className="flex gap-2 py-0.5">
                          <span className="shrink-0 text-slate-400">
                            {(l.t ?? "").slice(11, 19)}
                          </span>
                          <span className="break-words">{l.msg}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="card flex h-64 items-center justify-center text-center text-sm text-slate-500">
            <div>
              <div className="text-2xl">👈</div>
              <div className="mt-2">Select an application to view details</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
