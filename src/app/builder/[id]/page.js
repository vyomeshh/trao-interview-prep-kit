"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

const categories = ["technical", "behavioural", "system-design", "company-fit"];

export default function BuilderPage() {
  const { id } = useParams();
  const router = useRouter();
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  const loadKit = useCallback(async () => {
    try {
      const response = await api.get(`/kits/${id}`);
      if (response.data.status === "processing" || response.data.status === "failed") {
        setKit(response.data);
      } else {
        setKit(response.data.kitData || response.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Could not load this kit.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await api.get(`/kits/${id}`);
        if (cancelled) return;
        if (response.data.status === "processing" || response.data.status === "failed") {
          setKit(response.data);
        } else {
          setKit(response.data.kitData || response.data);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || "Could not load this kit.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (kit?.status !== "processing") return undefined;
    const timer = setInterval(() => {
      void loadKit();
    }, 1600);
    return () => clearInterval(timer);
  }, [kit?.status, loadKit]);

  const questionCount = kit?.questions?.length || 0;
  const mustCount = kit?.role?.requirements?.filter((r) => r.priority === "must").length || 0;

  const coverageText = useMemo(() => {
    if (!kit?.coverage) return "";
    return kit.coverage.uncovered_requirement_ids.length === 0
      ? "All must-have requirements are covered."
      : `${kit.coverage.uncovered_requirement_ids.length} must-have requirement(s) need attention.`;
  }, [kit]);

  async function save(nextKit = kit) {
    setSaving(true);
    setError("");
    try {
      const response = await api.put(`/kits/${id}`, { kitData: nextKit });
      setKit(response.data.kitData || response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  function updateBrief(field, value) {
    setKit((current) => ({
      ...current,
      company_brief: { ...current.company_brief, [field]: value, _state: "edited" }
    }));
  }

  function updateQuestion(qid, field, value) {
    setKit((current) => ({
      ...current,
      questions: current.questions.map((q) =>
        q.id === qid ? { ...q, [field]: value, _state: "edited" } : q
      )
    }));
  }

  function updateFlashcard(fid, field, value) {
    setKit((current) => ({
      ...current,
      flashcards: current.flashcards.map((card) =>
        card.id === fid ? { ...card, [field]: value, _state: "edited" } : card
      )
    }));
  }

  function deleteQuestion(qid) {
    setKit((current) => ({
      ...current,
      questions: current.questions.filter((q) => q.id !== qid),
      schedule: {
        ...current.schedule,
        days: current.schedule.days.map((day) => ({
          ...day,
          question_ids: day.question_ids.filter((idValue) => idValue !== qid)
        }))
      }
    }));
  }

  function moveQuestion(qid, direction) {
    setKit((current) => {
      const index = current.questions.findIndex((q) => q.id === qid);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.questions.length) return current;
      const questions = [...current.questions];
      [questions[index], questions[nextIndex]] = [questions[nextIndex], questions[index]];
      return { ...current, questions };
    });
  }

  function addFlashcard() {
    const requirement = kit.role.requirements[0];
    if (!requirement) {
      setError("This kit has no extracted requirements to link the flashcard to.");
      return;
    }
    const next = {
      id: `manual_f${Date.now()}`,
      front: "Write a flashcard prompt.",
      back: "Write the answer you want to remember.",
      requirement_ids: [requirement.id],
      _state: "edited"
    };
    setKit((current) => ({ ...current, flashcards: [...current.flashcards, next] }));
  }

  function deleteFlashcard(fid) {
    setKit((current) => ({
      ...current,
      flashcards: current.flashcards.filter((card) => card.id !== fid)
    }));
  }

  function addQuestion() {
    const requirement = kit.role.requirements[0];
    if (!requirement) {
      setError("This kit has no extracted requirements to link the question to.");
      return;
    }
    const next = {
      id: `manual_${Date.now()}`,
      requirement_ids: [requirement.id],
      category: "technical",
      prompt: "Write your own interview question.",
      answer_outline: "Add the answer outline you want to practise.",
      difficulty: 2,
      _state: "edited"
    };
    setKit((current) => ({ ...current, questions: [...current.questions, next] }));
  }

  function moveCategory(qid, category) {
    updateQuestion(qid, "category", category);
  }

  async function regenerate(section, category) {
    const key = section === "category" ? `${section}:${category}` : section;
    setRegenerating(key);
    setError("");
    try {
      const response = await api.post(`/kits/${id}/regenerate`, { section, category });
      setKit(response.data.kitData || response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Regeneration failed.");
    } finally {
      setRegenerating("");
    }
  }

  async function retryGeneration() {
    setRetrying(true);
    setError("");
    try {
      const response = await api.post(`/kits/${id}/retry`);
      setKit(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  async function removeKit() {
    if (!window.confirm("Delete this kit?")) return;
    await api.delete(`/kits/${id}`);
    router.push("/dashboard");
  }

  if (loading) return <main className="min-h-screen bg-slate-950 p-8">Loading kit…</main>;
  if (!kit) return <main className="min-h-screen bg-slate-950 p-8">{error || "Kit not found."}</main>;

  if (kit.status === "processing") {
    return (
      <main className="min-h-screen bg-slate-950 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">← Dashboard</Link>
          <h1 className="mt-8 text-3xl font-black">Building your kit</h1>
          <p className="mt-2 text-slate-400">The pipeline is running. You can leave this page; the kit remains persisted.</p>
          <div className="mt-8">
            <div className="flex justify-between text-sm"><span>{kit.stage}</span><span>{kit.progress || 0}%</span></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${kit.progress || 0}%` }} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (kit.status === "failed") {
    return (
      <main className="min-h-screen bg-slate-950 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-900 bg-slate-900 p-8">
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">← Dashboard</Link>
          <h1 className="mt-8 text-3xl font-black">Generation failed</h1>
          <p className="mt-3 text-red-300">{kit.error?.message || "Unknown pipeline error."}</p>
          <button
            type="button"
            onClick={retryGeneration}
            disabled={retrying}
            className="mt-6 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry generation"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-5">
          <div>
            <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">← Dashboard</Link>
            <h1 className="mt-2 text-2xl font-black">{kit.role.title}</h1>
            <p className="text-sm text-slate-400">{kit.source.company} · {kit.source.role} · {kit.schedule.days_available} days</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/practice/${id}`} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">Practice flashcards</Link>
            <button onClick={() => save()} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-900 disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={removeKit} className="rounded-lg border border-red-900 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/30">Delete</button>
          </div>
        </header>

        {error && <div role="alert" className="mt-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Company brief</h2>
                <p className="text-xs text-slate-500">{kit.company_brief.sources.length} source(s)</p>
              </div>
              <button onClick={() => regenerate("brief")} disabled={!!regenerating} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800">
                {regenerating === "brief" ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
            <textarea
              rows={4}
              value={kit.company_brief.summary}
              onChange={(e) => updateBrief("summary", e.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"
            />
            <textarea
              rows={5}
              value={kit.company_brief.what_they_do}
              onChange={(e) => updateBrief("what_they_do", e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"
            />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-bold">Role</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-950 p-4"><div className="text-xs text-slate-500">Seniority</div><div className="mt-1 font-semibold">{kit.role.seniority}</div></div>
              <div className="rounded-lg bg-slate-950 p-4"><div className="text-xs text-slate-500">Location</div><div className="mt-1 font-semibold">{kit.source.location}</div></div>
              <div className="rounded-lg bg-slate-950 p-4"><div className="text-xs text-slate-500">Questions</div><div className="mt-1 font-semibold">{questionCount}</div></div>
              <div className="rounded-lg bg-slate-950 p-4"><div className="text-xs text-slate-500">Must-have requirements</div><div className="mt-1 font-semibold">{mustCount}</div></div>
            </div>
            <p className="mt-4 text-sm text-emerald-300">{coverageText}</p>
            {kit.research?.warnings?.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-900 bg-amber-950/20 p-3 text-xs text-amber-300">
                {kit.research.warnings.map((warning) => <div key={warning}>• {warning}</div>)}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Question bank</h2>
              <p className="mt-1 text-sm text-slate-400">Edits are local until you press Save. Edited questions survive category regeneration.</p>
            </div>
            <button onClick={addQuestion} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800">Add question</button>
          </div>

          {categories.map((category) => {
            const items = kit.questions.filter((question) => question.category === category);
            return (
              <div key={category} className="mt-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold capitalize">{category.replace("-", " ")}</h3>
                  <button
                    onClick={() => regenerate("category", category)}
                    disabled={!!regenerating}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {regenerating === `category:${category}` ? "Regenerating…" : "Regenerate category"}
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">No questions in this category.</div>}
                  {items.map((question) => {
                    const globalIndex = kit.questions.findIndex((q) => q.id === question.id);
                    return (
                      <article key={question.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">{question.id} · {question._state || "generated"}</span>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => moveQuestion(question.id, -1)} disabled={globalIndex === 0} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-30" title="Move question up">↑</button>
                            <button onClick={() => moveQuestion(question.id, 1)} disabled={globalIndex === kit.questions.length - 1} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-30" title="Move question down">↓</button>
                            <select value={question.category} onChange={(e) => moveCategory(question.id, e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
                              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                            <select value={question.difficulty} onChange={(e) => updateQuestion(question.id, "difficulty", Number(e.target.value))} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
                              <option value={1}>Easy</option><option value={2}>Medium</option><option value={3}>Hard</option>
                            </select>
                            <button onClick={() => deleteQuestion(question.id)} className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/30">Delete</button>
                          </div>
                        </div>
                        <textarea rows={3} value={question.prompt} onChange={(e) => updateQuestion(question.id, "prompt", e.target.value)} className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm" />
                        <textarea rows={4} value={question.answer_outline} onChange={(e) => updateQuestion(question.id, "answer_outline", e.target.value)} className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm" />
                        <div className="mt-3 text-xs text-slate-500">
                          Requirement: {question.requirement_ids.join(", ")}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Flashcards</h2>
              <div className="flex gap-2">
                <button onClick={addFlashcard} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800">Add flashcard</button>
                <Link href={`/practice/${id}`} className="rounded-lg border border-indigo-900 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/10">Open practice →</Link>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {kit.flashcards.map((card) => (
                <div key={card.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{card.id} · {card._state || "generated"}</span>
                    <button onClick={() => deleteFlashcard(card.id)} className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/30">Delete</button>
                  </div>
                  <textarea rows={2} value={card.front} onChange={(e) => updateFlashcard(card.id, "front", e.target.value)} className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm" />
                  <textarea rows={3} value={card.back} onChange={(e) => updateFlashcard(card.id, "back", e.target.value)} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm" />
                  <div className="mt-2 text-xs text-slate-500">Confidence: {card.confidence ?? "not reviewed"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Study schedule</h2>
                <p className="mt-1 text-sm text-slate-400">Deterministically allocated across exactly {kit.schedule.days_available} day(s).</p>
              </div>
              <button
                onClick={() => regenerate("schedule")}
                disabled={!!regenerating}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800"
              >
                {regenerating === "schedule" ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
            <div className="mt-4 max-h-[600px] space-y-3 overflow-auto pr-1">
              {kit.schedule.days.map((day) => (
                <div key={day.day} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold">Day {day.day}</div>
                    <div className="text-xs text-slate-500">{day.minutes} min</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-300">{day.focus}</div>
                  <div className="mt-2 text-xs text-slate-500">{day.question_ids.length ? day.question_ids.join(", ") : "No question IDs — flashcard review."}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
