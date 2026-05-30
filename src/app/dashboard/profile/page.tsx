"use client";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const [p, setP] = useState<any>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch("/api/profile").then((r) => r.json()).then(setP); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const upd = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value });
  const updBool = (k: string) => (e: any) => setP({ ...p, [k]: e.target.checked });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>
      <form className="card grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={save}>
        {[
          ["fullName", "Full name"],
          ["phone", "Phone"],
          ["location", "Location"],
          ["linkedinUrl", "LinkedIn URL"],
          ["githubUrl", "GitHub URL"],
          ["portfolioUrl", "Portfolio URL"],
          ["yearsOfExperience", "Years of experience"],
          ["currentCtc", "Current CTC"],
          ["expectedCtc", "Expected CTC"],
          ["noticePeriod", "Notice period"],
          ["workAuthorization", "Work authorization"],
        ].map(([k, label]) => (
          <div key={k}>
            <label className="label">{label}</label>
            <input className="input" value={p[k] ?? ""} onChange={upd(k)} />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!p.visaSponsorship} onChange={updBool("visaSponsorship")} />
          Requires visa sponsorship
        </label>
        <div className="md:col-span-2 flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <button className="btn-primary">Save profile</button>
        </div>
      </form>
    </div>
  );
}
