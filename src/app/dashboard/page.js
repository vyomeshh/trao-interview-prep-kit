"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

const stages = [
  ["queued", "Queued"],
  ["researching_company", "Researching company"],
  ["extracting_requirements", "Extracting requirements"],
  ["generating_technical", "Generating technical questions"],
  ["generating_behavioural", "Generating behavioural questions"],
  ["generating_system-design", "Generating system-design questions"],
  ["generating_company-fit", "Generating company-fit questions"],
  ["coverage_pass_2", "Closing coverage gaps"],
  ["coverage_pass_3", "Second coverage pass"],
  ["generating_company_brief", "Writing company brief"],
  ["generating_flashcards", "Making flashcards"],
  ["validating_kit", "Validating kit"],
  ["completed", "Completed"]
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((values, index) => {
    const item = Object.fromEntries(headers.map((header, column) => [header, values[column] || ""]));
    return {
      id: item.id || `upload-${index + 1}`,
      jd: item.jd || item.job_description || "",
      company_url: item.company_url || item.url || "",
      days: Number(item.days || 5)
    };
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [kits, setKits] = useState([]);
  const [companyUrl, setCompanyUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [days, setDays] = useState("5");
  const [batchCases, setBatchCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadKits = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([api.get("/auth/me"), api.get("/kits")]);
      if (!me.data?.user) throw new Error("Unauthorized");
      setKits(list.data);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [me, list] = await Promise.all([api.get("/auth/me"), api.get("/kits")]);
        if (!me.data?.user) throw new Error("Unauthorized");
        if (!cancelled) setKits(list.data);
      } catch {
        if (!cancelled) router.replace("/login");
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    const processing = kits.some((kit) => kit.status === "processing");
    if (!processing) return undefined;
    const timer = setInterval(() => {
      void loadKits();
    }, 1800);
    return () => clearInterval(timer);
  }, [kits, loadKits]);

  const processing = useMemo(() => kits.filter((kit) => kit.status === "processing"), [kits]);

  async function generateOne(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await api.post("/kits", {
        companyUrl,
        jobDescription,
        days: Number(days)
      });
      router.push(`/builder/${response.data._id}`);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not queue the kit.");
      setLoading(false);
    }
  }

  async function handleFile(event) {
    const selected = event.target.files?.[0] || null;
    setBatchCases([]);
    if (!selected) return;
    if (selected.size > 2_000_000) {
      setMessage("Batch file must be 2 MB or smaller.");
      return;
    }
    const text = await selected.text();
    try {
      if (selected.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        setBatchCases(Array.isArray(parsed) ? parsed : []);
      } else {
        setBatchCases(parseCsv(text));
      }
    } catch {
      setMessage("Could not parse the uploaded file.");
    }
  }

  async function generateBatch() {
    setBatchLoading(true);
    setMessage("");
    try {
      if (!batchCases.length) throw new Error("Upload a JSON or CSV file with id, jd, company_url and days.");
      await api.post("/kits/batch", { cases: batchCases });
      setMessage(`${batchCases.length} case(s) queued. This page will update automatically.`);
      await loadKits();
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    } finally {
      setBatchLoading(false);
    }
  }

  async function logout() {
    await api.post("/auth/logout");
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-2xl font-black">Trao</div>
            <p className="text-sm text-slate-400">Interview preparation workspace</p>
          </div>
          <button onClick={logout} className="self-start rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900 sm:self-auto">
            Log out
          </button>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h1 className="text-xl font-bold">Create a kit</h1>
            <p className="mt-1 text-sm text-slate-400">Paste the JD, add the company website, and choose the preparation window.</p>

            <form onSubmit={generateOne} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Company website</span>
                <input
                  type="url"
                  required
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  placeholder="https://company.com/"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Job description</span>
                <textarea
                  required
                  minLength={2}
                  rows={10}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the full job description here…"
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Days available</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  required
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </label>

              <button
                disabled={loading}
                className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-bold hover:bg-indigo-400 disabled:opacity-50"
              >
                {loading ? "Queued…" : "Generate interview kit"}
              </button>
            </form>

            <div className="mt-8 border-t border-slate-800 pt-6">
              <h2 className="font-bold">Batch entry</h2>
              <p className="mt-1 text-sm text-slate-400">Upload JSON or CSV with <code>id</code>, <code>jd</code>, <code>company_url</code> and <code>days</code>.</p>
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleFile}
                className="mt-4 block w-full text-sm text-slate-400"
              />
              {batchCases.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  {batchCases.length} case(s) parsed
                </div>
              )}
              <button
                onClick={generateBatch}
                disabled={batchLoading || !batchCases.length}
                className="mt-4 w-full rounded-lg border border-indigo-400 px-4 py-3 font-bold text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"
              >
                {batchLoading ? "Queueing…" : "Queue batch"}
              </button>
            </div>

            {message && <div role="status" className="mt-5 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{message}</div>}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Your kits</h2>
                <p className="mt-1 text-sm text-slate-400">{processing.length} generating</p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{kits.length} total</span>
            </div>

            <div className="mt-6 space-y-4">
              {kits.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No kits yet.</div>
              )}

              {kits.map((kit) => (
                <Link key={kit._id} href={`/builder/${kit._id}`} className="block rounded-xl border border-slate-800 bg-slate-950 p-4 hover:border-indigo-500">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold">{kit.kitData?.role?.title || "Interview kit"}</div>
                      <div className="mt-1 text-sm text-slate-400">{kit.kitData?.source?.company || kit.companyUrl}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${kit.status === "completed" ? "bg-emerald-500/10 text-emerald-300" : kit.status === "failed" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>
                      {kit.status}
                    </span>
                  </div>
                  {kit.status === "processing" && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{stages.find(([value]) => value === kit.stage)?.[1] || kit.stage}</span>
                        <span>{kit.progress || 0}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${kit.progress || 0}%` }} />
                      </div>
                    </div>
                  )}
                  {kit.status === "failed" && (
                    <p className="mt-3 text-sm text-red-300">{kit.error?.message || "Generation failed."}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
