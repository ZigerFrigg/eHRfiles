
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type Step = 1 | 2 | 3;
type StatusKind = "success" | "error" | "";

type DocTypeRow = {
  d_key: string;
  d_name: string | null;
  d_r_taxcode: string | null;
  d_r_rule: string | null;
  d_r_trigger: string | null;
  d_r_month: number | null;
};

type EmployeeRow = {
  e_id: string;
  e_fname: string | null;
  e_lname: string | null;
  e_wloc: string | null;
  e_compc: string | null;
  e_lhold: boolean | null;
  e_hr: boolean | null;
  e_geb: boolean | null;
};

type CreatorRow = {
  e_fname: string | null;
  e_lname: string | null;
};

type FileItem = {
  id: string;
  file: File;

  // extracted/edited
  e_id: string;
  d_key: string;

  // lookup
  employee?: EmployeeRow | null;
  docType?: DocTypeRow | null;

  status: "okay" | "error";
  errorMessage?: string;

  // upload result
  result?: "successful" | "failed";
  resultMessage?: string;
  storagePath?: string;
  signedUrl?: string;
};

const BUCKET = "docs";
const DEFAULT_CREATOR_ID = "T000555";
const MAX_FILES = 100;

function sanitizeFileName(name: string): string {
  // 1) normalize unicode (ü -> ü) then remove diacritics (ü -> u)
  const noDiacritics = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  // 2) keep only safe characters for storage keys
  return noDiacritics
    .replace(/[\/\\]/g, "_")                 // no slashes
    .replace(/[\u0000-\u001F\u007F]/g, "")   // control chars
    .replace(/\s+/g, "_")                    // spaces -> _
    .replace(/[^A-Za-z0-9._-]/g, "_")        // everything else -> _
    .replace(/_+/g, "_")                     // collapse
    .replace(/^_+|_+$/g, "")                 // trim underscores
    .trim();
}

/**
 * Parsing rules (NEW):
 * - E_ID = first 8 chars
 * - D_KEY = last underscore-separated token
 *   Example: "00000002_Felber_Andreas_Switzerland_appl_1_CHE01.pdf" => "CHE01"
 */
function parseFromFilename(fileName: string): { e_id: string; d_key: string } {
  const base = fileName.replace(/\.[^/.]+$/i, ""); // remove extension
  const e_id = base.slice(0, 8);

  const last = base.lastIndexOf("_");
  if (last < 0) return { e_id, d_key: "" };

  const d_key = base.slice(last + 1);
  return { e_id, d_key };
}

function isEightDigits(v: string): boolean {
  return /^[0-9]{8}$/.test(v);
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("") ;
}

function isOpenableInBrowser(mime: string, name: string): boolean {
  const lower = name.toLowerCase();
  if (mime === "application/pdf") return true;
  if (mime.startsWith("image/")) return true;
  if (lower.endsWith(".pdf")) return true;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")) return true;
  return false;
}

function formatEmployeeName(emp?: EmployeeRow | null): string {
  if (!emp) return "N/A";
  const ln = emp.e_lname ?? "";
  const fn = emp.e_fname ?? "";
  const s = `${ln}${ln && fn ? ", " : ""}${fn}`.trim();
  return s || "N/A";
}

function formatDocTypeName(dt?: DocTypeRow | null): string {
  return dt?.d_name?.trim() ? dt.d_name.trim() : "N/A";
}

