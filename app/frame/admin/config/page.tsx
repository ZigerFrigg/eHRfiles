"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type ConfigRow = {
  c_name: string;
  c_desc: string;
  c_value: string | null;
};

export default function AdminConfigPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  // Add form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newValue, setNewValue] = useState("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<ConfigRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function loadConfig() {
    const { data, error } = await supabase.from("config").select("c_name, c_desc, c_value").order("c_name");
    if (error) throw error;
    setRows((data ?? []) as ConfigRow[]);
  }

  useEffect(() => {
    loadConfig().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.c_name.localeCompare(b.c_name));
  }, [rows]);

  function validate(c_name: string, c_desc: string) {
    if (!c_name) throw new Error("Variable is required.");
    if (c_name.length > 100) throw new Error("Variable must be max. 100 characters.");
    if (!c_desc) throw new Error("Description is required.");
    if (c_desc.length > 255) throw new Error("Description must be max. 255 characters.");
  }

  async function addRow() {
    setLoading(true);
    setStatus("");
    setStatusKind("");

    try {
      const c_name = newName.trim();
      const c_desc = newDesc.trim();
      const c_value = newValue.trim() ? newValue : null;

      validate(c_name, c_desc);

      const { error } = await supabase.from("config").upsert({ c_name, c_desc, c_value }, { onConflict: "c_name" });
      if (error) throw error;

      setNewName("");
      setNewDesc("");
      setNewValue("");
      await loadConfig();

      setStatusKind("success");
      setStatus("Successful: Variable saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: ConfigRow) {
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
      const c_name = editRow.c_name.trim();
      const c_desc = editRow.c_desc.trim();
      const c_value = (editRow.c_value ?? "").trim() ? editRow.c_value : null;

      validate(c_name, c_desc);

      const { error } = await supabase.from("config").upsert({ c_name, c_desc, c_value }, { onConflict: "c_name" });
      if (error) throw error;

      await loadConfig();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Variable saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow?.c_name) return;
    if (!confirm(`Delete variable ${editRow.c_name}?`)) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const { error } = await supabase.from("config").delete().eq("c_name", editRow.c_name);
      if (error) throw error;

      await loadConfig();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Variable deleted.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — Config</h1>
      <PageInfo cName="ADM_CONF" />
      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Add Variable</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label>Variable</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. retention_notice_html"
            />
          </div>

          <div className={styles.field}>
            <label>Description</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="e.g. HTML shown in retention banner"
            />
          </div>

          <div className={styles.field} style={{ gridColumn: "span 2" }}>
            <label>Value / Content</label>
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              rows={4}
              placeholder="Free text, HTML allowed"
            />
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={addRow} disabled={loading} className={`${styles.button} ${styles.buttonPrimary}`}>
            {loading ? "Saving…" : "Save"}
          </button>

          {status && (
            <span className={`${styles.status} ${statusKind === "error" ? (styles as any).error : ""}`}>
              {status}
            </span>
          )}
        </div>
      </section>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Edit</th>
            <th>Variable</th>
            <th>Description</th>
            <th>Value / Content</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.c_name}>
              <td>
                <button onClick={() => openEdit(r)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{r.c_name}</td>
              <td>{r.c_desc}</td>
              <td style={{ maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.c_value ?? ""}
              </td>
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
            <h2 className={styles.modalTitle}>Edit Variable</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>Variable</label>
                <input
                  value={editRow.c_name}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, c_name: e.target.value } : p))}
                  disabled={editSaving}
                />
                <small>Variable is the key value.</small>
              </div>

              <div className={styles.field}>
                <label>Description</label>
                <input
                  value={editRow.c_desc}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, c_desc: e.target.value } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <label>Value / Content</label>
                <textarea
                  value={editRow.c_value ?? ""}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, c_value: e.target.value } : p))}
                  rows={8}
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
              <p className={`${styles.status} ${statusKind === "error" ? (styles as any).error : ""}`}>
                {status}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
