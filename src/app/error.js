"use client";

export default function ErrorPage({ error, reset }) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-lg rounded-2xl border border-red-900 bg-slate-900 p-8">
        <p className="text-sm font-bold uppercase tracking-widest text-red-300">Unexpected error</p>
        <h1 className="mt-3 text-2xl font-black">Something went wrong.</h1>
        <p className="mt-3 text-sm text-slate-400">{error?.message || "The page could not be loaded."}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white hover:bg-indigo-400"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
