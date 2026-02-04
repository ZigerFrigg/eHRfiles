"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type EmployeeRow = {
  e_id: string; // 8 digits, text
  u_id: string | null;
  e_fname: string | null;
  e_lname: string | null;
  e_class: string | null;
  e_status: "Active" | "Terminated" | string | null;
  e_join: string | null; // ISO date (YYYY-MM-DD) or null
  e_tdate: string | null; // ISO date (YYYY-MM-DD) or null
  e_wloc: string | null;
  e_compc: string | null;
  e_compn: string | null;
  e_ouco: string | null;
  e_ouna: string | null;
  e_lhold: boolean;
  e_hr: boolean;
  e_geb: boolean;
  e_upd: string | null; // date or timestamp/text depending on DB
};

const yesNo = (v: boolean) => (v ? "yes" : "no");
const nowIsoTimestamp = () => new Date().toISOString(); // e.g. 2026-01-06T15:24:12.345Z

// --- display date in format d-mmm-yy ---
function formatDateDMYY(value: string | null): string {
  if (!value) return "";

  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);

  return `${day}-${month}-${year}`;
}

// --- display date+time in format d-mmm-yy HH:MM ---
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

// --- CSV parsing helpers (supports quotes, delimiter ';') ---
function splitCsvLineSemicolonQuoted(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ";" && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out.map((v) => v.trim());
}

function parseBool(val: string): boolean {
  const v = (val ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

function parseNullableString(val: string): string | null {
  const v = (val ?? "").trim();
  return v === "" ? null : v;
}

// Accepts: YYYY-MM-DD, DD-Mon-YY, D-Mon-YY, DD-Mon-YYYY (e.g. 1-Jan-20, 15-Aug-25)
// Returns ISO YYYY-MM-DD or null
function parseNullableDateToIso(val: string, fieldName: string, lineNo: number): string | null {
  const v = (val ?? "").trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^([0-3]?\d)-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (m) {
    const dd = Number.parseInt(m[1], 10);
    const mon = m[2].toLowerCase();
    const yy = m[3];

    const monthMap: Record<string, number> = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };

    const mm = monthMap[mon];
    if (!mm) throw new Error(`${fieldName} invalid month "${m[2]}" in line ${lineNo}.`);

    let yyyy = Number.parseInt(yy, 10);
    if (yy.length === 2) {
      yyyy = yyyy <= 69 ? 2000 + yyyy : 1900 + yyyy;
    }

    if (dd < 1 || dd > 31) throw new Error(`${fieldName} invalid day "${m[1]}" in line ${lineNo}.`);

    return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  throw new Error(`${fieldName} has invalid date format "${v}" in line ${lineNo}. Use YYYY-MM-DD or e.g. 15-Aug-25.`);
}

function parseEmployeesCsvWithHeader(text: string): EmployeeRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = splitCsvLineSemicolonQuoted(lines[0]).map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const required = [
    "E_ID",
    "U_ID",
    "E_FNAME",
    "E_LNAME",
    "E_CLASS",
    "E_STATUS",
    "E_JOIN",
    "E_TDATE",
    "E_WLOC",
    "E_COMPC",
    "E_COMPN",
    "E_OUCO",
    "E_OUNA",
    "E_LHOLD",
    "E_HR",
    "E_GEB",
  ];

  const missing = required.filter((h) => idx(h) === -1);
  if (missing.length) {
    throw new Error(`CSV header missing: ${missing.join(", ")} (delimiter ";", quotes supported).`);
  }

  const out: EmployeeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLineSemicolonQuoted(lines[i]);
    const lineNo = i + 1;

    const e_id = (cols[idx("E_ID")] ?? "").trim();
    if (!/^\d{8}$/.test(e_id)) {
      throw new Error(`E_ID must be exactly 8 digits in line ${lineNo}. Got "${e_id}".`);
    }

    const e_status = parseNullableString(cols[idx("E_STATUS")] ?? "");

    const row: EmployeeRow = {
      e_id,
      u_id: parseNullableString(cols[idx("U_ID")] ?? ""),
      e_fname: parseNullableString(cols[idx("E_FNAME")] ?? ""),
      e_lname: parseNullableString(cols[idx("E_LNAME")] ?? ""),
      e_class: parseNullableString(cols[idx("E_CLASS")] ?? ""),
      e_status,
      e_join: parseNullableDateToIso(cols[idx("E_JOIN")] ?? "", "E_JOIN", lineNo),
      e_tdate: parseNullableDateToIso(cols[idx("E_TDATE")] ?? "", "E_TDATE", lineNo),
      e_wloc: parseNullableString(cols[idx("E_WLOC")] ?? ""),
      e_compc: parseNullableString(cols[idx("E_COMPC")] ?? ""),
      e_compn: parseNullableString(cols[idx("E_COMPN")] ?? ""),
      e_ouco: parseNullableString(cols[idx("E_OUCO")] ?? ""),
      e_ouna: parseNullableString(cols[idx("E_OUNA")] ?? ""),
      e_lhold: parseBool(cols[idx("E_LHOLD")] ?? "false"),
      e_hr: parseBool(cols[idx("E_HR")] ?? "false"),
      e_geb: parseBool(cols[idx("E_GEB")] ?? "false"),
      e_upd: null, // system managed
    };

    if (row.e_status && row.e_status !== "Terminated") {
      row.e_tdate = null;
    }

    out.push(row);
  }

  // Dedup by e_id (last wins)
  const map = new Map<string, EmployeeRow>();
  for (const r of out) map.set(r.e_id, r);
  return Array.from(map.values());
}

