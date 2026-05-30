import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          JobGenie<span className="text-brand">.</span>
        </Link>
        <nav className="flex gap-3">
          <Link href="/signin" className="btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-16 text-center">
        <h1 className="text-5xl font-bold leading-tight md:text-6xl">
          Apply to jobs on <span className="text-brand">any portal</span>,
          automatically.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
          Drop in a LinkedIn, Greenhouse, Lever, Workday or company careers link.
          JobGenie inspects the portal, fills the form, writes a tailored cover
          letter, and submits — with you in the loop.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary">Start free</Link>
          <a
            href="https://github.com/your-org/jobgenie"
            className="btn-ghost"
            target="_blank"
            rel="noreferrer"
          >
            View source
          </a>
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-6xl grid-cols-1 gap-6 px-6 pb-24 md:grid-cols-3">
        {[
          {
            t: "Dynamic portal understanding",
            d: "No hardcoded selectors. JobGenie inspects any portal and learns its form on the fly.",
          },
          {
            t: "Smart profile memory",
            d: "Answer screening questions once — JobGenie reuses your answers everywhere.",
          },
          {
            t: "Human-in-the-loop",
            d: "Review mapped fields and the AI cover letter before anything is submitted.",
          },
        ].map((f) => (
          <div key={f.t} className="card">
            <h3 className="text-lg font-semibold">{f.t}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
