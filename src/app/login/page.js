"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post(isLogin ? "/auth/login" : "/auth/register", { email, password });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.response?.data?.error || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm text-slate-400 hover:text-white">← Trao</Link>
          <h1 className="mt-6 text-3xl font-black">{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-slate-400">Your kits are private to your account.</p>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Email</span>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Password</span>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </label>
          <button
            disabled={loading}
            className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-bold hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? "Please wait…" : isLogin ? "Sign in" : "Sign up"}
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="w-full text-sm text-slate-400 hover:text-white"
          >
            {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
