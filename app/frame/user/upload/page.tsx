"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import { useSearchParams } from "next/navigation";
import PageInfo from "../../../components/PageInfo";
import { Search } from "lucide-react";

type StatusKind = "success" | "error" | "";

type DocTypesRow = {
  d_key: string;
  d_group: string | null;
  d_name: string | null;
  d_r_taxcode: string | null;
  d_r_rule: string | null;
  d_r_trigger: string | null;
  d_r_month: number | null;
};

type EmployeeRow = {
  e_id: string;
  u_id: string | null;
  e_fname: string | null;
  e_lname: string | null;
  e_status: string | null;
  e_wloc: string | null;
  e_compc: string | null;
  e_compn: string | null;
  e_ouna: string | null;
  e_lhold: boolean | null;
  e_hr: boolean | null;
  e_geb: boolean | null;
};

type DocumentRow = {
  d_id: string;
  d_key: string;
  d_date: string;
  e_id: string | null;
  e_compc: string | null;
  e_wloc: string | null;
  e_lhold: boolean;
  e_hr: boolean;
  e_geb: boolean;
  d_file: string;
  d_text: string | null;
  d_hash: string;
  d_pages: number | null;
  d_u_id: string;
  d_c_fname: string;
  d_c_lname: string;
  d_case: string | null;
  d_r_taxcode: string;
  d_r_rule: string;
  d_r_trigger: string;
  d_r_month: number;
  d_r_deletion: string | null;
  d_r_status: string;
  d_stor: string;
  d_path: string;
  d_mime: string;
  d_size: number;
};

type UploadForm = {
  file: File | null;

  // document type
  d_key: string;
  d_group: string;
  d_name: string;

  // employee
  e_id: string;
  e_name: string; // "Lastname, Firstname"
  e_status_wloc: string; // "Active, CHE"
  e_compn: string;
  e_ouna: string;

  // others (future: auto, read-only; currently editable in More Properties)
  d_case: string;

  // creator (future: auto, read-only; currently editable in More Properties)
  d_u_id: string;
  creator_name: string; // "Lastname, Firstname"
  d_c_fname: string;
  d_c_lname: string;
};

const BUCKET = "docs";
const DEFAULT_CREATOR_ID = "T000555";