export default function UserBulkUploadPage() {
  const [step, setStep] = useState<Step>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [creatorId, setCreatorId] = useState<string>(DEFAULT_CREATOR_ID);
  const [creatorName, setCreatorName] = useState<string>("") ;
  const [items, setItems] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("") ;
  const [statusKind, setStatusKind] = useState<StatusKind>("") ;
  const creatorTimer = useRef<number | null>(null);
  const [uploadDone, setUploadDone] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

// Progress overlay (visual only)
const [progress, setProgress] = useState(0); // 0..100
const [progressLabel, setProgressLabel] = useState("");
// Fake progress while busy (looks nice for users)
useEffect(() => {
  // If we have a real upload progress running, don't run fake progress
  if (busy && uploadTotal > 0) return;
  if (!busy) {
    setProgress(0);
    setProgressLabel("");
    return;
  }
  // Start at a reasonable value
  setProgress(10);
  // Slowly increase up to 90% while busy, then complete when busy=false
  const t = window.setInterval(() => {
    setProgress((p) => {
      if (p >= 90) return p;
      // slightly random-ish increments
      const inc = p < 40 ? 6 : p < 70 ? 3 : 1;
      return Math.min(90, p + inc);
    });
  }, 400);
  return () => window.clearInterval(t);
}, [busy]);

  // ===== Creator lookup =====
  async function lookupCreator(uId: string) {
    const uid = uId.trim();
    if (!uid) {
      setCreatorName("") ;
      return;
    }
    const { data, error } = await supabase.from("employees").select("e_fname, e_lname").eq("u_id", uid).maybeSingle();
    if (error) {
      setStatusKind("error");
      setStatus(`Error: ${error.message}`);
      return;
    }
    const ln = (data as CreatorRow | null)?.e_lname ?? "";
    const fn = (data as CreatorRow | null)?.e_fname ?? "";
    setCreatorName(`${ln}${ln && fn ? ", " : ""}${fn}`);
  }

  useEffect(() => {
    lookupCreator(DEFAULT_CREATOR_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (creatorTimer.current) window.clearTimeout(creatorTimer.current);
    creatorTimer.current = window.setTimeout(() => {
      lookupCreator(creatorId);
    }, 350);
    return () => {
      if (creatorTimer.current) window.clearTimeout(creatorTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  // ===== Step 1: add files (dedupe by filename + max 100) =====
  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files ?? []);
    if (arr.length === 0) return;

    setItems((prev) => {
      const existingNames = new Set(prev.map((p) => p.file.name));
      const added: FileItem[] = [];

      for (const f of arr) {
        if (prev.length + added.length >= MAX_FILES) break;
        if (existingNames.has(f.name)) continue; // duplicate => skip silently
        const parsed = parseFromFilename(f.name);
        added.push({
          id: crypto.randomUUID(),
          file: f,
          e_id: parsed.e_id,
          d_key: parsed.d_key,
          employee: null,
          docType: null,
          status: "error",
        });
        existingNames.add(f.name);
      }
      return [...prev, ...added];
    });
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function resetAll() {
    setStep(1);
    setItems([]);
    setStatus("") ;
    setStatusKind("") ;
    setBusy(false);
  }

  // ===== Step 2: lookups =====
  async function runLookups() {
    setBusy(true);
    setProgressLabel("Validating files and loading lookup data...");
    setStatus("") ;
    setStatusKind("") ;
    try {
      const eids = Array.from(new Set(items.map((x) => x.e_id.trim()).filter(Boolean)));
      const validEids = eids.filter(isEightDigits);

      const { data: empData, error: empErr } = validEids.length
        ? await supabase
            .from("employees")
            .select("e_id, e_fname, e_lname, e_wloc, e_compc, e_lhold, e_hr, e_geb")
            .in("e_id", validEids)
        : { data: [], error: null };

      if (empErr) throw empErr;
      const empMap = new Map<string, EmployeeRow>();
      (empData ?? []).forEach((r: any) => empMap.set(r.e_id, r as EmployeeRow));

      const dkeys = Array.from(new Set(items.map((x) => x.d_key.trim()).filter(Boolean)));

      const { data: dtData, error: dtErr } = dkeys.length
        ? await supabase
            .from("doc_types")
            .select("d_key, d_name, d_r_taxcode, d_r_rule, d_r_trigger, d_r_month")
            .in("d_key", dkeys)
        : { data: [], error: null };

      if (dtErr) throw dtErr;
      const dtMap = new Map<string, DocTypeRow>();
      (dtData ?? []).forEach((r: any) => dtMap.set(r.d_key, r as DocTypeRow));

      setItems((prev) =>
        prev.map((x) => {
          const eidOk = isEightDigits(x.e_id.trim()) && empMap.has(x.e_id.trim());
          const dkeyOk = !!x.d_key.trim() && dtMap.has(x.d_key.trim());

          const employee = eidOk ? (empMap.get(x.e_id.trim()) as EmployeeRow) : null;
          const docType = dkeyOk ? (dtMap.get(x.d_key.trim()) as DocTypeRow) : null;

          const status: FileItem["status"] = eidOk && dkeyOk ? "okay" : "error";

          let errorMessage = "";
          if (!isEightDigits(x.e_id.trim())) errorMessage = "E_ID invalid (must be 8 digits)";
          else if (!eidOk) errorMessage = "Employee not found";
          if (!x.d_key.trim()) errorMessage = errorMessage ? `${errorMessage}; D_KEY missing` : "D_KEY missing";
          else if (!dkeyOk) errorMessage = errorMessage ? `${errorMessage}; Doc Type not found` : "Doc Type not found";

          return { ...x, employee, docType, status, errorMessage: status === "error" ? errorMessage : "" };
        })
      );

      setStep(2);
      setStatusKind("success");
      setStatus("Successful: Files parsed and validated.");
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
      setProgressLabel("Validating files and loading lookup data...");
    }
  }

  async function revalidateAll() {
    await runLookups();
  }

  const allOkay = useMemo(() => items.length > 0 && items.every((x) => x.status === "okay"), [items]);

  // ===== Step 3: upload =====
  async function uploadAll() {
    if (!allOkay) return;

    setBusy(true);
    setUploadDone(0);
    setUploadTotal(items.length);
    setProgressLabel(`Uploading 0 / ${items.length} files...`);
    setProgressLabel("Uploading files and creating records...");
    setStatus("") ;
    setStatusKind("") ;
    try {
      const { data: creatorData, error: creatorErr } = await supabase
        .from("employees")
        .select("e_fname, e_lname")
        .eq("u_id", creatorId.trim())
        .maybeSingle();

      if (creatorErr) throw creatorErr;
      const cFn = (creatorData as any)?.e_fname ?? "";
      const cLn = (creatorData as any)?.e_lname ?? "";

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");

      const results: FileItem[] = [];

      for (const it of items) {
        if (it.status !== "okay" || !it.employee || !it.docType) {
          results.push({ ...it, result: "failed", resultMessage: "Skipped: not OK" });
          continue;
        }

        try {
          const fileSafe = sanitizeFileName(it.file.name);
          const storagePath = `${yyyy}/${mm}/${crypto.randomUUID()}_${fileSafe}`;
          const hashHex = await sha256Hex(it.file);

          const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, it.file, {
            contentType: it.file.type || "application/pdf",
            upsert: false,
          });
          if (upErr) throw upErr;

          const payload = {
            d_key: it.d_key.trim(),
            d_date: new Date().toISOString(),
            e_id: it.e_id.trim(),
            e_compc: it.employee.e_compc ?? null,
            e_wloc: it.employee.e_wloc ?? null,
            e_lhold: !!it.employee.e_lhold,
            e_hr: !!it.employee.e_hr,
            e_geb: !!it.employee.e_geb,
            d_file: fileSafe,
            d_text: null,
            d_hash: hashHex,
            d_pages: null,
            d_u_id: creatorId.trim(),
            d_c_fname: cFn,
            d_c_lname: cLn,
            d_case: null,
            d_r_taxcode: it.docType.d_r_taxcode ?? "",
            d_r_rule: it.docType.d_r_rule ?? "",
            d_r_trigger: it.docType.d_r_trigger ?? "",
            d_r_month: Number(it.docType.d_r_month ?? 0),
            d_r_deletion: null,
            d_r_status: "not started",
            d_stor: BUCKET,
            d_path: storagePath,
            d_mime: it.file.type || "application/pdf",
            d_size: it.file.size,
          };

          const { error: insErr } = await supabase.from("documents").insert(payload);
          if (insErr) throw insErr;

          results.push({ ...it, result: "successful", resultMessage: "", storagePath });
        } catch (e: any) {
          results.push({ ...it, result: "failed", resultMessage: e?.message ?? String(e) });
        }

          setUploadDone((d) => {
          const next = d + 1;
          setProgressLabel(`Uploading ${next} / ${items.length} files...`);
          return next;
        });
        // Progress-Bar Füllung (echtes Verhältnis)
           setProgress(Math.round(((results.length + 1) / items.length) * 100));
      }

      const withUrls: FileItem[] = [];
      for (const r of results) {
        if (r.result === "successful" && r.storagePath) {
          try {
            const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.storagePath, 60);
            withUrls.push({ ...r, signedUrl: data?.signedUrl ?? "" });
          } catch {
            withUrls.push(r);
          }
        } else {
          withUrls.push(r);
        }
      }

      setItems(withUrls);
      setStep(3);
      setStatusKind("success");
      setStatus("Successful: Upload finished (best effort).");
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setProgress(100);
      setUploadTotal(0); // reset so fake-progress wieder funktioniert
      setUploadDone(0);
      setBusy(false);
      setProgressLabel("Uploading files and creating records...");
    }
  }

  const stepTitle = useMemo(() => {
    if (step === 1) return "Step 1 — Select Files";
    if (step === 2) return "Step 2 — Validate & Prepare";
    return "Step 3 — Results";
  }, [step]);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Bulk Upload</h1>
      <PageInfo cName="USR_BLK_UPL" />
      <h2 className={styles.subtitle}>{stepTitle}</h2>

{/* Busy Overlay */}
{busy && (
  <div className={styles.busyOverlay} role="dialog" aria-modal="true" aria-label="Please wait">
    <div className={styles.busyModal}>
      <div className={styles.spinner} aria-hidden="true" />
      <div className={styles.busyText}>
        <div className={styles.busyTitle}>Please wait…</div>
        <div className={styles.busySub}>{progressLabel || "Working..."}</div>
      </div>

      <div className={styles.progressWrap}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.progressPct}>
          {uploadTotal > 0 ? `${uploadDone} / ${uploadTotal}` : `${progress}%`}
        </div>
      </div>
    </div>
  </div>
)}

{/* Progress Bar */}
<div className={styles.stepProgress} aria-label="Progress">
  <div className={styles.stepProgressHeader}>
    <span className={styles.stepDot + " " + (step >= 1 ? styles.stepDotActive : "")}>1</span>
    <span className={styles.stepLine + " " + (step >= 2 ? styles.stepLineActive : "")} />
    <span className={styles.stepDot + " " + (step >= 2 ? styles.stepDotActive : "")}>2</span>
    <span className={styles.stepLine + " " + (step >= 3 ? styles.stepLineActive : "")} />
    <span className={styles.stepDot + " " + (step >= 3 ? styles.stepDotActive : "")}>3</span>
  </div>

  <div className={styles.stepProgressLabels}>
    <span className={step === 1 ? styles.stepLabelActive : styles.stepLabel}>Select</span>
    <span className={step === 2 ? styles.stepLabelActive : styles.stepLabel}>Validate</span>
    <span className={step === 3 ? styles.stepLabelActive : styles.stepLabel}>Results</span>
  </div>
</div>

      {step === 2 && (
        <div className={styles.status} style={{ marginTop: 6 }}>
          Please verify extracted values and fix any errors. Only when all rows are <strong>Okay</strong>, you can proceed with <strong>Add Documents</strong>.
        </div>
      )}

      {status && <div className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</div>}

      {/* STEP 1 */}
      {step === 1 && (
        <div className={styles.card}>
          <div
            className={styles.dropZone}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            style={{ background: isDragging ? "#b4e5a2" : undefined }}
          >
            <div className={styles.status} style={{ marginBottom: 8 }}>
              Drag & drop files here, or choose files.
            </div>

            <label className={styles.button} style={{ display: "inline-block" }}>
              Choose Files
              <input
                type="file"
                multiple
                hidden
                onClick={(e) => (((e.target as HTMLInputElement).value) = "")}
                onChange={(e) => addFiles(e.target.files ?? [])}
              />
            </label>
          </div>

          <div className={styles.actions} style={{ marginTop: 12, flexWrap: "wrap" }}>
            <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={runLookups} disabled={busy || items.length === 0}>
              Next
            </button>
            <button className={styles.button} onClick={resetAll} disabled={busy}>
              Clear
            </button>
            <span className={styles.status}>
              Selected files: {items.length} of max. {MAX_FILES}
            </span>
          </div>

          {items.length > 0 && (
            <table className={styles.table} style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.file.name}</td>
                    <td>
                      <button className={styles.iconButton} onClick={() => removeItem(it.id)}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className={styles.card}>
          <div className={styles.actions} style={{ flexWrap: "wrap" }}>
            <button className={styles.button} onClick={() => setStep(1)} disabled={busy}>
              Back
            </button>
            <button className={styles.button} onClick={runLookups} disabled={busy}>
              Re-Validate
            </button>
            <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={uploadAll} disabled={busy || !allOkay}>
              Add Documents
            </button>
            <button className={styles.button} onClick={resetAll} disabled={busy}>
              Cancel
            </button>
          </div>

          <div className={styles.formGrid} style={{ marginTop: 12 }}>
            <div className={styles.field}>
              <label>Creator ID</label>
              <input value={creatorId} onChange={(e) => setCreatorId(e.target.value)} disabled={busy} />
            </div>
            <div className={styles.field}>
              <label>Creator Name</label>
              <input value={creatorName} disabled />
            </div>
          </div>

          <div className={styles.tableInfo} style={{ marginTop: 12 }}>
            <strong>Files:</strong> {items.length} &nbsp; | &nbsp; <strong>Status:</strong> {allOkay ? "All OK" : "Errors present"}
          </div>

          <table className={styles.table} style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>File</th>
                <th>Employee ID</th>
                <th>Employee</th>
                <th>Doc Type</th>
                <th>Doc Type Name</th>
                <th>Status</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.file.name}</td>
                  <td>
                    <input
                      className={styles.keyInput}
                      value={it.e_id}
                      onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, e_id: e.target.value } : x)))}
                      onBlur={revalidateAll}
                      disabled={busy}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>{formatEmployeeName(it.employee)}</td>
                  <td>
                    <input
                      className={styles.keyInput}
                      value={it.d_key}
                      onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, d_key: e.target.value } : x)))}
                      onBlur={revalidateAll}
                      disabled={busy}
                      style={{ width: 160 }}
                    />
                  </td>
                  <td>{formatDocTypeName(it.docType)}</td>
                  <td>
                    {it.status === "okay" ? (
                      <span>Okay</span>
                    ) : (
                      <span className={styles.error}>Error: {it.errorMessage || "Invalid"}</span>
                    )}
                  </td>
                  <td>
                    <button className={styles.iconButton} onClick={() => removeItem(it.id)} disabled={busy}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!allOkay && (
            <div className={`${styles.status} ${styles.error}`} style={{ marginTop: 10 }}>
              Only files with Status "Okay" can be uploaded. Fix errors above.
            </div>
          )}
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className={styles.card}>
          <div className={styles.actions} style={{ flexWrap: "wrap" }}>
            <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={resetAll} disabled={busy}>
              New Upload
            </button>
          </div>

          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>File</th>
                <th>Employee</th>
                <th>Doc Type Name</th>
                <th>Result</th>
                <th>Message</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const ok = it.result === "successful";
                const canView = ok && !!it.signedUrl && isOpenableInBrowser(it.file.type || "application/pdf", it.file.name);
                const viewText = ok ? (canView ? "Open" : "Download") : "";
                return (
                  <tr key={it.id}>
                    <td>{it.file.name}</td>
                    <td>{formatEmployeeName(it.employee)}</td>
                    <td>{formatDocTypeName(it.docType)}</td>
                    <td>{ok ? "Added" : "Failed"}</td>
                    <td style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.resultMessage ?? ""}</td>
                    <td>
                      {ok && it.signedUrl ? (
                        <a className={styles.link} href={it.signedUrl} target="_blank" rel="noreferrer">
                          {viewText}
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
