"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";


type StatusKind = "success" | "error" | "";

type Role = { r_name: string; r_desc: string | null };
type DocGroup = { g_name: string };

type RoleDT = {
  rd_role: string;
  rd_doctype: string;
};

export default function AdminRolesDocTypeGroupsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<RoleDT[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<DocGroup[]>([]);

  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  // Add form (dropdowns)
  const [newRole, setNewRole] = useState("");
  const [newGroup, setNewGroup] = useState("");

  // Edit modal (dropdowns)
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<RoleDT | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function loadAll() {
    const [{ data: rdData, error: rdErr }, { data: rData, error: rErr }, { data: gData, error: gErr }] =
      await Promise.all([
        supabase.from("role_dt").select("rd_role, rd_doctype"),
        supabase.from("roles").select("r_name, r_desc").order("r_name"),
        supabase.from("doc_groups").select("g_name").order("g_name"),
      ]);

    if (rdErr) throw rdErr;
    if (rErr) throw rErr;
    if (gErr) throw gErr;

    setRows((rdData ?? []) as RoleDT[]);
    setRoles((rData ?? []) as Role[]);
    setGroups((gData ?? []) as DocGroup[]);
  }

  useEffect(() => {
    loadAll().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const c = a.rd_role.localeCompare(b.rd_role);
      if (c !== 0) return c;
      return a.rd_doctype.localeCompare(b.rd_doctype);
    });
  }, [rows]);

  function validate(rd_role: string, rd_doctype: string) {
    if (!rd_role) throw new Error("Role is required.");
    if (!rd_doctype) throw new Error("Doc Type Group is required.");
  }

  async function addRow() {
    setLoading(true);
    setStatus("");
    setStatusKind("");

    try {
      const rd_role = newRole.trim();
      const rd_doctype = newGroup.trim();

      validate(rd_role, rd_doctype);

      const { error } = await supabase.from("role_dt").insert({ rd_role, rd_doctype });
      if (error) throw error;

      setNewRole("");
      setNewGroup("");
      await loadAll();

      setStatusKind("success");
      setStatus("Successful: Mapping saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: RoleDT) {
    setEditRow(row);
    setEditRole(row.rd_role);
    setEditGroup(row.rd_doctype);
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
      const rd_role = editRole.trim();
      const rd_doctype = editGroup.trim();

      validate(rd_role, rd_doctype);

      if (rd_role !== editRow.rd_role || rd_doctype !== editRow.rd_doctype) {
        const { error: delErr } = await supabase
          .from("role_dt")
          .delete()
          .eq("rd_role", editRow.rd_role)
          .eq("rd_doctype", editRow.rd_doctype);
        if (delErr) throw delErr;

        const { error: insErr } = await supabase.from("role_dt").insert({ rd_role, rd_doctype });
        if (insErr) throw insErr;
      }

      await loadAll();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Mapping saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow) return;
    if (!confirm(`Delete mapping ${editRow.rd_role} → ${editRow.rd_doctype}?`)) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const { error } = await supabase
        .from("role_dt")
        .delete()
        .eq("rd_role", editRow.rd_role)
        .eq("rd_doctype", editRow.rd_doctype);
      if (error) throw error;

      await loadAll();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Mapping deleted.");
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
      <h1 className={styles.title}>Admin — Roles &amp; Doc Type Group Restrictions</h1>
      <PageInfo cName="ADM_RO_DT" /> 
      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Add Mapping</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label>Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="">Select…</option>
              {roles.map((r) => (
                <option key={r.r_name} value={r.r_name}>
                  {r.r_name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Doc Type Group</label>
            <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)}>
              <option value="">Select…</option>
              {groups.map((g) => (
                <option key={g.g_name} value={g.g_name}>
                  {g.g_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button onClick={addRow} disabled={loading} className={`${styles.button} ${styles.buttonPrimary}`}>
            {loading ? "Saving…" : "Save"}
          </button>

          {status && (
            <span className={`${styles.status} ${statusKind === "error" ? (styles as any).error : ""}`}>{status}</span>
          )}
        </div>
      </section>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Edit</th>
            <th>Role</th>
            <th>Doc Type Group</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((rd) => (
            <tr key={`${rd.rd_role}__${rd.rd_doctype}`}>
              <td>
                <button onClick={() => openEdit(rd)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{rd.rd_role}</td>
              <td>{rd.rd_doctype}</td>
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
            <h2 className={styles.modalTitle}>Edit Mapping</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} disabled={editSaving}>
                  <option value="">Select…</option>
                  {roles.map((r) => (
                    <option key={r.r_name} value={r.r_name}>
                      {r.r_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label>Doc Type Group</label>
                <select value={editGroup} onChange={(e) => setEditGroup(e.target.value)} disabled={editSaving}>
                  <option value="">Select…</option>
                  {groups.map((g) => (
                    <option key={g.g_name} value={g.g_name}>
                      {g.g_name}
                    </option>
                  ))}
                </select>
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
              <p className={`${styles.status} ${statusKind === "error" ? (styles as any).error : ""}`}>{status}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
