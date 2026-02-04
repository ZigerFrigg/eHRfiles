"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type DocGroup = {
  g_name: string;
};

export default function AdminGroupsPage() {
  const router = useRouter();

  const [groups, setGroups] = useState<DocGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  // Add form
  const [newName, setNewName] = useState("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<DocGroup | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function loadGroups() {
    const { data, error } = await supabase.from("doc_groups").select("g_name").order("g_name");
    if (error) throw error;
    setGroups((data ?? []) as DocGroup[]);
  }

  useEffect(() => {
    loadGroups().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => a.g_name.localeCompare(b.g_name));
  }, [groups]);

  async function addGroup() {
    setLoading(true);
    setStatus("");
    setStatusKind("");

    try {
      const g_name = newName.trim();
      if (!g_name) throw new Error("Group Name is required.");

      // Insert (or update if already exists)
      const { error } = await supabase.from("doc_groups").upsert({ g_name }, { onConflict: "g_name" });
      if (error) throw error;

      setNewName("");
      await loadGroups();

      setStatusKind("success");
      setStatus("Successful: Group saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: DocGroup) {
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
      const g_name = editRow.g_name.trim();
      if (!g_name) throw new Error("Group Name is required.");

      const { error } = await supabase.from("doc_groups").upsert({ g_name }, { onConflict: "g_name" });
      if (error) throw error;

      await loadGroups();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Group saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow?.g_name) return;
    if (!confirm(`Delete group ${editRow.g_name}?`)) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const { error } = await supabase.from("doc_groups").delete().eq("g_name", editRow.g_name);
      if (error) throw error;

      await loadGroups();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Group deleted.");
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
      <h1 className={styles.title}>Admin — Doc Type Groups</h1>
      <PageInfo cName="ADM_GROUPS" />

      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Add Group</div>

        <div className={styles.searchGrid}>
          <div className={styles.field} style={{ gridColumn: "span 3" }}>
            <label>Group Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. EPF_GENERAL" />
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button onClick={addGroup} disabled={loading} className={`${styles.button} ${styles.buttonPrimary}`}>
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
            <th>Group Name</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => (
            <tr key={g.g_name}>
              <td>
                <button onClick={() => openEdit(g)} className={styles.iconButton} title="Edit">
                  ✎
                </button>
              </td>
              <td>{g.g_name}</td>
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
            <h2 className={styles.modalTitle}>Edit Group</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <label>Group Name</label>
                <input
                  value={editRow.g_name}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, g_name: e.target.value } : p))}
                  disabled={editSaving}
                />
                <small>Group Name is the key value.</small>
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
