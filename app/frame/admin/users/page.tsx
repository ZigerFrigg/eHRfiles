"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type UserRow = {
  u_id: string;
  u_email: string;
  u_role: string; // now comes from ROLES table (r_name)
  u_cou: string; // e.g. "CHE;GBR;USA" or "ALL"
  u_hr: boolean;
  u_geb: boolean;
};

type Filters = Partial<{
  u_id: string;
  u_email: string;
  u_role: string; // selected role name
  u_cou: string;
  u_hr: string; // "", "yes", "no" (also accepts true/false/1/0)
  u_geb: string; // "", "yes", "no" (also accepts true/false/1/0)
}>;

const yesNo = (v: boolean) => (v ? "yes" : "no");

export default function AdminUsersPage() {
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  const [filters, setFilters] = useState<Filters>({
    u_id: "",
    u_email: "",
    u_role: "",
    u_cou: "",
    u_hr: "",
    u_geb: "",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function fetchUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("u_id, u_email, u_role, u_cou, u_hr, u_geb")
      .order("u_id");

    if (error) throw error;
    setUsers((data ?? []) as UserRow[]);
  }

  async function fetchRoles() {
    const { data, error } = await supabase.from("roles").select("r_name").order("r_name");
    if (error) throw error;
    setRoles(((data ?? []) as { r_name: string }[]).map((r) => r.r_name));
  }

  useEffect(() => {
    Promise.all([fetchUsers(), fetchRoles()]).catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const f = filters;

    const matchStr = (hay: string, needle?: string) =>
      !needle || needle.trim() === "" ? true : (hay ?? "").toLowerCase().includes(needle.toLowerCase().trim());

    const normalizeYesNo = (needle?: string): "yes" | "no" | "" => {
      const n = (needle ?? "").trim().toLowerCase();
      if (!n) return "";
      if (n === "yes" || n === "true" || n === "1") return "yes";
      if (n === "no" || n === "false" || n === "0") return "no";
      return "";
    };

    const matchBool = (val: boolean, needle?: string) => {
      const n = normalizeYesNo(needle);
      if (!n) return true;
      return n === "yes" ? val === true : val === false;
    };

    const matchRole = (role: string, selected?: string) => {
      const s = (selected ?? "").trim();
      if (!s) return true;
      return role === s;
    };

    return users.filter((u) => {
      return (
        matchStr(u.u_id, f.u_id) &&
        matchStr(u.u_email, f.u_email) &&
        matchRole(u.u_role, f.u_role) &&
        matchStr(u.u_cou, f.u_cou) &&
        matchBool(u.u_hr, f.u_hr) &&
        matchBool(u.u_geb, f.u_geb)
      );
    });
  }, [users, filters]);

  function openEdit(row: UserRow) {
    setEditRow({ ...row });
    setEditOpen(true);
    setStatus(""); 
    setStatusKind(""); 
  }

  function openNew() {
    setEditRow({
      u_id: "",
      u_email: "",
      u_role: roles[0] ?? "", // first role if available
      u_cou: "CHE",
      u_hr: false,
      u_geb: false,
    });
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
      if (!editRow.u_id.trim()) throw new Error("User ID is required.");
      if (!editRow.u_email.trim()) throw new Error("User Email is required.");
      if (!editRow.u_role.trim()) throw new Error("Role is required.");
      if (!editRow.u_cou.trim()) throw new Error("Country Access is required.");

      // Optional guard: role must exist in roles table (if roles were loaded)
      if (roles.length > 0 && !roles.includes(editRow.u_role)) {
        throw new Error(`Role "${editRow.u_role}" does not exist in ROLES.`);
      }

      const { error } = await supabase.from("users").upsert(editRow, { onConflict: "u_id" });
      if (error) throw error;

      await fetchUsers();
      setEditOpen(false);
      setEditRow(null);
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
      <h1 className={styles.title}>Admin — Users</h1>
      <PageInfo cName="ADM_USERS" />
      <div className={styles.actions}>
        <button onClick={openNew} disabled={loading} className={styles.button}>
          New User
        </button>
       
        {loading && <span className={styles.status}>Loading…</span>}
        {status && (
          <span className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>
            {status}
          </span>
        )}
      </div>

      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Search</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label>User ID</label>
            <input value={filters.u_id ?? ""} onChange={(e) => setFilters((p) => ({ ...p, u_id: e.target.value }))} />
          </div>

          <div className={styles.field}>
            <label>User Email</label>
            <input
              value={filters.u_email ?? ""}
              onChange={(e) => setFilters((p) => ({ ...p, u_email: e.target.value }))}
            />
          </div>

          <div className={styles.field}>
            <label>Role</label>
            <select
              value={filters.u_role ?? ""}
              onChange={(e) => setFilters((p) => ({ ...p, u_role: e.target.value }))}
            >
              <option value="">(any)</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Country Access (contains)</label>
            <input
              placeholder='e.g. "CHE" or "ALL"'
              value={filters.u_cou ?? ""}
              onChange={(e) => setFilters((p) => ({ ...p, u_cou: e.target.value }))}
            />
          </div>

          <div className={styles.field}>
            <label>HR Access abc</label>
            <select value={filters.u_hr ?? ""} onChange={(e) => setFilters((p) => ({ ...p, u_hr: e.target.value }))}>
              <option value="">(any)</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>



          <div className={styles.field}>
            <label>BoD Access</label>
            <select
              value={filters.u_geb ?? ""}
              onChange={(e) => setFilters((p) => ({ ...p, u_geb: e.target.value }))}
            >
              <option value="">(any)</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>


        </div>
      </section>

      <div className={styles.tableInfo}>
        <strong>Search Result:</strong> {filtered.length} / {users.length}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Edit</th>
            <th>User ID</th>
            <th>User Email</th>
            <th>Role</th>
            <th>Country Access</th>
            <th>HR Access</th>
            <th>BoD Access</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.u_id}>
              <td>
                <button onClick={() => openEdit(u)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{u.u_id}</td>
              <td>{u.u_email}</td>
              <td>{u.u_role}</td>
              <td>{u.u_cou}</td>
              <td>{yesNo(u.u_hr)}</td>
              <td>{yesNo(u.u_geb)}</td>
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
            <h2 className={styles.modalTitle}>Edit User</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>User ID</label>
                <input
                  value={editRow.u_id}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, u_id: e.target.value } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>User Email</label>
                <input
                  value={editRow.u_email}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, u_email: e.target.value } : p))}
                  disabled={editSaving}
                />
              </div>

              <div className={styles.field}>
                <label>Role</label>
                <select
                  value={editRow.u_role}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, u_role: e.target.value } : p))}
                  disabled={editSaving || roles.length === 0}
                  title={roles.length === 0 ? "No roles found in ROLES table" : undefined}
                >
                  {/* keep current value selectable even if it is not in the roles list */}
                  {editRow.u_role && !roles.includes(editRow.u_role) && (
                    <option value={editRow.u_role}>{editRow.u_role} (unknown)</option>
                  )}
                  {roles.length === 0 ? (
                    <option value="">(no roles)</option>
                  ) : (
                    roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))
                  )}
                </select>
                <small>Roles are loaded from the ROLES table.</small>
              </div>

              <div className={styles.field}>
                <label>Country Access</label>
                <input
                  placeholder="ALL or e.g. CHE;GBR;USA"
                  value={editRow.u_cou}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, u_cou: e.target.value } : p))}
                  disabled={editSaving}
                />
                <small>Use semicolon for several countries, e.g. "CHE;GBR". Entry "ALL" grants access to all countries.</small>
              </div>

              <div className={styles.checkboxRow}>
                <label className={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={editRow.u_hr}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, u_hr: e.target.checked } : p))}
                    disabled={editSaving}
                  />
                  <span>HR Access</span>
                </label>

                <label className={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={editRow.u_geb}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, u_geb: e.target.checked } : p))}
                    disabled={editSaving}
                  />
                  <span>BoD Access</span>
                </label>
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

              <button onClick={saveEdit} className={`${styles.button} ${styles.buttonPrimary}`} disabled={editSaving}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>

            {status && (
              <p className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>
                {status}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
