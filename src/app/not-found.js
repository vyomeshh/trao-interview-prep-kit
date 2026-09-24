import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">404</p>
        <h1 className="mt-3 text-2xl font-black">Page not found.</h1>
        <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-indigo-500 px-4 py-2 font-bold hover:bg-indigo-400">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
