"use client";

import { useState } from "react";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

export default function AdminApiDocUploadPage() {
  const [eId, setEId] = useState("");
  const [dKey, setDKey] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [caseId, setCaseId] = useState("");

  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  const [result, setResult] = useState<any>(null);

  async function callApi() {
    setBusy(true);
    setStatus("");
    setStatusKind("");
    setResult(null);

    try {
      if (!file) throw new Error("Please select a PDF file.");
      if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Only PDF files are allowed.");

      const e_id = eId.trim();
      const d_key = dKey.trim();
      const d_u_id = creatorId.trim();
      const d_case = caseId.trim();

      if (!e_id) throw new Error("Employee ID (e_id) is required.");
      if (!d_key) throw new Error("Doc Type (d_key) is required.");
      if (!d_u_id) throw new Error("Creator ID (d_u_id) is required.");

      const fd = new FormData();
      fd.append("e_id", e_id);
      fd.append("d_key", d_key);
      fd.append("d_u_id", d_u_id);
      if (d_case) fd.append("d_case", d_case);
      fd.append("file", file);

const res = await fetch("/api/documents", { method: "POST", body: fd });

const raw = await res.text();
let json: any = null;
try {
  json = raw ? JSON.parse(raw) : null;
} catch {
  // raw is not JSON (e.g. Next error page)
}

if (!res.ok) {
  const msg =
    json?.error ||
    raw ||
    `API error (HTTP ${res.status})`;
  throw new Error(msg);
}

      setResult(json);
      setStatusKind("success");
      setStatus("Successful: Document uploaded via API.");
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — API Document Upload</h1>
      <PageInfo cName="ADM_API_UPL" />

      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Upload PDF via API</div>

        <div className={styles.searchGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className={styles.field}>
            <label>Employee ID (e_id)</label>
            <input value={eId} onChange={(e) => setEId(e.target.value)} disabled={busy} placeholder="e.g. 10000009" />
          </div>

          <div className={styles.field}>
            <label>Doc Type (d_key)</label>
            <input value={dKey} onChange={(e) => setDKey(e.target.value)} disabled={busy} placeholder="e.g. EPF_LUX26" />
          </div>

          <div className={styles.field}>
            <label>Creator ID (d_u_id)</label>
            <input value={creatorId} onChange={(e) => setCreatorId(e.target.value)} disabled={busy} placeholder="e.g. TECH_USER_01" />
          </div>

          <div className={styles.field}>
            <label>Case ID (optional)</label>
            <input value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={busy} placeholder="optional" />
          </div>

          <div className={styles.field} style={{ gridColumn: "span 2" }}>
            <label>PDF File</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && <small>Selected: {file.name}</small>}
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button onClick={callApi} disabled={busy} className={`${styles.button} ${styles.buttonPrimary}`}>
            {busy ? "Uploading…" : "Upload via API"}
          </button>

          {status && (
            <span className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>
              {status}
            </span>
          )}
        </div>
      </section>

      {result && (
        <section className={styles.card}>
          <div className={styles.searchTitle}>Result</div>

          <div className={styles.tableInfo}>
            <div><b>Storage bucket:</b> {result?.storage?.bucket ?? ""}</div>
            <div><b>Storage path:</b> {result?.storage?.path ?? ""}</div>
            <div><b>Document ID:</b> {result?.document?.d_id ?? "(not returned)"} </div>
          </div>

          <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
