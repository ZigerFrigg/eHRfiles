"use client";

import { useState } from "react";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";
import { supabase } from "@/lib/supabaseClient";

type OutRow = { label: string; value: string; isBlank?: boolean };

type RetDoc = {
  d_id: string;
  e_id: string | null;
  e_lhold: boolean | null;
  d_date: string | null;

  d_r_trigger: string; // "Cassation Date" | "Termination"
  d_r_rule: string; // exists
  d_r_month: number; // exists

  d_r_deletion: string | null; // should be YYYY-MM-DD
  d_r_status: string | null; // enum retention_status
};

type EmpMini = {
  e_id: string;
  e_status: string | null; // "Active" | "Terminated"
  e_tdate: string | null; // null for active, date for terminated
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function pad3(n: number) {
  return String(n).padStart(3, "0");
}
function fmtTimeWithMs(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateOnlyTs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isExpiredPerSpec(deletion: Date, today: Date) {
  return dateOnlyTs(deletion) < dateOnlyTs(today);
}

function addMonths(base: Date, months: number) {
  const d = new Date(base.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // handle month overflow (e.g., Jan 31 + 1 month)
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim();
}

function isTerminated(emp: EmpMini | undefined): boolean {
  if (!emp) return false;
  return norm(emp.e_status).toLowerCase() === "terminated";
}

export default function AdminBatchRetentionPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [rows, setRows] = useState<OutRow[]>([
    { label: "Start time", value: "" },
    { label: "", value: "", isBlank: true },

    { label: "Total number of documents", value: "" },
    { label: "", value: "", isBlank: true },

    { label: "Total number of updated retention status", value: "" },
    { label: "", value: "", isBlank: true },

    { label: 'Number of documents in status "not set"', value: "" },
    { label: 'Number of documents in status "not started"', value: "" },
    { label: 'Number of documents in status "started"', value: "" },
    { label: 'Number of documents in status "legal hold"', value: "" },
    { label: 'Number of documents in status "expired"', value: "" },

    { label: "", value: "", isBlank: true },
    { label: "End time", value: "" },
    { label: "Process duration", value: "" },
  ]);

  function setValue(label: string, value: string) {
    setRows((prev) => prev.map((r) => (r.label === label ? { ...r, value } : r)));
  }

  function clearAllValues() {
    setRows((prev) => prev.map((r) => (r.isBlank ? r : { ...r, value: "" })));
  }

  async function runBatch() {
    setBusy(true);
    setStatus("");
    clearAllValues();

    const startedAt = new Date();
    setValue("Start time", fmtTimeWithMs(startedAt));

    try {
      // 1) Load all documents required fields
      const { data: docs, error: docsErr } = await supabase
        .from("documents")
        .select("d_id, e_id, e_lhold, d_date, d_r_trigger, d_r_rule, d_r_month, d_r_deletion, d_r_status")
        .order("d_id", { ascending: true });

      if (docsErr) throw docsErr;

      const allDocs = (docs ?? []) as RetDoc[];
      setValue("Total number of documents", String(allDocs.length));

      // 2) Load employees for all referenced e_id
      const eIds = Array.from(new Set(allDocs.map((d) => d.e_id).filter(Boolean))) as string[];
      const empMap = new Map<string, EmpMini>();

      for (const part of chunk(eIds, 500)) {
        const { data: emps, error: empErr } = await supabase
          .from("employees")
          .select("e_id, e_status, e_tdate")
          .in("e_id", part);

        if (empErr) throw empErr;

        for (const e of (emps ?? []) as EmpMini[]) {
          empMap.set(e.e_id, e);
        }
      }

      const today = new Date();

      const statusCounts: Record<string, number> = {
        "not set": 0, // should become 0
        "not started": 0,
        "started": 0,
        "legal hold": 0,
        "expired": 0,
      };

      const updates: { d_id: string; d_r_status: string; d_r_deletion: string | null }[] = [];

      // 3) Process each document
      for (const d of allDocs) {
        // Defensive (should not happen)
        if (!d.d_id) continue;

        let newStatus: string;
        let newDeletion: string | null = null;

        // d) if document is legal hold => status legal hold, deletion blank
        if (!!d.e_lhold) {
          newStatus = "legal hold";
          newDeletion = null;
        } else {
          const trig = norm(d.d_r_trigger).toLowerCase(); // "cassation date" or "termination"
          const months = Number(d.d_r_month);

          // Spec says: trigger/month are never empty, but keep a safe fallback:
          if (!trig || !Number.isFinite(months)) {
            newStatus = "not started"; // never "not set" per requirement
            newDeletion = null;
          } else if (trig === "termination") {
            // a/b) employee lookup determines active vs terminated
            const emp = d.e_id ? empMap.get(d.e_id) : undefined;

            if (!emp || !isTerminated(emp)) {
              // a) active -> not started, blank deletion
              newStatus = "not started";
              newDeletion = null;
            } else {
              // b) terminated -> started, deletion = termination date + n months
              const tdate = emp.e_tdate ? new Date(emp.e_tdate) : null;
              if (!tdate || Number.isNaN(tdate.getTime())) {
                newStatus = "not started";
                newDeletion = null;
              } else {
                const del = addMonths(tdate, months);
                newDeletion = toISODate(del);

                // e) if deletion date > today => expired
                newStatus = isExpiredPerSpec(del, today) ? "expired" : "started";
              }
            }
          } else if (trig === "cassation date") {
            // c) cassation date uses document add date
            const base = d.d_date ? new Date(d.d_date) : null;
            if (!base || Number.isNaN(base.getTime())) {
              // Should not happen if add date exists, but keep safe fallback
              newStatus = "not started";
              newDeletion = null;
            } else {
              const del = addMonths(base, months);
              newDeletion = toISODate(del);

              // e) if deletion date > today => expired
              newStatus = isExpiredPerSpec(del, today) ? "expired" : "started";
            }
          } else {
            // Unknown trigger -> still must not produce "not set"
            newStatus = "not started";
            newDeletion = null;
          }
        }

        // Count final status
        statusCounts[newStatus] = (statusCounts[newStatus] ?? 0) + 1;

        // Determine whether update is needed
        const oldStatus = norm(d.d_r_status);
        const oldDeletion = norm(d.d_r_deletion); // should already be YYYY-MM-DD or blank
        const nextDeletion = newDeletion ?? "";

        const changed = oldStatus !== newStatus || oldDeletion !== nextDeletion;

        if (changed) {
          updates.push({
            d_id: d.d_id,
            d_r_status: newStatus,
            d_r_deletion: newDeletion,
          });
        }
      }

      // Requirements: "no documents in not set" at the end
      // We ensure we never write "not set". Still show count (should be 0).
      setValue("Total number of updated retention status", String(updates.length));
      setValue('Number of documents in status "not set"', String(statusCounts["not set"] ?? 0));
      setValue('Number of documents in status "not started"', String(statusCounts["not started"] ?? 0));
      setValue('Number of documents in status "started"', String(statusCounts["started"] ?? 0));
      setValue('Number of documents in status "legal hold"', String(statusCounts["legal hold"] ?? 0));
      setValue('Number of documents in status "expired"', String(statusCounts["expired"] ?? 0));

      // 4) Apply updates (update only, never upsert)
      // For a mockup, per-row updates are fine and safe.
      for (const part of chunk(updates, 200)) {
        for (const u of part) {
          const { error } = await supabase
            .from("documents")
            .update({
              d_r_status: u.d_r_status,
              d_r_deletion: u.d_r_deletion,
            })
            .eq("d_id", u.d_id);

          if (error) throw error;
        }
      }

      const endedAt = new Date();
      setValue("End time", fmtTimeWithMs(endedAt));
      setValue("Process duration", `${endedAt.getTime() - startedAt.getTime()} ms`);

      setStatus("Successful: Retention batch finished.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — Retention Batch</h1>
      <PageInfo cName="ADM_RET_BATCH" />

      <section className={styles.searchPanel}>
        <div className={styles.actions} style={{ marginBottom: 12 }}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={runBatch} disabled={busy}>
            {busy ? "Running…" : "Run Retention Batch"}
          </button>

          {status && (
            <span className={`${styles.status} ${status.startsWith("Error") ? styles.error : ""}`}>{status}</span>
          )}
        </div>

        <table className={styles.table} style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "520px" }} />
            <col style={{ width: "220px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Element</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) =>
              r.isBlank ? (
                <tr key={idx}>
                  <td colSpan={2} style={{ height: 10, padding: 0, border: "none" }} />
                </tr>
              ) : (
                <tr key={idx}>
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</td>
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.value}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
