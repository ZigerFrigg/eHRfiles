"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import PageInfo from "../../../components/PageInfo";

type StatusKind = "success" | "error" | "";

type DocumentRow = {
  d_id: string;
  d_key: string;
  d_date: string; // timestamptz
  e_id: string | null;
  e_compc: string | null;
  e_wloc: string | null;
  e_lhold: boolean;
  e_hr: boolean;
  e_geb: boolean;
  d_file: string;
  d_text: string | null;
  d_hash: string;
  d_pages: number | null;
  d_u_id: string;
  d_c_fname: string;
  d_c_lname: string;
  d_case: string | null;
  d_r_taxcode: string;
  d_r_rule: string;
  d_r_trigger: string;
  d_r_month: number;
  d_r_deletion: string | null; // date
  d_r_status: "not started" | "started" | "expired" | string;
  d_stor: string;
  d_path: string;
  d_mime: string;
  d_size: number; // bigint
};

function formatDateTimeDMYYHM(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hh}:${mm}`;
}

export default function AdminDocumentsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<DocumentRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Paging (like Employees)
  const [pageSize, setPageSize] = useState<number>(10); // default: 10
  const [pageIndex, setPageIndex] = useState<number>(0);

  // Filters
  const [filterEmplId, setFilterEmplId] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterDocType, setFilterDocType] = useState("");
  const [filterRetStatus, setFilterRetStatus] = useState("");

  // Delete confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function fetchRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "d_id, d_key, d_date, e_id, e_compc, e_wloc, e_lhold, e_hr, e_geb, d_file, d_text, d_hash, d_pages, d_u_id, d_c_fname, d_c_lname, d_case, d_r_taxcode, d_r_rule, d_r_trigger, d_r_month, d_r_deletion, d_r_status, d_stor, d_path, d_mime, d_size"
        )
        .order("d_date", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as DocumentRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows().catch((e) => {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPageIndex(0);
  }, [rows, pageSize]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterEmplId && !r.e_id?.toLowerCase().includes(filterEmplId.toLowerCase())) {
        return false;
      }
      if (filterCountry && !r.e_wloc?.toLowerCase().includes(filterCountry.toLowerCase())) {
        return false;
      }
      if (filterDocType && !r.d_key.toLowerCase().includes(filterDocType.toLowerCase())) {
        return false;
      }
      if (filterRetStatus && (r.d_r_status ?? "").toLowerCase() !== filterRetStatus.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [rows, filterEmplId, filterCountry, filterDocType, filterRetStatus]);
  const sorted = useMemo(() => filtered, [filtered]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(sorted.length / pageSize)), [sorted.length, pageSize]);

  const paged = useMemo(() => {
    const start = pageIndex * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageIndex, pageSize]);

  function openEdit(r: DocumentRow) {
    setEditRow({ ...r });
    setEditOpen(true);
    setStatus("");
    setStatusKind("");
  }

  function closeEdit() {
   if (editSaving || deleteBusy) return;
    setEditOpen(false);
    setEditRow(null);
    setDeleteConfirmOpen(false);
  }

  function openUploadPage() {
    router.push("/user/upload");
  }

  async function saveEdit() {
    if (!editRow) return;

    setEditSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      // Admin editable, except fields that would break logic:
      // D_ID, D_FILE, D_HASH, D_STOR, D_PATH, D_MIME, D_SIZE are read-only.
      const payload: Partial<DocumentRow> = {
        d_key: editRow.d_key.trim(),
        d_date: editRow.d_date, // admin editable
        e_id: editRow.e_id?.trim() || null,
        e_compc: editRow.e_compc?.trim() || null,
        e_wloc: editRow.e_wloc?.trim() || null,
        e_lhold: !!editRow.e_lhold,
        e_hr: !!editRow.e_hr,
        e_geb: !!editRow.e_geb,
        d_text: editRow.d_text?.trim() || null,
        d_pages: editRow.d_pages === null ? null : Number(editRow.d_pages),
        d_u_id: editRow.d_u_id.trim(),
        d_c_fname: editRow.d_c_fname.trim(),
        d_c_lname: editRow.d_c_lname.trim(),
        d_case: editRow.d_case?.trim() || null,
        d_r_taxcode: editRow.d_r_taxcode.trim(),
        d_r_rule: editRow.d_r_rule.trim(),
        d_r_trigger: editRow.d_r_trigger.trim(),
        d_r_month: Number(editRow.d_r_month),
        d_r_deletion: editRow.d_r_deletion?.trim() || null,
        d_r_status: editRow.d_r_status,
      };

      const { error } = await supabase.from("documents").update(payload).eq("d_id", editRow.d_id);
      if (error) throw error;

      await fetchRows();
      closeEdit();

      setStatusKind("success");
      setStatus("Successful: Record updated.");
      router.refresh();
    } catch (e: any) {
      setStatusKind("error");
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

function openDeleteConfirm() {
  if (!editRow?.d_id) return;
  setDeleteConfirmOpen(true);
}

function cancelDeleteConfirm() {
  if (deleteBusy) return;
  setDeleteConfirmOpen(false);
}

async function doDeleteDocument() {
  if (!editRow?.d_id) return;

  setDeleteBusy(true);
  setStatus("");
  setStatusKind("");

  try {
    // 1) Storage file löschen (Bucket "docs" bzw. aus Record)
    const bucket = editRow.d_stor || "docs";
    const path = editRow.d_path;

    if (path) {
      const { error: rmErr } = await supabase.storage.from(bucket).remove([path]);
      if (rmErr) throw rmErr;
    }

    // 2) DB Record löschen
    const { error: delErr } = await supabase.from("documents").delete().eq("d_id", editRow.d_id);
    if (delErr) throw delErr;

    await fetchRows();
    closeEdit();

    setStatusKind("success");
    setStatus("Successful: Document deleted (DB + Storage).");
    router.refresh();
  } catch (e: any) {
    setStatusKind("error");
    setStatus(`Error: ${e?.message ?? String(e)}`);
  } finally {
    setDeleteBusy(false);
  }
}

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — Documents</h1>
      <PageInfo cName="ADM_DOC" />

<label><b>Filter / Search</b></label>

<div className={styles.filterBar}>
  <div className={styles.filterGroup}>
    <label>Empl ID</label>
    <input
      value={filterEmplId}
      onChange={(e) => setFilterEmplId(e.target.value)}
      placeholder="e.g. 12345678"
    />
  </div>
  <div className={styles.filterGroup}>
    <label>Country</label>
    <input
      value={filterCountry}
      onChange={(e) => setFilterCountry(e.target.value)}
      placeholder="e.g. CHE"
    />
  </div>
  <div className={styles.filterGroup}>
    <label>Doc Type</label>
    <input
      value={filterDocType}
      onChange={(e) => setFilterDocType(e.target.value)}
      placeholder="e.g. EPF_CHE01"
    />
  </div>

  <div className={styles.field}>
    <label style={{height: "15px"}}>Ret Status</label>
    <select
      value={filterRetStatus}
      onChange={(e) => setFilterRetStatus(e.target.value)}
      style={{
        height: "24px",
        padding: "0px 10px 0px 0px",
        lineHeight: "1",
      }}
    >
      <option value="">(all)</option>
      <option value="not set">not set</option>
      <option value="not started">not started</option>
      <option value="started">started</option>
      <option value="legal hold">legal hold</option>
      <option value="expired">expired</option>
    </select>
</div>

   <button
    className={styles.button}
    onClick={() => {
      setFilterEmplId("");
      setFilterCountry("");
      setFilterDocType("");
      setFilterRetStatus("");
    }}
  >
    Reset
  </button>
</div>

      <div className={styles.tableInfo}>
        <strong>Records:</strong> {sorted.length}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Edit</th>
            <th>Doc ID</th>
            <th>Doc Type</th>
            <th>Add Date</th>
            <th>Empl ID</th>
            <th>Country</th>
            <th>Ret Status</th>
            <th>Trigger</th>
            <th>Month</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((r) => (
            <tr key={r.d_id}>
              <td>
                <button onClick={() => openEdit(r)} className={styles.iconButton}>
                  ✎
                </button>
              </td>
              <td style={{ fontFamily: "monospace" }}>{r.d_id}</td>
              <td>{r.d_key}</td>
              <td>{formatDateTimeDMYYHM(r.d_date)}</td>
              <td>{r.e_id ?? ""}</td>
              <td>{r.e_wloc ?? ""}</td>
              <td>{r.d_r_status ?? ""}</td>
              <td>{r.d_r_trigger ?? ""}</td>
              <td>{String(r.d_r_month ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.paginationBar}>
        <button className={styles.button} onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex <= 0}>
          Prev
        </button>

        <div className={`${styles.status} ${styles.pageIndicator}`}>
          Page {Math.min(pageIndex + 1, pageCount)} / {pageCount}
        </div>

        <div className={styles.pageSizeGroup}>
          <span className={styles.status}>Show</span>
          <select className={styles.pageSizeSelect} value={pageSize} onChange={(e) => setPageSize(Number.parseInt(e.target.value, 10))}>
            <option value={10}>10</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </select>
        </div>

        <button className={styles.button} onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))} disabled={pageIndex >= pageCount - 1}>
          Next
        </button>
      </div>

      {editOpen && editRow && (
        <div role="dialog" aria-modal="true" className={styles.modalOverlay} onClick={closeEdit}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Edit Document</h2>

            <div style={{ maxHeight: "72vh", overflowY: "auto", paddingRight: 8 }}>
              <div className={styles.modalGrid} style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Read-only */}

                <p><b>File Properties - not editable</b></p>
                <div className={styles.field}><label></label></div>

                <div className={styles.field}>
                  <label>Doc ID</label>
                  <input value={editRow.d_id} disabled />
                </div>

                <div className={styles.field}>
                  <label>File Name</label>
                  <input value={editRow.d_file} disabled />
                </div>

                <div className={styles.field}>
                  <label>Check Num / SHA-256</label>
                  <input value={editRow.d_hash} disabled />
                </div>

                <div className={styles.field}>
                  <label>Storage Bucket</label>
                  <input value={editRow.d_stor} disabled />
                </div>

                <div className={styles.field}>
                  <label>Storage Path</label>
                  <input value={editRow.d_path} disabled />
                </div>

                <div className={styles.field}>
                  <label>MIME Type</label>
                  <input value={editRow.d_mime} disabled />
                </div>

                <div className={styles.field}>
                  <label>File Size</label>
                  <input value={String(editRow.d_size)} disabled />
                </div>

                <div className={styles.field}><label></label></div>

                <p><b>Document Properties</b></p>
                <div className={styles.field}><label></label></div>

                {/* Editable */}
                <div className={styles.field}>
                  <label>Doc Type</label>
                  <input value={editRow.d_key} onChange={(e) => setEditRow((p) => (p ? { ...p, d_key: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Pages</label>
                  <input type="number" value={editRow.d_pages ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, d_pages: e.target.value === "" ? null : Number.parseInt(e.target.value, 10) } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Add Date</label>
                  <input value={editRow.d_date} onChange={(e) => setEditRow((p) => (p ? { ...p, d_date: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}><label></label></div>
                <p><b>Employee Properties</b></p>
                <div className={styles.field}><label></label></div>

                <div className={styles.field}>
                  <label>Employee ID</label>
                  <input value={editRow.e_id ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, e_id: e.target.value || null } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Company</label>
                  <input value={editRow.e_compc ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, e_compc: e.target.value || null } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Country</label>
                  <input value={editRow.e_wloc ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, e_wloc: e.target.value || null } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Legal Hold</label>
                  <select value={String(!!editRow.e_lhold)} onChange={(e) => setEditRow((p) => (p ? { ...p, e_lhold: e.target.value === "true" } : p))} disabled={editSaving}>
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>HR Employee</label>
                  <select value={String(!!editRow.e_hr)} onChange={(e) => setEditRow((p) => (p ? { ...p, e_hr: e.target.value === "true" } : p))} disabled={editSaving}>
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>BoD Member</label>
                  <select value={String(!!editRow.e_geb)} onChange={(e) => setEditRow((p) => (p ? { ...p, e_geb: e.target.value === "true" } : p))} disabled={editSaving}>
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </div>

                <p><b>Retention Properties</b></p>
                <div className={styles.field}><label></label></div>

                <div className={styles.field}>
                  <label>Taxonomy</label>
                  <input value={editRow.d_r_taxcode} onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_taxcode: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Rule</label>
                  <input value={editRow.d_r_rule} onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_rule: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Trigger</label>
                  <input value={editRow.d_r_trigger} onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_trigger: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Month</label>
                  <input type="number" value={editRow.d_r_month} onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_month: Number.parseInt(e.target.value || "0", 10) } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Deletion Date</label>
                  <input placeholder="YYYY-MM-DD" value={editRow.d_r_deletion ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_deletion: e.target.value || null } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Retention Status</label>
                  <select value={editRow.d_r_status} onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_status: e.target.value as any } : p))} disabled={editSaving}>
                    <option value="not set">not set</option>
                    <option value="not started">not started</option>
                    <option value="started">started</option>
                    <option value="legal hold">legal hold</option>
                    <option value="expired">expired</option>
                  </select>
                </div>

                <p><b>Other Properties</b></p>
                <div className={styles.field}><label></label></div>

                <div className={styles.field}>
                  <label>Creator ID</label>
                  <input value={editRow.d_u_id} onChange={(e) => setEditRow((p) => (p ? { ...p, d_u_id: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Creator Firstname</label>
                  <input value={editRow.d_c_fname} onChange={(e) => setEditRow((p) => (p ? { ...p, d_c_fname: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Creator Lastname</label>
                  <input value={editRow.d_c_lname} onChange={(e) => setEditRow((p) => (p ? { ...p, d_c_lname: e.target.value } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field}>
                  <label>Case ID</label>
                  <input value={editRow.d_case ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, d_case: e.target.value || null } : p))} disabled={editSaving} />
                </div>

                <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <label>Content / OCR Text</label>
                  <textarea value={editRow.d_text ?? ""} onChange={(e) => setEditRow((p) => (p ? { ...p, d_text: e.target.value || null } : p))} disabled={editSaving} rows={2} />
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button onClick={closeEdit} className={styles.button} disabled={editSaving}>
                Cancel
              </button>

              <button
                onClick={openDeleteConfirm}
                className={`${styles.button} ${styles.buttonDangerOutline} ${(editSaving || deleteBusy) ? styles.disabledButton : ""}`}
                disabled={editSaving || deleteBusy}
                title="Delete document (DB + Storage)"
              >
                Delete Document
              </button>

              <button onClick={saveEdit} className={`${styles.button} ${styles.buttonPrimary}`} disabled={editSaving || deleteBusy || deleteConfirmOpen} >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>

            {deleteConfirmOpen && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px solid #c0392b",
                  borderRadius: 8,
                  background: "rgba(192, 57, 43, 0.06)",
                }}
              >
                <div style={{ marginBottom: 10 }}>
                  Are you sure? Please confirm the deletion of the document.
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className={styles.button} onClick={cancelDeleteConfirm} disabled={deleteBusy}>
                    Cancel
                  </button>

                  <button
                    className={`${styles.button} ${styles.buttonDanger} ${deleteBusy ? styles.disabledButton : ""}`}
                    onClick={doDeleteDocument}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}

            {status && <p className={`${styles.status} ${statusKind === "error" ? styles.error : ""}`}>{status}</p>}
          </div>
        </div>
      )}
    </main>
  );
}
