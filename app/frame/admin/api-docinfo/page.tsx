"use client";

import { useState } from "react";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

export default function AdminApiDocInfoPage() {
  const [docId, setDocId] = useState("");
  const [techUser, setTechUser] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");
  const [result, setResult] = useState<any>(null);

  async function run() {
    setBusy(true);
    setStatus("");
    setStatusKind("");
    setResult(null);

    try {
      const d_id = docId.trim();
      const d_u_id = techUser.trim();

      if (!d_id) throw new Error("Document ID is required.");
      if (!d_u_id) throw new Error("Tech User is required.");

      const res = await fetch("/api/docinfo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ d_id, d_u_id }),
      });

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        /* ignore */
      }

      if (!res.ok) throw new Error(json?.error ?? raw ?? `API error (HTTP ${res.status})`);

      setResult(json);
      setStatusKind("success");
      setStatus("Successful: Document info loaded.");
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — API DocInfo</h1>
      <PageInfo cName="ADM_API_DOC" />

      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Document Info (API)</div>

        <div className={styles.searchGrid} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className={styles.field}>
            <label>Document ID</label>
            <input value={docId} onChange={(e) => setDocId(e.target.value)} disabled={busy} placeholder="d_id from documents" />
          </div>

          <div className={styles.field}>
            <label>Tech User</label>
            <input value={techUser} onChange={(e) => setTechUser(e.target.value)} disabled={busy} placeholder="e.g. S000000" />
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={run} disabled={busy}>
            {busy ? "Loading…" : "Run API Call"}
          </button>

          {status && <span className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</span>}
        </div>
      </section>

      {result?.ok && (
        <section className={styles.card}>
          <div className={styles.searchTitle}>Result</div>

          {result.downloadUrl ? (
            <div style={{ marginBottom: 12 }}>
              <a href={result.downloadUrl} target="_blank" rel="noreferrer" className={styles.link}>
                Download PDF
              </a>
              <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
                Link valid for ~10 minutes
              </div>
            </div>
          ) : (
            <div className={styles.status}>No downloadUrl returned.</div>
          )}

          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.document, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
