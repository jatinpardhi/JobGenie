"use client";
import { useMemo } from "react";

export type Question = {
  fieldId?: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

type Props = {
  questions: Question[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** When true, use `label` as the dictionary key (portal-profile mode).
   *  When false, use `fieldId` (per-application mode). */
  keyByLabel?: boolean;
};

/**
 * Renders a list of detected form questions as native-looking inputs:
 *   - radio-group  → radio buttons
 *   - checkbox-group → checkbox list (multi-select; value is "a, b, c")
 *   - select / many options → <select>
 *   - textarea / long label → <textarea>
 *   - email / tel / text → <input type=...>
 *   - checkbox (single) → checkbox (value "yes"/"no")
 */
export function QuestionsForm({ questions, values, onChange, keyByLabel = false }: Props) {
  const keyFor = (q: Question) => (keyByLabel ? q.label : q.fieldId ?? q.label);

  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const key = keyFor(q);
        const val = values[key] ?? "";
        const opts = (q.options ?? []).filter(Boolean);
        const isMany = opts.length > 12;
        return (
          <div key={`${key}-${i}`} className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {q.label || q.fieldId || `Question ${i + 1}`}
              {q.required && <span className="ml-1 text-red-500">*</span>}
              <span className="ml-2 text-[10px] font-normal text-slate-400">{q.type}</span>
            </label>

            {q.type === "radio-group" && opts.length > 0 ? (
              <RadioGroup name={`q-${i}`} value={val} options={opts} onChange={(v) => onChange(key, v)} />
            ) : q.type === "checkbox-group" && opts.length > 0 ? (
              <CheckboxGroup value={val} options={opts} onChange={(v) => onChange(key, v)} />
            ) : q.type === "checkbox" ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={/^(yes|true|1|on)$/i.test(val)}
                  onChange={(e) => onChange(key, e.target.checked ? "yes" : "no")}
                />
                <span className="text-slate-600 dark:text-slate-300">Yes</span>
              </label>
            ) : opts.length > 0 && !isMany ? (
              <select
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={val}
                onChange={(e) => onChange(key, e.target.value)}
              >
                <option value="">— select —</option>
                {opts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : opts.length > 0 && isMany ? (
              <input
                list={`opts-${i}`}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={val}
                placeholder={q.placeholder || `Type to search ${opts.length} options…`}
                onChange={(e) => onChange(key, e.target.value)}
              />
            ) : q.type === "textarea" || (q.label && q.label.length > 80) ? (
              <textarea
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                rows={3}
                placeholder={q.placeholder || ""}
                value={val}
                onChange={(e) => onChange(key, e.target.value)}
              />
            ) : (
              <input
                type={q.type === "email" ? "email" : q.type === "tel" ? "tel" : q.type === "url" ? "url" : "text"}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder={q.placeholder || ""}
                value={val}
                onChange={(e) => onChange(key, e.target.value)}
              />
            )}

            {opts.length > 12 && (
              <datalist id={`opts-${i}`}>
                {opts.map((o) => <option key={o} value={o} />)}
              </datalist>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RadioGroup({ name, value, options, onChange }: { name: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <label key={o} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="radio"
            name={name}
            value={o}
            checked={value === o}
            onChange={() => onChange(o)}
          />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxGroup({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const selected = useMemo(
    () => new Set(value.split(",").map((s) => s.trim()).filter(Boolean)),
    [value]
  );
  const toggle = (o: string) => {
    const next = new Set(selected);
    if (next.has(o)) next.delete(o); else next.add(o);
    onChange(Array.from(next).join(", "));
  };
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <label key={o} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}
