import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 p-6 dark:border-slate-800 md:block">
        <Link href="/" className="text-lg font-bold">JobGenie<span className="text-brand">.</span></Link>
        <nav className="mt-8 flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Overview</Link>
          <Link href="/dashboard/searches" className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Searches</Link>
          <Link href="/dashboard/applications" className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Applications</Link>
          <Link href="/dashboard/profile" className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Profile</Link>
          <Link href="/dashboard/resumes" className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Resumes</Link>
          <Link href="/dashboard/answers" className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Saved answers</Link>
        </nav>
      </aside>
      <main className="md:pl-60">
        <div className="mx-auto max-w-5xl p-6">{children}</div>
      </main>
    </div>
  );
}
