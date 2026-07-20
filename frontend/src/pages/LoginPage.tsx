import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import api, { setTokens } from "../api/client";
import Button from "../components/ui/Button";
import { Input, Field } from "../components/ui/Primitives";

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload =
        mode === "login" ? { email, password } : { email, password, name };
      const { data } = await api.post(`/auth/${mode}`, payload);
      setTokens(data.access_token, data.refresh_token ?? "");
      navigate("/leads", { replace: true });
    } catch (err) {
      // Surface the API's own message — "Invalid credentials" is actionable,
      // a generic failure string is not.
      let msg = "Something went wrong. Please try again.";
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === "string") msg = detail;
        else if (Array.isArray(detail) && detail[0]?.msg) msg = detail[0].msg;
        else if (!err.response) msg = "Cannot reach the server.";
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded bg-accent text-[14px] font-bold text-on-accent">
            O
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-ink">OutboundEngine</span>
        </div>

        <h1 className="text-[20px] font-semibold tracking-tight text-ink">
          {mode === "login" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          {mode === "login"
            ? "Access your leads and campaigns."
            : "Set up a workspace to start reaching out."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Alex Rivera"
              />
            </Field>
          )}

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </Field>

          <Field
            label="Password"
            hint={mode === "register" ? "At least 8 characters." : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger"
            >
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-ink-muted">
          {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="font-medium text-accent hover:text-accent-hover"
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
