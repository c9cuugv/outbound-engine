import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, AlertCircle, Loader2 } from "lucide-react";
import api from "../api/client";

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const { data } = await api.post("/auth/login", { email, password });
        localStorage.setItem("access_token", data.access_token);
        if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
      } else {
        const { data } = await api.post("/auth/register", { email, password, name });
        localStorage.setItem("access_token", data.access_token);
        if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
      }
      navigate("/leads", { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Something went wrong. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-0)] px-4">
      {/* Background dot-grid inherited from body */}

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-accent)]">
            <Zap size={22} className="text-[var(--color-surface-0)]" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-[18px] font-bold tracking-tight">OutboundEngine</h1>
            <p className="mt-0.5 text-[12px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
              AI Outreach
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-white/[0.08] bg-[var(--color-surface-1)] p-6 shadow-2xl">
          {/* Mode tabs */}
          <div className="mb-6 flex rounded border border-white/[0.08] bg-[var(--color-surface-2)] p-0.5">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 rounded py-1.5 text-[12px] font-semibold capitalize transition-all ${
                  mode === m
                    ? "bg-[var(--color-accent)] text-[var(--color-surface-0)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-secondary)]">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="h-9 w-full rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 focus:shadow-[0_0_0_2px_rgba(0,180,216,0.15)]"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-secondary)]">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-9 w-full rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 focus:shadow-[0_0_0_2px_rgba(0,180,216,0.15)]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-secondary)]">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9 w-full rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 focus:shadow-[0_0_0_2px_rgba(0,180,216,0.15)]"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2">
                <AlertCircle size={13} className="shrink-0 text-red-400" />
                <p className="text-[12px] text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] text-[13px] font-semibold text-[var(--color-surface-0)] transition-all hover:bg-[var(--color-accent-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px] text-[var(--color-ink-muted)]">
          {mode === "login" ? "No account? " : "Have an account? "}
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-[var(--color-accent)] hover:underline"
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
