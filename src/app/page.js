import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="font-black tracking-tight text-xl">Trao</div>
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900"
          >
            Sign in
          </Link>
        </header>

        <section className="flex flex-1 items-center py-16">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">
              AI Interview Prep Kit
            </p>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              Turn one job description into a research-backed preparation plan.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              Trao extracts requirements, researches the company, searches public interview discussion,
              generates requirement-linked questions, checks coverage, schedules practice, and lets you edit the kit.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-xl bg-indigo-500 px-5 py-3 font-semibold hover:bg-indigo-400">
                Create a kit
              </Link>
              <a href="#how" className="rounded-xl border border-slate-700 px-5 py-3 font-semibold hover:bg-slate-900">
                How it works
              </a>
            </div>
          </div>
        </section>

        <section id="how" className="grid gap-4 pb-10 md:grid-cols-4">
          {[
            ["01", "Extract", "Requirements are classified as technical, behavioural, or domain and marked must/nice."],
            ["02", "Research", "Company pages are crawled and public interview discussion is searched."],
            ["03", "Cover", "Questions are checked against requirement IDs and missing must-haves trigger another pass."],
            ["04", "Practise", "Edit the kit, follow the schedule, and review weaker flashcards next."]
          ].map(([number, title, text]) => (
            <div key={number} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="text-xs font-bold text-indigo-300">{number}</div>
              <h2 className="mt-3 font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
