"use client";

import { useState } from "react";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";
import { supabase } from "@/lib/supabaseClient";

type OutRow = { label: string; value: string; isBlank?: boolean };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function pad3(n: number) {
  return String(n).padStart(3, "0");
}
function fmtTimeWithMs(d: Date) {
  // HH:MM:SS.mmm
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function AdminBatchLegalHoldPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<OutRow[]>([
    { label: "Start time", value: "" },
    { label: "", value: "", isBlank: true },
    { label: "Employees, Legal Hold = no", value: "" },
    { label: "Employees, Legal Hold = yes", value: "" },
    { label: "Employees, Total", value: "" },
    { label: "", value: "", isBlank: true },
    { label: "Legal Hold activated (Yes) for documents", value: "" },
    { label: "Legal Hold removed (No) for documents", value: "" },
    { label: "", value: "", isBlank: true },
    { label: "Documents, Legal Hold = no", value: "" },
    { label: "Documents, Legal Hold = yes", value: "" },
    { label: "Documents, Total", value: "" },
    { label: "", value: "", isBlank: true },
    { label: "End time", value: "" },
    { label: "Process duration", value: "" },
  ]);

  function setValue(label: string, value: string) {
    setRows((prev) => prev.map((r) => (r.label === label ? { ...r, value } : r)));
  }

  function clearAllValues() {
    setRows((prev) =>
      prev.map((r) => (r.isBlank ? r : { ...r, value: r.label ? "" : "" }))
    );
  }

  async function runBatch() {
    setBusy(true);
    setStatus("");
    clearAllValues();

    const startedAt = new Date();
    setValue("Start time", fmtTimeWithMs(startedAt));

    try {
      // ---------------------------
      // 1) Employee counts
      // ---------------------------
      const [{ count: empNo }, { count: empYes }, { count: empTotal }] = await Promise.all([
        supabase.from("employees").select("e_id", { count: "exact", head: true }).eq("e_lhold", false),
        supabase.from("employees").select("e_id", { count: "exact", head: true }).eq("e_lhold", true),
        supabase.from("employees").select("e_id", { count: "exact", head: true }),
      ]).then((res) => {
        // supabase-js returns objects { data, error, count }
        // throw first error if any
        for (const r of res as any[]) if (r.error) throw r.error;
        return res as any[];
      });

      setValue("Employees, Legal Hold = no", String(empNo ?? 0));
      setValue("Employees, Legal Hold = yes", String(empYes ?? 0));
      setValue("Employees, Total", String(empTotal ?? 0));

      // ---------------------------
      // 2) Determine docs to change
      // ---------------------------
      // Activate LH on docs: doc.e_lhold = false AND employee.e_lhold = true
      const { data: toActivate, error: actSelErr } = await supabase
        .from("documents")
        .select("d_id, e_id")
        .eq("e_lhold", false);

      if (actSelErr) throw actSelErr;

      // We need only those whose employee has e_lhold=true.
      // We do it by loading employee ids with e_lhold=true and intersect in memory.
      const { data: empYesRows, error: empYesErr } = await supabase
        .from("employees")
        .select("e_id")
        .eq("e_lhold", true);

      if (empYesErr) throw empYesErr;

      const empYesSet = new Set((empYesRows ?? []).map((x: any) => String(x.e_id)));

      const activateDocIds = (toActivate ?? [])
        .filter((d: any) => d.e_id && empYesSet.has(String(d.e_id)))
        .map((d: any) => String(d.d_id));

      // Remove LH on docs: doc.e_lhold = true AND employee.e_lhold = false
      const { data: toRemove, error: remSelErr } = await supabase
        .from("documents")
        .select("d_id, e_id")
        .eq("e_lhold", true);

      if (remSelErr) throw remSelErr;

      // employee no-set: easiest is to compute from empYesSet + total list.
      // We'll fetch employees with e_lhold=false for correctness.
      const { data: empNoRows, error: empNoErr2 } = await supabase
        .from("employees")
        .select("e_id")
        .eq("e_lhold", false);

      if (empNoErr2) throw empNoErr2;

      const empNoSet = new Set((empNoRows ?? []).map((x: any) => String(x.e_id)));

      const removeDocIds = (toRemove ?? [])
        .filter((d: any) => d.e_id && empNoSet.has(String(d.e_id)))
        .map((d: any) => String(d.d_id));

      // ---------------------------
      // 3) Update in chunks (avoid very long IN lists)
      // ---------------------------
      let activated = 0;
      let removed = 0;

      const actChunks = chunk(activateDocIds, 500);
      for (const ids of actChunks) {
        if (ids.length === 0) continue;
        const { error } = await supabase.from("documents").update({ e_lhold: true }).in("d_id", ids);
        if (error) throw error;
        activated += ids.length;
      }

      const remChunks = chunk(removeDocIds, 500);
      for (const ids of remChunks) {
        if (ids.length === 0) continue;
        const { error } = await supabase.from("documents").update({ e_lhold: false }).in("d_id", ids);
        if (error) throw error;
        removed += ids.length;
      }

      setValue("Legal Hold activated (Yes) for documents", String(activated));
      setValue("Legal Hold removed (No) for documents", String(removed));

      // ---------------------------
      // 4) Document counts after update
      // ---------------------------
      const [{ count: docNo }, { count: docYes }, { count: docTotal }] = await Promise.all([
        supabase.from("documents").select("d_id", { count: "exact", head: true }).eq("e_lhold", false),
        supabase.from("documents").select("d_id", { count: "exact", head: true }).eq("e_lhold", true),
        supabase.from("documents").select("d_id", { count: "exact", head: true }),
      ]).then((res) => {
        for (const r of res as any[]) if (r.error) throw r.error;
        return res as any[];
      });

      setValue("Documents, Legal Hold = no", String(docNo ?? 0));
      setValue("Documents, Legal Hold = yes", String(docYes ?? 0));
      setValue("Documents, Total", String(docTotal ?? 0));

      // ---------------------------
      // 5) End + duration
      // ---------------------------
      const endedAt = new Date();
      setValue("End time", fmtTimeWithMs(endedAt));
      setValue("Process duration", String(endedAt.getTime() - startedAt.getTime()) + " ms");

      setStatus("Successful: Legal Hold batch finished.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — Legal Hold Batch</h1>
      <PageInfo cName="ADM_LH_BATCH" />

      <section className={styles.searchPanel}>
        <div className={styles.actions} style={{ marginBottom: 12 }}>
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={runBatch}
            disabled={busy}
            title="Run Legal Hold Batch"
          >
            {busy ? "Running…" : "Run Legal Hold Batch"}
          </button>

          {status && (
            <span className={`${styles.status} ${status.startsWith("Error") ? styles.error : ""}`}>
              {status}
            </span>
          )}
        </div>

        <table className={styles.table} style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "420px" }} />
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
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.label}
                  </td>
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.value || ""}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
