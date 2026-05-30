"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await signIn("credentials", { email, password, redirect: false });
    if (r?.error) setErr("Invalid credentials");
    else router.push("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button className="btn-primary w-full" type="submit">Sign in</button>
      </form>
      <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="btn-ghost mt-3 w-full">
        Continue with Google
      </button>
      <p className="mt-6 text-center text-sm text-slate-500">
        No account? <a href="/signup" className="text-brand underline">Sign up</a>
      </p>
    </main>
  );
}
