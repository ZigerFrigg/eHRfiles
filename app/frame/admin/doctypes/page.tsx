"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type DocTypeRow = {
  d_key: string; // Doc Type
  d_name: string; // Name
  d_group: string; // Group
  d_r_taxcode: string | null; // Taxonomy
  d_r_rule: string | null; // Rule
  d_r_trigger: "Termination" | "Cassation Date" | null; // Trigger
  d_r_month: number | null; // Month
};

const yesNo = (v: boolean) => (v ? "yes" : "no");

// --- CSV parsing helpers (supports quotes, delimiter ';') ---
// Header fields expected: D_KEY;D_NAME;D_GROUP;D_R_TAXCODE;D_R_RULE;D_R_TRIGGER;D_R_MONTH
function splitCsvLineSemicolonQuoted(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Handle escaped quotes ""
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

function parseTrigger(val: string): DocTypeRow["d_r_trigger"] {
  const v = (val ?? "").trim();
  if (!v) return null;
  if (v === "Termination" || v === "Cassation Date") return v;
  throw new Error(`Invalid Trigger "${v}". Allowed: Termination, Cassation Date (or empty).`);
}

function parseNullableInt(val: string): number | null {
  const v = (val ?? "").trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid Month "${v}". Expected integer (or empty).`);
  if (n < 0) throw new Error(`Invalid Month "${v}". Must be >= 0.`);
  return n;
}

function parseDocTypesCsvWithHeader(text: string): DocTypeRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = splitCsvLineSemicolonQuoted(lines[0]).map((h) => h.trim().toUpperCase());

  const idxKey = header.indexOf("D_KEY");
  const idxName = header.indexOf("D_NAME");
  const idxGroup = header.indexOf("D_GROUP");
  const idxTax = header.indexOf("D_R_TAXCODE");
  const idxRule = header.indexOf("D_R_RULE");
  const idxTrigger = header.indexOf("D_R_TRIGGER");
  const idxMonth = header.indexOf("D_R_MONTH");

  const required = [
    ["D_KEY", idxKey],
    ["D_NAME", idxName],
    ["D_GROUP", idxGroup],
    ["D_R_TAXCODE", idxTax],
    ["D_R_RULE", idxRule],
    ["D_R_TRIGGER", idxTrigger],
    ["D_R_MONTH", idxMonth],
  ] as const;

  const missing = required.filter(([, idx]) => idx === -1).map(([name]) => name);
  if (missing.length) {
    throw new Error(`CSV header missing: ${missing.join(", ")} (delimiter ";", quotes supported).`);
  }

  const out: DocTypeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLineSemicolonQuoted(lines[i]);

    const d_key = (cols[idxKey] ?? "").trim();
    const d_name = (cols[idxName] ?? "").trim();
    const d_group = (cols[idxGroup] ?? "").trim();
    const d_r_taxcode = parseNullableString(cols[idxTax] ?? "");
    const d_r_rule = parseNullableString(cols[idxRule] ?? "");
    const d_r_trigger = parseTrigger(cols[idxTrigger] ?? "");
    const d_r_month = parseNullableInt(cols[idxMonth] ?? "");

    if (!d_key) throw new Error(`D_KEY missing in line ${i + 1}.`);
    if (!d_name) throw new Error(`D_NAME missing in line ${i + 1}.`);
    if (!d_group) throw new Error(`D_GROUP missing in line ${i + 1}.`);

    out.push({ d_key, d_name, d_group, d_r_taxcode, d_r_rule, d_r_trigger, d_r_month });
  }

  // Dedup by d_key (last wins)
  const map = new Map<string, DocTypeRow>();
  for (const r of out) map.set(r.d_key, r);
  return Array.from(map.values());
}

export default function AdminDocTypesPage() {
  const router = useRouter();

  const [rows, setRows] = useState<DocTypeRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<DocTypeRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function fetchRows() {
    const { data, error } = await supabase
      .from("doc_types")
      .select("d_key, d_name, d_group, d_r_taxcode, d_r_rule, d_r_trigger, d_r_month")
      .order("d_key");

    if (error) throw error;
    setRows((data ?? []) as DocTypeRow[]);
  }

  useEffect(() => {
    fetchRows().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.d_key.localeCompare(b.d_key));
  }, [rows]);

  function openNew() {
    setEditRow({
      d_key: "",
      d_name: "",
      d_group: "",
      d_r_taxcode: null,
      d_r_rule: null,
      d_r_trigger: null,
      d_r_month: null,
    });
    setEditOpen(true);
    setStatus(""); 
    setStatusKind(""); 
  }

  function openEdit(row: DocTypeRow) {
    setEditRow({ ...row });
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
      const d_key = editRow.d_key.trim();
      const d_name = editRow.d_name.trim();
      const d_group = editRow.d_group.trim();

      if (!d_key) throw new Error("Doc Type is required.");
      if (!d_name) throw new Error("Name is required.");
      if (!d_group) throw new Error("Group is required.");

      if (editRow.d_r_month !== null && editRow.d_r_month < 0) {
        throw new Error("Month must be >= 0.");
      }

      const { error } = await supabase
        .from("doc_types")
        .upsert(
          {
            ...editRow,
            d_key,
            d_name,
            d_group,
            d_r_taxcode: editRow.d_r_taxcode?.trim() || null,
            d_r_rule: editRow.d_r_rule?.trim() || null,
          },
          { onConflict: "d_key" }
        );

      if (error) throw error;

      await fetchRows();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Record saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow?.d_key) return;
    if (!confirm(`Delete Doc Type ${editRow.d_key}?`)) return;

    setEditSaving(true);
    setStatus(""); 
    setStatusKind(""); 

    try {
      const { error } = await supabase.from("doc_types").delete().eq("d_key", editRow.d_key);
      if (error) throw error;

      await fetchRows();
      setEditOpen(false);
      setEditRow(null);

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
      const parsed = parseDocTypesCsvWithHeader(text);
      const csvCount = parsed.length;

      if (csvCount === 0) throw new Error("CSV contains no data rows (after the header).");

      const existingCount = rows.length;

      const { error: delErr } = await supabase.from("doc_types").delete().neq("d_key", "__never__");
      if (delErr) throw delErr;

      const batchSize = 500;
      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize);
        const { error: insErr } = await supabase.from("doc_types").insert(batch);
        if (insErr) throw insErr;
      }

      await fetchRows();

      setStatusKind("success");
      setStatus(
        `Successful: Records in CSV: ${csvCount} | Records deleted: ${existingCount} | Records added: ${csvCount}`
      );
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
      <h1 className={styles.title}>Admin — Document Types</h1>
      <PageInfo cName="ADM_DOCTYPE" />
      <div className={styles.actions}>
        <button onClick={openNew} disabled={loading} className={styles.button}>
          Add
        </button>

        <label className={`${styles.button} ${styles.buttonPrimary}`} style={{ opacity: loading ? 0.6 : 1 }}>
          Update Document Types (CSV)
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={loading}
            style={{ display: "none" }}
            onClick={(e) => {
              // allow selecting the same file repeatedly
              (e.target as HTMLInputElement).value = "";
            }}
            onChange={(e) => onCsvSelected(e.target.files?.[0] ?? null)}
          />
        </label>

        {loading && <span className={styles.status}>Loading…</span>}
        {status && (
          <span className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</span>
        )}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Edit</th>
            <th>Doc Type</th>
            <th>Name</th>
            <th>Group</th>
            <th>Taxonomy</th>
            <th>Rule</th>
            <th>Trigger</th>
            <th>Month</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.d_key}>
              <td>
                <button onClick={() => openEdit(r)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{r.d_key}</td>
              <td>{r.d_name}</td>
              <td>{r.d_group}</td>
              <td>{r.d_r_taxcode ?? ""}</td>
              <td>{r.d_r_rule ?? ""}</td>
              <td>{r.d_r_trigger ?? ""}</td>
              <td>{r.d_r_month ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {editOpen && editRow && (
        <div
          role="dialog"
          aria-modal="true"
          className={styles.modalOverlay}
          onClick={() => {
            if (!editSaving) {
              setEditOpen(false);
              setEditRow(null);
            }
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Edit Document Type</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>Doc Type</label>
                <input
                  value={editRow.d_key}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, d_key: e.target.value } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Name</label>
                <input
                  value={editRow.d_name}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, d_name: e.target.value } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Group</label>
                <input
                  value={editRow.d_group}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, d_group: e.target.value } : p))}
                  disabled={editSaving}
                />
              </div>


              <div className={styles.field}>
                <label>Taxonomy</label>
                <input
                  value={editRow.d_r_taxcode ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_taxcode: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Rule</label>
                <input
                  value={editRow.d_r_rule ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_rule: e.target.value || null } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Trigger</label>
                <select
                  value={editRow.d_r_trigger ?? ""}
                  onChange={(e) =>
                    setEditRow((p) =>
                      p ? { ...p, d_r_trigger: (e.target.value || null) as DocTypeRow["d_r_trigger"] } : p
                    )
                  }
                  disabled={editSaving}
                >
                  <option value="">(empty)</option>
                  <option value="Termination">Termination</option>
                  <option value="Cassation Date">Cassation Date</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Month</label>
                <input
                  type="number"
                  min={0}
                  value={editRow.d_r_month ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = v === "" ? null : Number.parseInt(v, 10);
                    setEditRow((p) => (p ? { ...p, d_r_month: n === null || Number.isNaN(n) ? null : n } : p));
                  }}
                  disabled={editSaving}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={() => {
                  if (!editSaving) {
                    setEditOpen(false);
                    setEditRow(null);
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

            {status && (
              <p className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
