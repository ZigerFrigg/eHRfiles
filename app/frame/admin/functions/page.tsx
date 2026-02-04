"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type Func = {
  f_name: string;
  f_desc: string;
};

export default function AdminFunctionsPage() {
  const router = useRouter();

  const [funcs, setFuncs] = useState<Func[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  // Add form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<Func | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function loadFunctions() {
    const { data, error } = await supabase.from("functions").select("f_name, f_desc").order("f_name");
    if (error) throw error;
    setFuncs((data ?? []) as Func[]);
  }

  useEffect(() => {
    loadFunctions().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...funcs].sort((a, b) => a.f_name.localeCompare(b.f_name));
  }, [funcs]);

  function validate(f_name: string, f_desc: string) {
    if (!f_name) throw new Error("Function Name is required.");
    if (f_name.length > 100) throw new Error("Function Name must be max. 100 characters.");
    if (!f_desc) throw new Error("Description is required.");
    if (f_desc.length > 255) throw new Error("Description must be max. 255 characters.");
  }

  async function addFunction() {
    setLoading(true);
    setStatus("");
    setStatusKind("");

    try {
      const f_name = newName.trim();
      const f_desc = newDesc.trim();

      validate(f_name, f_desc);

      // Insert (or update if already exists)
      const { error } = await supabase.from("functions").upsert({ f_name, f_desc }, { onConflict: "f_name" });
      if (error) throw error;

      setNewName("");
      setNewDesc("");
      await loadFunctions();

      setStatusKind("success");
      setStatus("Successful: Function saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: Func) {
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
      const f_name = editRow.f_name.trim();
      const f_desc = editRow.f_desc.trim();

      validate(f_name, f_desc);

      const { error } = await supabase.from("functions").upsert({ f_name, f_desc }, { onConflict: "f_name" });
      if (error) throw error;

      await loadFunctions();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Function saved.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEdit() {
    if (!editRow?.f_name) return;
    if (!confirm(`Delete function ${editRow.f_name}?`)) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const { error } = await supabase.from("functions").delete().eq("f_name", editRow.f_name);
      if (error) throw error;

      await loadFunctions();
      setEditOpen(false);
      setEditRow(null);

      setStatusKind("success");
      setStatus("Successful: Function deleted.");
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
      <h1 className={styles.title}>Admin — Functions</h1>
      <PageInfo cName="ADM_FUNC" />
      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Add Function</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label>Function Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. UploadDocuments" />
          </div>

          <div className={styles.field} style={{ gridColumn: "span 2" }}>
            <label>Description</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="e.g. Allow users to upload documents"
            />
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button onClick={addFunction} disabled={loading} className={`${styles.button} ${styles.buttonPrimary}`}>
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
            <th>Function Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr key={f.f_name}>
              <td>
                <button onClick={() => openEdit(f)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td>{f.f_name}</td>
              <td>{f.f_desc}</td>
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
            <h2 className={styles.modalTitle}>Edit Function</h2>

            <div className={styles.modalGrid}>
              <div className={styles.field}>
                <label>Function Name</label>
                <input
                  value={editRow.f_name}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, f_name: e.target.value } : p))}
                  disabled={editSaving}
                />
                <small>Function Name is the key value.</small>
              </div>

              <div className={styles.field}>
                <label>Description</label>
                <input
                  value={editRow.f_desc}
                  onChange={(e) => setEditRow((p) => (p ? { ...p, f_desc: e.target.value } : p))}
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