function rowsEqualForUpsert(a: EmployeeRow, b: EmployeeRow): boolean {
  // Compare all fields except e_upd (system managed)
  return (
    a.e_id === b.e_id &&
    (a.u_id ?? null) === (b.u_id ?? null) &&
    (a.e_fname ?? null) === (b.e_fname ?? null) &&
    (a.e_lname ?? null) === (b.e_lname ?? null) &&
    (a.e_class ?? null) === (b.e_class ?? null) &&
    (a.e_status ?? null) === (b.e_status ?? null) &&
    (a.e_join ?? null) === (b.e_join ?? null) &&
    (a.e_tdate ?? null) === (b.e_tdate ?? null) &&
    (a.e_wloc ?? null) === (b.e_wloc ?? null) &&
    (a.e_compc ?? null) === (b.e_compc ?? null) &&
    (a.e_compn ?? null) === (b.e_compn ?? null) &&
    (a.e_ouco ?? null) === (b.e_ouco ?? null) &&
    (a.e_ouna ?? null) === (b.e_ouna ?? null) &&
    a.e_lhold === b.e_lhold &&
    a.e_hr === b.e_hr &&
    a.e_geb === b.e_geb
  );
}

type SortKey = keyof Pick<
  EmployeeRow,
  | "e_id"
  | "u_id"
  | "e_fname"
  | "e_lname"
  | "e_class"
  | "e_status"
  | "e_join"
  | "e_tdate"
  | "e_wloc"
  | "e_compc"
  | "e_compn"
  | "e_ouco"
  | "e_ouna"
  | "e_lhold"
  | "e_hr"
  | "e_geb"
  | "e_upd"
>;

type SortDir = "asc" | "desc";

