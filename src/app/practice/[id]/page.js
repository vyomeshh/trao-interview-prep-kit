"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

export default function PracticePage() {
  const { id } = useParams();
  const router = useRouter();
  const [kit, setKit] = useState(null);
  const [index, setIndex] = useState(0);
  const [sessionCards, setSessionCards] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await api.get(`/kits/${id}`);
        if (cancelled) return;
        const loaded = response.data.kitData || response.data;
        setKit(loaded);
        setSessionCards([...(loaded.flashcards || [])].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || "Could not load this kit.");
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [id]);

  const cards = sessionCards;

  async function rate(confidence) {
    const current = cards[index];
    if (!current) return;

    const updated = kit.flashcards.map((card) =>
      card.id === current.id
        ? { ...card, confidence, last_reviewed: new Date().toISOString() }
        : card
    );

    setKit((value) => ({ ...value, flashcards: updated }));
    setSessionCards((value) =>
      value.map((item) =>
        item.id === current.id
          ? { ...item, confidence, last_reviewed: new Date().toISOString() }
          : item,
      ),
    );
    setFlipped(false);

    setSaving(true);
    try {
      await api.put(`/kits/${id}/progress`, { flashcards: updated });
    } catch (err) {
      setError(err.response?.data?.error || "Could not save practice progress.");
    } finally {
      setSaving(false);
    }

    if (index < cards.length - 1) setIndex(index + 1);
    else setComplete(true);
  }

  const reviewed = kit?.flashcards?.filter((card) => card.confidence !== undefined).length || 0;
  const weakSpots = useMemo(() => {
    if (!kit?.role?.requirements) return [];
    const flashcards = kit.flashcards || [];
    const byRequirement = new Map(kit.role.requirements.map((requirement) => [requirement.id, {
      ...requirement,
      total: 0,
      count: 0
    }]));

    for (const card of flashcards) {
      for (const requirementId of card.requirement_ids || []) {
        const item = byRequirement.get(requirementId);
        if (!item) continue;
        item.total += card.confidence ?? 0;
        item.count += 1;
      }
    }

    return [...byRequirement.values()]
      .map((item) => ({ ...item, average: item.count ? item.total / item.count : 0 }))
      .sort((a, b) => (a.priority === "must" ? -1 : 1) - (b.priority === "must" ? -1 : 1) || a.average - b.average)
      .slice(0, 3);
  }, [kit]);

  if (!kit) {
    return <main className="min-h-screen bg-slate-950 p-8 text-slate-300">{error || "Loading practice…"}</main>;
  }

  const current = cards[index];

  if (complete) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-6">
        <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="text-sm font-bold uppercase tracking-widest text-emerald-300">Session complete</div>
          <h1 className="mt-3 text-3xl font-black">Your confidence data is saved.</h1>
          <p className="mt-3 text-sm text-slate-400">Start another session to review the least-confident cards first.</p>
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4 text-left">
            <div className="text-xs font-bold uppercase tracking-widest text-indigo-300">Weak spots</div>
            <div className="mt-3 space-y-2">
              {weakSpots.length === 0 && <div className="text-sm text-slate-500">No extracted requirements yet.</div>}
              {weakSpots.map((spot) => (
                <div key={spot.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 p-3">
                  <div>
                    <div className="text-sm font-semibold">{spot.text}</div>
                    <div className="mt-1 text-xs text-slate-500">{spot.priority} · {spot.count ? `${spot.average.toFixed(1)}/4 average` : "not reviewed"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => { setSessionCards([...cards].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))); setIndex(0); setComplete(false); }} className="flex-1 rounded-lg bg-indigo-500 px-4 py-3 font-bold hover:bg-indigo-400">Review again</button>
            <Link href={`/builder/${id}`} className="flex-1 rounded-lg border border-slate-700 px-4 py-3 font-bold hover:bg-slate-800">Back to builder</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/builder/${id}`} className="text-sm text-slate-400 hover:text-white">← Builder</Link>
          <div className="text-sm text-slate-400">{reviewed}/{kit.flashcards.length} reviewed</div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-2xl font-black">Practice mode</h1>
          <p className="mt-1 text-sm text-slate-400">Least-confident cards come first in each session.</p>

          {!current ? (
            <div className="mt-10 text-center">
              <div className="text-xl font-bold">No flashcards available.</div>
              <button onClick={() => router.push(`/builder/${id}`)} className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 font-bold">Back to builder</button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setFlipped((value) => !value)}
                className="mt-8 min-h-[320px] w-full rounded-2xl border border-slate-700 bg-slate-950 p-8 text-left transition hover:border-indigo-500"
                aria-label={flipped ? "Hide flashcard answer" : "Reveal flashcard answer"}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setFlipped((value) => !value);
                  }
                }}
              >
                <div className="text-xs font-bold uppercase tracking-widest text-indigo-300">
                  {flipped ? "Answer" : "Question"}
                </div>
                <div className="mt-6 text-2xl font-semibold leading-relaxed">
                  {flipped ? current.back : current.front}
                </div>
                {!flipped && <div className="mt-10 text-sm text-slate-500">Press Enter or click to reveal</div>}
              </button>

              {flipped && (
                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((score) => (
                    <button
                      key={score}
                      disabled={saving}
                      onClick={() => rate(score)}
                      className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold hover:border-indigo-500 disabled:opacity-50"
                    >
                      {score}/4
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                <span>Card {index + 1} of {cards.length}</span>
                <span>Requirement {current.requirement_ids.join(", ")}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
