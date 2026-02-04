"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type Role = {
  r_name: string;
  r_desc: string;
};

export default function AdminRolesPage() {
  const router = useRouter();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>(""); 

  // Add form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<Role | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function loadRoles() {
    const { data, error } = await supabase.from("roles").select("r_name, r_desc").order("r_name");
    if (error) throw error;
    setRoles((data ?? []) as Role[]);
  }

  useEffect(() => {
    loadRoles().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...roles].sort((a, b) => a.r_name.localeCompare(b.r_name));
  }, [roles]);

  async function addRole() {
    setLoading(true);
    setStatus(""); 
    setStatusKind(""); 

    try {
      const r_name = newName.trim();
      const r_desc = newDesc.trim();

      if (!r_name) throw new Error("Role Name is required.");
      if (!r_desc) throw new Error("Description is required.");

      // Insert (or update if already exists)
      const { error } = await supabase.from("roles").upsert({ r_name, r_desc }, { onConflict: "r_name" });
      if (error) throw error;

      setNewName("");
      setNewDesc("");
      await loadRoles();

      setStatusKind("success");
      setStatus("Successful: Role saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: Role) {
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
      const r_name = editRow.r_name.trim();
      const r_desc = editRow.r_desc.trim();

      if (!r_name) throw new Error("Role Name is required.");
      if (!r_desc) throw new Error("Description is required.");

      const { error } = await supabase.from("roles").upsert({ r_name, r_desc }, { onConflict: "r_name" });
      if (error) throw error;

      await loadRoles();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Role saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow?.r_name) return;
    if (!confirm(`Delete role ${editRow.r_name}?`)) return;

    setEditSaving(true);
    setStatus(""); 
    setStatusKind(""); 

    try {
      const { error } = await supabase.from("roles").delete().eq("r_name", editRow.r_name);
      if (error) throw error;

      await loadRoles();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Role deleted.");
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
      <h1 className={styles.title}>Admin — Roles</h1>
      <PageInfo cName="ADM_ROLES" />
      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Add Role</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label>Role Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. SysAdmin" />
          </div>

          <div className={styles.field} style={{ gridColumn: "span 2" }}>
            <label>Description</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="e.g. Access to all functions"
            />
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button onClick={addRole} disabled={loading} className={`${styles.button} ${styles.buttonPrimary}`}>
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
            <th>Role Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.r_name}>
              <td>
                <button onClick={() => openEdit(r)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{r.r_name}</td>
              <td>{r.r_desc}</td>
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
            <h2 className={styles.modalTitle}>Edit Role</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>Role Name</label>
                <input
                  value={editRow.r_name}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, r_name: e.target.value } : p))}
                  disabled={editSaving}
                />
                <small>Role Name is the key value.</small>
              </div>

              <div className={styles.field}>
                <label>Description</label>
                <input
                  value={editRow.r_desc}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, r_desc: e.target.value } : p))}
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

              <button
                onClick={saveEdit}
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={editSaving}
              >
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
