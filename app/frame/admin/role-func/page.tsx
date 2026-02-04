"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type Role = { r_name: string; r_desc: string | null };
type Func = { f_name: string; f_desc: string | null };

type RoleFunc = {
  rf_role: string;
  rf_function: string;
};

export default function AdminRolesFunctionsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<RoleFunc[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [funcs, setFuncs] = useState<Func[]>([]);

  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  // Add form (dropdowns)
  const [newRole, setNewRole] = useState("");
  const [newFunc, setNewFunc] = useState("");

  // Edit modal (dropdowns)
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<RoleFunc | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editFunc, setEditFunc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function loadAll() {
    const [{ data: rfData, error: rfErr }, { data: rData, error: rErr }, { data: fData, error: fErr }] =
      await Promise.all([
        supabase.from("role_func").select("rf_role, rf_function"),
        supabase.from("roles").select("r_name, r_desc").order("r_name"),
        supabase.from("functions").select("f_name, f_desc").order("f_name"),
      ]);

    if (rfErr) throw rfErr;
    if (rErr) throw rErr;
    if (fErr) throw fErr;

    setRows((rfData ?? []) as RoleFunc[]);
    setRoles((rData ?? []) as Role[]);
    setFuncs((fData ?? []) as Func[]);
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
      const c = a.rf_role.localeCompare(b.rf_role);
      if (c !== 0) return c;
      return a.rf_function.localeCompare(b.rf_function);
    });
  }, [rows]);

  function validate(rf_role: string, rf_function: string) {
    if (!rf_role) throw new Error("Role is required.");
    if (!rf_function) throw new Error("Function is required.");
  }

  async function addRow() {
    setLoading(true);
    setStatus("");
    setStatusKind("");

    try {
      const rf_role = newRole.trim();
      const rf_function = newFunc.trim();

      validate(rf_role, rf_function);

      const { error } = await supabase.from("role_func").insert({ rf_role, rf_function });
      if (error) throw error;

      setNewRole("");
      setNewFunc("");
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

  function openEdit(row: RoleFunc) {
    setEditRow(row);
    setEditRole(row.rf_role);
    setEditFunc(row.rf_function);
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
      const rf_role = editRole.trim();
      const rf_function = editFunc.trim();

      validate(rf_role, rf_function);

      if (rf_role !== editRow.rf_role || rf_function !== editRow.rf_function) {
        const { error: delErr } = await supabase
          .from("role_func")
          .delete()
          .eq("rf_role", editRow.rf_role)
          .eq("rf_function", editRow.rf_function);
        if (delErr) throw delErr;

        const { error: insErr } = await supabase.from("role_func").insert({ rf_role, rf_function });
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
    if (!confirm(`Delete mapping ${editRow.rf_role} → ${editRow.rf_function}?`)) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const { error } = await supabase
        .from("role_func")
        .delete()
        .eq("rf_role", editRow.rf_role)
        .eq("rf_function", editRow.rf_function);
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
      <h1 className={styles.title}>Admin — Roles &amp; Functions</h1>
      <PageInfo cName="ADM_RO_FU" />
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
            <label>Function</label>
            <select value={newFunc} onChange={(e) => setNewFunc(e.target.value)}>
              <option value="">Select…</option>
              {funcs.map((f) => (
                <option key={f.f_name} value={f.f_name}>
                  {f.f_name}
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
            <th>Role</th>
            <th>Function</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((rf) => (
            <tr key={`${rf.rf_role}__${rf.rf_function}`}>
              <td>
                <button onClick={() => openEdit(rf)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{rf.rf_role}</td>
              <td>{rf.rf_function}</td>
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
                <label>Function</label>
                <select value={editFunc} onChange={(e) => setEditFunc(e.target.value)} disabled={editSaving}>
                  <option value="">Select…</option>
                  {funcs.map((f) => (
                    <option key={f.f_name} value={f.f_name}>
                      {f.f_name}
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