function formatDateTimeDMYYHM(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hh}:${mm}`;
}

function yesNo(v: boolean | null | undefined): string {
  return v ? "yes" : "no";
}

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

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultForm(): UploadForm {
  return {
    file: null,
    d_key: "",
    d_group: "",
    d_name: "",
    e_id: "",
    e_name: "",
    e_status_wloc: "",
    e_compn: "",
    e_ouna: "",
    d_case: "",
    d_u_id: DEFAULT_CREATOR_ID,
    creator_name: "",
    d_c_fname: "",
    d_c_lname: "",
  };
}

export default function UserUploadPage() {
  const [form, setForm] = useState<UploadForm>(defaultForm());
  const [isDragging, setIsDragging] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");
  const [busy, setBusy] = useState(false);

  const [docTypeInfo, setDocTypeInfo] = useState<DocTypesRow | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeRow | null>(null);

  const [resultRow, setResultRow] = useState<DocumentRow | null>(null);
  const [showPostButtons, setShowPostButtons] = useState(false);

  type EmpSearchRow = { e_id: string; e_lname: string | null; e_fname: string | null; e_wloc: string | null };
  const [empSearchOpen, setEmpSearchOpen] = useState(false);
  const [empSearchBusy, setEmpSearchBusy] = useState(false);
  const [empSearchEid, setEmpSearchEid] = useState("");
  const [empSearchName, setEmpSearchName] = useState("");
  const [empSearchWloc, setEmpSearchWloc] = useState("");
  const [empSearchRows, setEmpSearchRows] = useState<EmpSearchRow[]>([]);





function openEmpSearch() {
  setEmpSearchOpen(true);
  // optional: Startwerte
  setEmpSearchEid("");
  setEmpSearchName("");
  setEmpSearchWloc("");
  setEmpSearchRows([]);
}

function closeEmpSearch() {
  setEmpSearchOpen(false);
}

async function runEmpSearch() {
  setEmpSearchBusy(true);
  try {
    const eid = empSearchEid.trim();
    const name = empSearchName.trim();
    const wloc = empSearchWloc.trim();

    // Basis Query
    let q = supabase
      .from("employees")
      .select("e_id, e_lname, e_fname, e_wloc")
      .order("e_id", { ascending: true })
      .limit(100);

    if (eid) q = q.ilike("e_id", `%${eid}%`);
    if (wloc) q = q.ilike("e_wloc", `%${wloc}%`);

    // Name: wir suchen über Vor- oder Nachname
    if (name) q = q.or(`e_lname.ilike.%${name}%,e_fname.ilike.%${name}%`);

    const { data, error } = await q;
    if (error) throw error;

    setEmpSearchRows((data ?? []) as EmpSearchRow[]);
  } catch (e: any) {
    setStatusKind("error");
    setStatus(`Error: ${e?.message ?? String(e)}`);
  } finally {
    setEmpSearchBusy(false);
  }
}

function pickEmployee(row: EmpSearchRow) {
  // Employee ID ins Feld übernehmen (triggert automatisch deinen bestehenden Employee Lookup)
  setForm((p) => ({ ...p, e_id: row.e_id }));
  setEmpSearchOpen(false);
}
  function pickDefaultDocTypeForEmployee(): string {
    const wloc = (employeeInfo?.e_wloc ?? "").trim();
    if (!wloc) return "";
const prefix = `${wloc}`;
const match = docTypeOptions.find((x) => x.d_key.startsWith(prefix));
    return match?.d_key ?? "";
  }

  function handleDocTypeOpen(e: React.MouseEvent<HTMLSelectElement> | React.FocusEvent<HTMLSelectElement>) {
    if (form.d_key) return;                // nur wenn noch leer
    if (!employeeInfo?.e_wloc) return;     // Country muss bekannt sein
    if (docTypeOptions.length === 0) return;
    const def = pickDefaultDocTypeForEmployee();
    if (!def) return;
    // WICHTIG: DOM value sofort setzen, damit das Dropdown beim Öffnen schon "def" markiert hat
    (e.currentTarget as HTMLSelectElement).value = def;
    // State nachziehen
    setForm((p) => ({ ...p, d_key: def }));
  }

  const docTypeTimer = useRef<number | null>(null);
  const empTimer = useRef<number | null>(null);
  const creatorTimer = useRef<number | null>(null);

  const searchParams = useSearchParams();

  const [docTypeOptions, setDocTypeOptions] = useState<Array<{ d_key: string; d_name: string | null }>>([]);

  const fileName = useMemo(() => (form.file ? form.file.name : ""), [form.file]);

  function clearResult() {
    setResultRow(null);
    setShowPostButtons(false);
  }

  async function lookupCreator(uId: string) {
    const uid = uId.trim();
    if (!uid) {
      setForm((p) => ({ ...p, creator_name: "", d_c_fname: "", d_c_lname: "" }));
      return;
    }

    const { data, error } = await supabase.from("employees").select("e_fname, e_lname").eq("u_id", uid).maybeSingle();
    if (error) {
      setStatusKind("error");
      setStatus(`Error: ${error.message}`);
      return;
    }

    const ln = (data as any)?.e_lname ?? "";
    const fn = (data as any)?.e_fname ?? "";
    setForm((p) => ({
      ...p,
      d_u_id: uid,
      creator_name: `${ln}${ln && fn ? ", " : ""}${fn}`,
      d_c_fname: fn,
      d_c_lname: ln,
    }));
  }

  // Prefill creator at page load

useEffect(() => {
  let cancelled = false;

  async function loadDocTypes() {
    const { data, error } = await supabase

.from("doc_types")
.select("d_key, d_name")
// nur Länderkeys: CHE01, GBR14, USA11, ...
.not("d_key", "like", "EPF_%")
.order("d_key", { ascending: true });


    if (error) {
      setStatusKind("error");
      setStatus(`Error: ${error.message}`);
      return;
    }

    if (!cancelled) setDocTypeOptions((data ?? []) as any);
  }

  loadDocTypes();

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  const eid = (searchParams.get("e_id") ?? "").trim();
  if (!eid) return;

  // Employee ID setzen (triggert automatisch den Employee lookup Effect)
  setForm((p) => ({ ...p, e_id: eid }));
}, [searchParams]);

useEffect(() => {
    lookupCreator(DEFAULT_CREATOR_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lookup creator name if ID changes
  useEffect(() => {
    if (creatorTimer.current) window.clearTimeout(creatorTimer.current);
    creatorTimer.current = window.setTimeout(async () => {
      await lookupCreator(form.d_u_id);
    }, 350);

    return () => {
      if (creatorTimer.current) window.clearTimeout(creatorTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.d_u_id]);

  // Doc type lookup
  useEffect(() => {
    if (docTypeTimer.current) window.clearTimeout(docTypeTimer.current);
    docTypeTimer.current = window.setTimeout(async () => {
      const key = form.d_key.trim();
      if (!key) {
        setDocTypeInfo(null);
        setForm((p) => ({ ...p, d_group: "", d_name: "" }));
        return;
      }

      const { data, error } = await supabase
        .from("doc_types")
        .select("d_key, d_group, d_name, d_r_taxcode, d_r_rule, d_r_trigger, d_r_month")
        .eq("d_key", key)
        .maybeSingle();

      if (error) {
        setStatusKind("error");
        setStatus(`Error: ${error.message}`);
        return;
      }

      if (!data) {
        setDocTypeInfo(null);
        setForm((p) => ({ ...p, d_group: "", d_name: "" }));
        setStatusKind("error");
        setStatus(`Error: Document Type not found: ${key}`);
        return;
      }

      setDocTypeInfo(data as DocTypesRow);
      setForm((p) => ({
        ...p,
        d_group: (data as any).d_group ?? "",
        d_name: (data as any).d_name ?? "",
      }));
    }, 400);

    return () => {
      if (docTypeTimer.current) window.clearTimeout(docTypeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.d_key]);

  // Employee lookup
  useEffect(() => {
    if (empTimer.current) window.clearTimeout(empTimer.current);
    empTimer.current = window.setTimeout(async () => {
      const eid = form.e_id.trim();
      if (!eid) {
        setEmployeeInfo(null);
        setForm((p) => ({ ...p, e_name: "", e_status_wloc: "", e_compn: "", e_ouna: "" }));
        return;
      }

      const { data, error } = await supabase
        .from("employees")
        .select("e_id, u_id, e_fname, e_lname, e_status, e_wloc, e_compc, e_compn, e_ouna, e_lhold, e_hr, e_geb")
        .eq("e_id", eid)
        .maybeSingle();

      if (error) {
        setStatusKind("error");
        setStatus(`Error: ${error.message}`);
        return;
      }

      if (!data) {
        setEmployeeInfo(null);
        setForm((p) => ({ ...p, e_name: "", e_status_wloc: "", e_compn: "", e_ouna: "" }));
        setStatusKind("error");
        setStatus(`Error: Employee not found: ${eid}`);
        return;
      }

      setEmployeeInfo(data as EmployeeRow);

      const ln = (data as any).e_lname ?? "";
      const fn = (data as any).e_fname ?? "";
      const status = (data as any).e_status ?? "";
      const wloc = (data as any).e_wloc ?? "";

      setForm((p) => ({
        ...p,
        e_name: `${ln}${ln && fn ? ", " : ""}${fn}`,
        e_status_wloc: `${status}${status && wloc ? ", " : ""}${wloc}`,
        e_compn: (data as any).e_compn ?? "",
        e_ouna: (data as any).e_ouna ?? "",
      }));
    }, 400);

    return () => {
      if (empTimer.current) window.clearTimeout(empTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.e_id]);

  function pickFile(f: File | null) {
    setForm((p) => ({ ...p, file: f }));
  }

  function resetAll() {
    setForm((p) => {
      const base = defaultForm();
      base.d_u_id = p.d_u_id || DEFAULT_CREATOR_ID;
      base.creator_name = p.creator_name;
      base.d_c_fname = p.d_c_fname;
      base.d_c_lname = p.d_c_lname;
      return base;
    });
    setDocTypeInfo(null);
    setEmployeeInfo(null);
    clearResult();
    setStatus("");
    setStatusKind("");
  }

  function resetKeepEmployee() {
    setForm((p) => {
      const base = defaultForm();
      base.e_id = p.e_id;
      base.e_name = p.e_name;
      base.e_status_wloc = p.e_status_wloc;
      base.e_compn = p.e_compn;
      base.e_ouna = p.e_ouna;

      base.d_u_id = p.d_u_id || DEFAULT_CREATOR_ID;
      base.creator_name = p.creator_name;
      base.d_c_fname = p.d_c_fname;
      base.d_c_lname = p.d_c_lname;
      return base;
    });
    setDocTypeInfo(null);
    clearResult();
    setStatus("");
    setStatusKind("");
  }

  function resetKeepEmployeeAndDocType() {
    setForm((p) => {
      const base = defaultForm();
      base.e_id = p.e_id;
      base.e_name = p.e_name;
      base.e_status_wloc = p.e_status_wloc;
      base.e_compn = p.e_compn;
      base.e_ouna = p.e_ouna;

      base.d_key = p.d_key;
      base.d_group = p.d_group;
      base.d_name = p.d_name;

      base.d_u_id = p.d_u_id || DEFAULT_CREATOR_ID;
      base.creator_name = p.creator_name;
      base.d_c_fname = p.d_c_fname;
      base.d_c_lname = p.d_c_lname;
      return base;
    });
    clearResult();
    setStatus("");
    setStatusKind("");
  }

  async function upload() {
    setBusy(true);
    setStatus("");
    setStatusKind("");
    clearResult();

    try {
      if (!form.file) throw new Error("Please select a file.");
      if (!form.d_key.trim()) throw new Error("Document Type is required.");
      if (!docTypeInfo) throw new Error("Document Type not found.");
      if (!form.e_id.trim()) throw new Error("Employee ID is required.");
      if (!employeeInfo) throw new Error("Employee not found.");
      if (!form.d_u_id.trim()) throw new Error("Creator ID is required.");

      const fileSafe = sanitizeFileName(form.file.name);
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const storagePath = `${yyyy}/${mm}/${crypto.randomUUID()}_${fileSafe}`;

      const hashHex = await sha256Hex(form.file);

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, form.file, {
        contentType: form.file.type || "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;

      const payload = {
        d_key: form.d_key.trim(),
        d_date: now.toISOString(),
        e_id: form.e_id.trim(),
        e_compc: (employeeInfo as any).e_compc ?? null,
        e_wloc: (employeeInfo as any).e_wloc ?? null,
        e_lhold: !!(employeeInfo as any).e_lhold,
        e_hr: !!(employeeInfo as any).e_hr,
        e_geb: !!(employeeInfo as any).e_geb,
        d_file: fileSafe,
        d_text: null,
        d_hash: hashHex,
        d_pages: null,
        d_u_id: form.d_u_id.trim(),
        d_c_fname: form.d_c_fname.trim(),
        d_c_lname: form.d_c_lname.trim(),
        d_case: form.d_case.trim() ? form.d_case.trim() : null,
        d_r_taxcode: (docTypeInfo as any).d_r_taxcode ?? "",
        d_r_rule: (docTypeInfo as any).d_r_rule ?? "",
        d_r_trigger: (docTypeInfo as any).d_r_trigger ?? "",
        d_r_month: Number((docTypeInfo as any).d_r_month ?? 0),
        d_r_deletion: null,
        d_r_status: "not started",
        d_stor: BUCKET,
        d_path: storagePath,
        d_mime: form.file.type || "application/pdf",
        d_size: form.file.size,
      };

      const { data: insData, error: insErr } = await supabase.from("documents").insert(payload).select("*").single();
      if (insErr) throw insErr;

      setResultRow(insData as DocumentRow);
      setStatusKind("success");
      setStatus("Successful");
      setShowPostButtons(true);
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Display values (before/after upload)
  const displayDocId = resultRow?.d_id ?? "";
  const displayAddDate = resultRow?.d_date ? formatDateTimeDMYYHM(resultRow.d_date) : "";
  const displayPages = resultRow?.d_pages ?? "";
  const displayHash = resultRow?.d_hash ?? "";
  const displayOrigFile = resultRow?.d_file ?? (form.file ? sanitizeFileName(form.file.name) : "");
  const displayContent = resultRow?.d_text ?? "";
  const displayTax = resultRow?.d_r_taxcode ?? (docTypeInfo?.d_r_taxcode ?? "");
  const displayRule = resultRow?.d_r_rule ?? (docTypeInfo?.d_r_rule ?? "");
  const displayTrigger = resultRow?.d_r_trigger ?? (docTypeInfo?.d_r_trigger ?? "");
  const displayMonth = resultRow?.d_r_month ?? (docTypeInfo?.d_r_month ?? "");
  const displayDeletion = resultRow?.d_r_deletion ?? "";
  const displayRStatus = resultRow?.d_r_status ?? "not started";

  const displayCompc = resultRow?.e_compc ?? (employeeInfo?.e_compc ?? "");
  const displayWloc = resultRow?.e_wloc ?? (employeeInfo?.e_wloc ?? "");
  const displayLHold = resultRow ? yesNo(resultRow.e_lhold) : yesNo(employeeInfo?.e_lhold ?? false);
  const displayHr = resultRow ? yesNo(resultRow.e_hr) : yesNo(employeeInfo?.e_hr ?? false);
  const displayGeb = resultRow ? yesNo(resultRow.e_geb) : yesNo(employeeInfo?.e_geb ?? false);

  const displayStor = resultRow?.d_stor ?? BUCKET;
  const displayPath = resultRow?.d_path ?? "";
  const displayMime = resultRow?.d_mime ?? (form.file?.type || (form.file ? "application/pdf" : ""));
  const displaySize = resultRow?.d_size ?? (form.file?.size ?? "");

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Document Upload</h1>
      <PageInfo cName="USR_SIN_UPL" />
      {/* DOCUMENT */}
      <div className={styles.card} style={{ background: isDragging ? "#b4e5a2" : undefined }}>
        <h2 className={styles.sectionTitle}>File Upload</h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            pickFile(e.dataTransfer.files?.[0] ?? null);
          }}
          
        >
          <div className={styles.status} style={{ marginBottom: 8}}>
            {form.file ? `Selected File: ${fileName}` : "Drop a file here, or choose a file."}
          </div>

          <label className={styles.button} style={{ display: "inline-block" }}>
            Choose File
            <input
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              disabled={busy}
              onClick={(e) => ((e.target as HTMLInputElement).value = "")}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      {/* MAIN (do not change) */}
      <div className={styles.card}>
        <h2 className={styles.subtitle}>Main</h2>




<div
  className={styles.searchGrid}
  style={{
    gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)",
    alignItems: "end",
  }}
>
  {/* Row 1 */}
  <div className={styles.field}>
    <label>Employee ID</label>

    {/* icon links vom Feld */}
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className={styles.iconButton}
        onClick={openEmpSearch}
        title="Search Employee"
        disabled={busy}
        style={{ flex: "0 0 auto" }}
      >
        🔎
      </button>

      <input value={form.e_id} disabled placeholder="Select via search" style={{ flex: 1 }} />
    </div>
  </div>

  <div className={styles.field}>
    <label>Name</label>
    <input value={form.e_name} disabled />
  </div>

  {/* Row 2 */}
  <div />
  <div className={styles.field}>
    <label>Status and Location</label>
    <input value={form.e_status_wloc} disabled />
  </div>

  {/* Row 3 */}
  <div />
  <div className={styles.field}>
    <label>Company</label>
    <input value={form.e_compn} disabled />
  </div>

  {/* Row 4 */}
  <div />
  <div className={styles.field}>
    <label>Org Unit</label>
    <input value={form.e_ouna} disabled />
  </div>

  {/* Row 5 */}
  <div className={styles.field}>
    <label>Document Type</label>
    <select
      value={form.d_key}
      onChange={(e) => setForm((p) => ({ ...p, d_key: e.target.value }))}
      onMouseDown={handleDocTypeOpen}
      onFocus={handleDocTypeOpen}
      disabled={busy}
    >
      <option value="">-- select --</option>
      {docTypeOptions
        .slice()
        .sort((a, b) => {
          const wloc = (employeeInfo?.e_wloc ?? "").trim();
          const prefix = wloc ? `${wloc}` : "";
          const aIs = prefix ? a.d_key.startsWith(prefix) : false;
          const bIs = prefix ? b.d_key.startsWith(prefix) : false;
          if (aIs !== bIs) return aIs ? -1 : 1;
          return a.d_key.localeCompare(b.d_key);
        })
        .map((x) => (
          <option key={x.d_key} value={x.d_key}>
            {x.d_key} {x.d_name ? `| ${x.d_name}` : ""}
          </option>
        ))}
    </select>
  </div>

  <div className={styles.field}>
    <label>Group</label>
    <input value={form.d_group} disabled />
  </div>

  {/* Row 6 */}
  <div />
  <div className={styles.field}>
    <label>Type Name</label>
    <input value={form.d_name} disabled />
  </div>
</div>


   




      </div>

      {/* ACTIONS */}
      <div className={styles.card}>
        <div className={styles.actions} style={{ flexWrap: "wrap" }}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={upload} disabled={busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
          <button className={styles.button} onClick={resetAll} disabled={busy}>
            Cancel
          </button>
          {status && <span className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>Result: {status}</span>}
        </div>

        {showPostButtons && (
          <div className={styles.actions} style={{ marginTop: 12, flexWrap: "wrap" }}>
            <button className={styles.button} onClick={resetAll} disabled={busy}>
              New
            </button>
            <button className={styles.button} onClick={resetKeepEmployee} disabled={busy}>
              New - same Employee
            </button>
            <button className={styles.button} onClick={resetKeepEmployeeAndDocType} disabled={busy}>
              New - same Employee &amp; Doc Type
            </button>
          </div>
        )}
      </div>

      {/* MORE PROPERTIES (closed by default) */}
      <div className={styles.card}>
        <details>
          <summary className={styles.subtitle}>More Properties</summary>

          <div className={styles.sectionGrid} style={{ marginTop: 12 }}>
            {/* DOCUMENT */}
            <div className={styles.sectionBox}>
              <div className={styles.sectionHeader}>Document</div>
              <div className={styles.formGrid} style={{ gridTemplateColumns: "180px 1fr" }}>
                <div className={styles.field}>
                  <label>Doc ID</label>
                  <input value={displayDocId} disabled />
                </div>
                <div className={styles.field}>
                  <label>Add Date</label>
                  <input value={displayAddDate} disabled />
                </div>
                <div className={styles.field}>
                  <label>Pages</label>
                  <input value={String(displayPages)} disabled />
                </div>
                <div className={styles.field}>
                  <label>Check Num</label>
                  <input value={displayHash} disabled />
                </div>
                <div className={styles.field}>
                  <label>Original File Name</label>
                  <input value={displayOrigFile} disabled />
                </div>
                <div className={styles.field}>
                  <label>Content</label>
                  <input value={displayContent} disabled />
                </div>
              </div>
            </div>

            {/* RETENTION */}
            <div className={styles.sectionBox}>
              <div className={styles.sectionHeader}>Retention</div>
              <div className={styles.formGrid} style={{ gridTemplateColumns: "180px 1fr" }}>
                <div className={styles.field}>
                  <label>Taxonomy</label>
                  <input value={displayTax} disabled />
                </div>
                <div className={styles.field}>
                  <label>Rule</label>
                  <input value={displayRule} disabled />
                </div>
                <div className={styles.field}>
                  <label>Trigger</label>
                  <input value={displayTrigger} disabled />
                </div>
                <div className={styles.field}>
                  <label>Month</label>
                  <input value={String(displayMonth)} disabled />
                </div>
                <div className={styles.field}>
                  <label>Deletion Date</label>
                  <input value={displayDeletion} disabled />
                </div>
                <div className={styles.field}>
                  <label>Retention Status</label>
                  <input value={displayRStatus} disabled />
                </div>
              </div>
            </div>

            {/* EMPLOYEE */}
            <div className={styles.sectionBox}>
              <div className={styles.sectionHeader}>Employee</div>
              <div className={styles.formGrid} style={{ gridTemplateColumns: "180px 1fr" }}>
                <div className={styles.field}>
                  <label>Company Code</label>
                  <input value={displayCompc} disabled />
                </div>
                <div className={styles.field}>
                  <label>Country</label>
                  <input value={displayWloc} disabled />
                </div>
                <div className={styles.field}>
                  <label>Legal Hold</label>
                  <input value={displayLHold} disabled />
                </div>
                <div className={styles.field}>
                  <label>HR Employee</label>
                  <input value={displayHr} disabled />
                </div>
                <div className={styles.field}>
                  <label>GEB Member</label>
                  <input value={displayGeb} disabled />
                </div>
              </div>
            </div>

            {/* OTHERS */}
            <div className={styles.sectionBox}>
              <div className={styles.sectionHeader}>Others</div>
              <div className={styles.formGrid} style={{ gridTemplateColumns: "180px 1fr" }}>
                <div className={styles.field}>
                  <label>Case ID</label>
                  <input value={form.d_case} onChange={(e) => setForm((p) => ({ ...p, d_case: e.target.value }))} disabled={busy} />
                </div>
                <div className={styles.field}>
                  <label>Storage</label>
                  <input value={displayStor} disabled />
                </div>
                <div className={styles.field}>
                  <label>Path</label>
                  <input value={displayPath} disabled />
                </div>
                <div className={styles.field}>
                  <label>MIME Type</label>
                  <input value={displayMime} disabled />
                </div>
                <div className={styles.field}>
                  <label>Size in Bytes</label>
                  <input value={displaySize ? String(displaySize) : ""} disabled />
                </div>
              </div>
            </div>

            {/* CREATOR */}
            <div className={styles.sectionBox} style={{ gridColumn: "1 / -1" }}>
              <div className={styles.sectionHeader}>Creator</div>
              <div className={styles.formGrid} style={{ gridTemplateColumns: "180px 1fr" }}>
                <div className={styles.field}>
                  <label>Creator ID</label>
                  <input value={form.d_u_id} onChange={(e) => setForm((p) => ({ ...p, d_u_id: e.target.value }))} disabled={busy} />
                </div>
                <div className={styles.field}>
                  <label>Creator Name</label>
                  <input value={form.creator_name} disabled />
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>

{empSearchOpen && (
  <div role="dialog" aria-modal="true" className={styles.modalOverlay} onClick={closeEmpSearch}>
    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
      <h2 className={styles.modalTitle}>Search Employee</h2>

      {/* Search inputs */}
      <div className={styles.searchGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 12 }}>
        <div className={styles.field}>
          <label>Employee ID</label>
          <input value={empSearchEid} onChange={(e) => setEmpSearchEid(e.target.value)} disabled={empSearchBusy} />
        </div>

        <div className={styles.field}>
          <label>Name</label>
          <input value={empSearchName} onChange={(e) => setEmpSearchName(e.target.value)} disabled={empSearchBusy} />
        </div>

        <div className={styles.field}>
          <label>Work Location</label>
          <input value={empSearchWloc} onChange={(e) => setEmpSearchWloc(e.target.value)} disabled={empSearchBusy} />
        </div>
      </div>

      <div className={styles.modalActions} style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={runEmpSearch} disabled={empSearchBusy}>
            {empSearchBusy ? "Searching…" : "Search"}
          </button>
          <button className={styles.button} onClick={() => { setEmpSearchEid(""); setEmpSearchName(""); setEmpSearchWloc(""); setEmpSearchRows([]); }} disabled={empSearchBusy}>
            Clear
          </button>
        </div>

        <button className={styles.button} onClick={closeEmpSearch} disabled={empSearchBusy}>
          Close
        </button>
      </div>

      {/* Results */}
      <div style={{ marginTop: 12, maxHeight: "50vh", overflowY: "auto" }}>
        {empSearchRows.length === 0 ? (
          <div className={styles.status}>No results.</div>
        ) : (
          <table className={styles.table} style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "160px" }} />
              <col style={{ width: "1fr" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Work Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empSearchRows.map((r) => {
                const name = `${r.e_lname ?? ""}${r.e_lname && r.e_fname ? ", " : ""}${r.e_fname ?? ""}`.trim();
                return (
                  <tr key={r.e_id}>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.e_id}</td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={name}>
                      {name}
                    </td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.e_wloc ?? ""}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => pickEmployee(r)}>
                        Select
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </div>
)}





    </main>
  );
}
