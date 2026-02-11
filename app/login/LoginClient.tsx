"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/frame";

  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json?.message || "Error, wrong Password - Contact the owner of the Site");
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <section style={{ width: 420, maxWidth: "95vw", border: "1px solid #ddd", borderRadius: 12, padding: 18 }}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Login</h1>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              style={{ height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <button
            type="submit"
            disabled={busy || !pw}
            style={{
              height: 38,
              borderRadius: 10,
              border: "1px solid #333",
              background: busy || !pw ? "#eee" : "#111",
              color: busy || !pw ? "#666" : "#fff",
              cursor: busy || !pw ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Checking…" : "Login"}
          </button>

          {err && <div style={{ color: "#c0392b", fontWeight: 600 }}>{err}</div>}
        </form>
      </section>
    </main>
  );
}