function compareNullable(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;

  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export default function AdminEmployeesPage() {
  const router = useRouter();

  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<EmployeeRow | null>(null);
  const [editOriginal, setEditOriginal] = useState<EmployeeRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("e_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Paging
  const [pageSize, setPageSize] = useState<number>(10);
  const [pageIndex, setPageIndex] = useState<number>(0);

  async function fetchRows() {
    const { data, error } = await supabase
      .from("employees")
      .select(
        "e_id, u_id, e_fname, e_lname, e_class, e_status, e_join, e_tdate, e_wloc, e_compc, e_compn, e_ouco, e_ouna, e_lhold, e_hr, e_geb, e_upd"
      )
      .order("e_id");

    if (error) throw error;
    setRows((data ?? []) as EmployeeRow[]);
  }

  useEffect(() => {
    fetchRows().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reset paging when sort/page-size changes or new data loaded
  useEffect(() => {
    setPageIndex(0);
  }, [rows, pageSize, sortKey, sortDir]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const res = compareNullable(a[sortKey], b[sortKey]);
      return sortDir === "asc" ? res : -res;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(sorted.length / pageSize)), [sorted.length, pageSize]);

  const paged = useMemo(() => {
    const start = pageIndex * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageIndex, pageSize]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  function openEdit(row: EmployeeRow) {
    setEditRow({ ...row });
    setEditOriginal({ ...row });
    setEditOpen(true);
    setStatus("");
    setStatusKind("");
  }

  async function saveEdit() {
    if (!editRow) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const trimmed: EmployeeRow = {
        ...editRow,
        e_id: editRow.e_id.trim(),
        u_id: editRow.u_id?.trim() || null,
        e_fname: editRow.e_fname?.trim() || null,
        e_lname: editRow.e_lname?.trim() || null,
        e_class: editRow.e_class?.trim() || null,
        e_status: editRow.e_status?.trim() || null,
        e_join: editRow.e_join?.trim() || null,
        e_tdate: editRow.e_tdate?.trim() || null,
        e_wloc: editRow.e_wloc?.trim() || null,
        e_compc: editRow.e_compc?.trim() || null,
        e_compn: editRow.e_compn?.trim() || null,
        e_ouco: editRow.e_ouco?.trim() || null,
        e_ouna: editRow.e_ouna?.trim() || null,
      };

      if (!/^\d{8}$/.test(trimmed.e_id)) throw new Error("Employee key (E_ID) must be exactly 8 digits.");

      // Normalize dates to ISO if provided
      trimmed.e_join = parseNullableDateToIso(trimmed.e_join ?? "", "E_JOIN", 0);
      trimmed.e_tdate = parseNullableDateToIso(trimmed.e_tdate ?? "", "E_TDATE", 0);

      if (trimmed.e_status && trimmed.e_status !== "Terminated") {
        trimmed.e_tdate = null;
      }

      const changed = editOriginal ? !rowsEqualForUpsert(trimmed, editOriginal) : true;
      const toSave = changed ? { ...trimmed, e_upd: nowIsoTimestamp() } : trimmed;

      const { error } = await supabase.from("employees").upsert(toSave, { onConflict: "e_id" });
      if (error) throw error;

      await fetchRows();
      setEditOpen(false);
      setEditRow(null);
      setEditOriginal(null);

      setStatusKind("success");
      setStatus(changed ? "Successful: Record saved (E_UPD updated)." : "Successful: No changes detected.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow?.e_id) return;
    if (!confirm(`Delete employee ${editRow.e_id}?`)) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const { error } = await supabase.from("employees").delete().eq("e_id", editRow.e_id);
      if (error) throw error;

      await fetchRows();
      setEditOpen(false);
      setEditRow(null);
      setEditOriginal(null);

      setStatusKind("success");
      setStatus("Successful: Record deleted.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function onCsvSelected(file: File | null) {
    if (!file) return;

    setLoading(true);
    setStatus("");
    setStatusKind("");

    try {
      const text = await file.text();
      const parsed = parseEmployeesCsvWithHeader(text);
      const csvCount = parsed.length;

      if (csvCount === 0) throw new Error("CSV contains no data rows (after the header).");

      const dbMap = new Map<string, EmployeeRow>();
      for (const r of rows) dbMap.set(r.e_id, r);

      const toUpsert: EmployeeRow[] = [];
      let addCount = 0;
      let updateCount = 0;

      for (const csvRow of parsed) {
        const existing = dbMap.get(csvRow.e_id);
        const candidate: EmployeeRow = { ...csvRow, e_upd: nowIsoTimestamp() };

        if (!existing) {
          addCount++;
          toUpsert.push(candidate);
        } else {
          const existingComparable: EmployeeRow = { ...existing, e_upd: null };
          const csvComparable: EmployeeRow = { ...csvRow, e_upd: null };

          if (!rowsEqualForUpsert(existingComparable, csvComparable)) {
            updateCount++;
            toUpsert.push(candidate);
          }
        }
      }

      if (toUpsert.length === 0) {
        setStatusKind("success");
        setStatus(`Successful: No changes. Records in CSV: ${csvCount} | Records added: 0 | Records updated: 0`);
        return;
      }

      const batchSize = 500;
      for (let i = 0; i < toUpsert.length; i += batchSize) {
        const batch = toUpsert.slice(i, i + batchSize);
        const { error } = await supabase.from("employees").upsert(batch, { onConflict: "e_id" });
        if (error) throw error;
      }

      await fetchRows();

      setStatusKind("success");
      setStatus(`Successful: Records in CSV: ${csvCount} | Records added: ${addCount} | Records updated: ${updateCount}`);
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — Employees</h1>
      <PageInfo cName="ADM_EMPL" />
      <div className={styles.actions}>
        <label className={`${styles.button} ${styles.buttonPrimary}`} style={{ opacity: loading ? 0.6 : 1 }}>
          Update Employees (CSV)
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={loading}
            style={{ display: "none" }}
            onClick={(e) => {
              (e.target as HTMLInputElement).value = "";
            }}
            onChange={(e) => onCsvSelected(e.target.files?.[0] ?? null)}
          />
        </label>

        {loading && <span className={styles.status}>Loading…</span>}
        {status && <span className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</span>}
      </div>

      <div className={styles.tableInfo}>
        <strong>Records:</strong> {sorted.length}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Edit</th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_id")}>
                E_ID{sortIndicator("e_id")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("u_id")}>
                U_ID{sortIndicator("u_id")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_fname")}>
                First Name{sortIndicator("e_fname")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_lname")}>
                Last Name{sortIndicator("e_lname")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_class")}>
                Class{sortIndicator("e_class")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_status")}>
                Status{sortIndicator("e_status")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_join")}>
                Join{sortIndicator("e_join")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_tdate")}>
                Termination{sortIndicator("e_tdate")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_wloc")}>
                Work Location{sortIndicator("e_wloc")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_compc")}>
                Company Code{sortIndicator("e_compc")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_compn")}>
                Company Name{sortIndicator("e_compn")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_ouco")}>
                OU Code{sortIndicator("e_ouco")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_ouna")}>
                OU Name{sortIndicator("e_ouna")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_lhold")}>
                Legal Hold{sortIndicator("e_lhold")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_hr")}>
                HR{sortIndicator("e_hr")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_geb")}>
                GEB{sortIndicator("e_geb")}
              </button>
            </th>
            <th>
              <button type="button" className={styles.linkLike} onClick={() => toggleSort("e_upd")}>
                Last Update{sortIndicator("e_upd")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {paged.map((r) => (
            <tr key={r.e_id}>
              <td>
                <button onClick={() => openEdit(r)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{r.e_id}</td>
              <td>{r.u_id ?? ""}</td>
              <td>{r.e_fname ?? ""}</td>
              <td>{r.e_lname ?? ""}</td>
              <td>{r.e_class ?? ""}</td>
              <td>{r.e_status ?? ""}</td>
              <td>{formatDateDMYY(r.e_join)}</td>
              <td>{formatDateDMYY(r.e_tdate)}</td>
              <td>{r.e_wloc ?? ""}</td>
              <td>{r.e_compc ?? ""}</td>
              <td>{r.e_compn ?? ""}</td>
              <td>{r.e_ouco ?? ""}</td>
              <td>{r.e_ouna ?? ""}</td>
              <td>{yesNo(!!r.e_lhold)}</td>
              <td>{yesNo(!!r.e_hr)}</td>
              <td>{yesNo(!!r.e_geb)}</td>
              <td>{formatDateTimeDMYYHM(r.e_upd)}</td>
            </tr>
          ))}
        </tbody>
      </table>

{/* Paging */}
<div className={styles.paginationBar}>
  <button
    className={styles.button}
    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
    disabled={pageIndex <= 0}
  >
    Prev
  </button>

  <div className={`${styles.status} ${styles.pageIndicator}`}>
    Page {Math.min(pageIndex + 1, pageCount)} / {pageCount}
  </div>

  <div className={styles.pageSizeGroup}>
    <span className={styles.status}>Show</span>
    <select
      className={styles.pageSizeSelect}
      value={pageSize}
      onChange={(e) => setPageSize(Number.parseInt(e.target.value, 10))}
    >
      <option value={10}>10</option>
      <option value={50}>50</option>
      <option value={100}>100</option>
      <option value={500}>500</option>
    </select>
  </div>

  <button
    className={styles.button}
    onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
    disabled={pageIndex >= pageCount - 1}
  >
    Next
  </button>
</div>

      {editOpen && editRow && (
        <div
          role="dialog"
          aria-modal="true"
          className={styles.modalOverlay}
          onClick={() => {
            if (!editSaving) {
              setEditOpen(false);
              setEditRow(null);
              setEditOriginal(null);
            }
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Edit Employee</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>Employee Key (E_ID)</label>
                <input value={editRow.e_id} disabled />
                <small>E_ID is the key value (8 digits).</small>
              </div>

              <div className={styles.field}>
                <label>User ID (U_ID)</label>
                <input
                  value={editRow.u_id ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, u_id: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>First Name</label>
                <input
                  value={editRow.e_fname ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_fname: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Last Name</label>
                <input
                  value={editRow.e_lname ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_lname: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Employee Class</label>
                <input
                  value={editRow.e_class ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_class: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Status</label>
                <select
                  value={editRow.e_status ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_status: e.target.value || null } : p))}
                  disabled={editSaving}
                >
                  <option value="">(empty)</option>
                  <option value="Active">Active</option>
                  <option value="Terminated">Terminated</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Join Date</label>
                <input
                  placeholder="YYYY-MM-DD or 15-Aug-25"
                  value={editRow.e_join ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_join: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Termination Date</label>
                <input
                  placeholder="YYYY-MM-DD or 15-Aug-25"
                  value={editRow.e_tdate ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_tdate: e.target.value || null } : p))}
                  disabled={editSaving}
                />
                <small>Only used when Status is "Terminated".</small>
              </div>

              <div className={styles.field}>
                <label>Work Location</label>
                <input
                  value={editRow.e_wloc ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_wloc: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Company Code</label>
                <input
                  value={editRow.e_compc ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_compc: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Company Name</label>
                <input
                  value={editRow.e_compn ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_compn: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Organizational Unit Code</label>
                <input
                  value={editRow.e_ouco ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_ouco: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Organizational Unit Name</label>
                <input
                  value={editRow.e_ouna ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, e_ouna: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!editRow.e_lhold}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_lhold: e.target.checked } : p))}
                    disabled={editSaving}
                  />
                  Legal Hold
                </label>
              </div>

              <div className={styles.field}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!editRow.e_hr}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_hr: e.target.checked } : p))}
                    disabled={editSaving}
                  />
                  HR Employee
                </label>
              </div>

              <div className={styles.field}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!editRow.e_geb}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_geb: e.target.checked } : p))}
                    disabled={editSaving}
                  />
                  GEB Member
                </label>
              </div>

              <div className={styles.field}>
                <label>Last Update</label>
                <input value={formatDateTimeDMYYHM(editRow.e_upd)} disabled />
                <small>Set automatically on create or when at least one field changes.</small>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={() => {
                  if (!editSaving) {
                    setEditOpen(false);
                    setEditRow(null);
                    setEditOriginal(null);
                  }
                }}
                className={styles.button}
                disabled={editSaving}
              >
                Cancel
              </button>

              <button onClick={deleteEdit} className={styles.button} disabled={editSaving}>
                Delete
              </button>

              <button onClick={saveEdit} className={`${styles.button} ${styles.buttonPrimary}`} disabled={editSaving}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>

            {status && <p className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</p>}
          </div>
        </div>
      )}
    </main>
  );
}
