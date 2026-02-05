"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import { useFrame } from "../../frame-context";

import { ArrowRight, Pencil } from "lucide-react";

type EmployeeRow = {
  e_id: string;
  e_fname: string | null;
  e_lname: string | null;
  e_class: string | null;
  e_status: string | null;
  e_join: string | null;
  e_tdate: string | null;
  e_wloc: string | null;
  e_compc: string | null;
  e_compn: string | null;
  e_ouco: string | null;
  e_ouna: string | null;
  e_lhold: boolean | null;
  e_hr: boolean | null;
  e_geb: boolean | null;
};

type DocTypeRow = {
  d_key: string;
  d_name: string | null;
  d_group: string | null;
};

type DocumentRow = {
  d_id: string;
  d_key: string;
  d_date: string;
  e_id: string | null;
  e_compc: string | null;
  e_wloc: string | null;
  e_lhold: boolean | null;
  e_hr: boolean | null;
  e_geb: boolean | null;

  d_file: string;
  d_text: string | null;
  d_hash: string;
  d_pages: number | null;

  d_u_id: string;
  d_c_fname: string | null;
  d_c_lname: string | null;
  d_case: string | null;

  d_r_taxcode: string;
  d_r_rule: string;
  d_r_trigger: string;
  d_r_month: number;
  d_r_deletion: string | null;
  d_r_status: string;

  d_stor: string;
  d_path: string;
  d_mime: string;
  d_size: number;
};

type RoleDT = { rd_doctype: string };

function yesNo(v: boolean | null | undefined): string {
  return v ? "yes" : "no";
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const mon = d.toLocaleString("en-GB", { month: "short" });
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${mon}-${yy} ${hh}:${mm}`;
}

export default function UserDossierPage() {
  const searchParams = useSearchParams();
  const eidFromUrl = (searchParams.get("e_id") ?? "").trim();

  const { activeUser, allowedFunctions, hasAnyRoleFuncs } = useFrame();

  // ---- states (MUST be before derived consts that reference them)
  const [busy, setBusy] = useState(false);

  // Properties modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<DocumentRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [docTypesByKey, setDocTypesByKey] = useState<Record<string, DocTypeRow>>({});
  const [excludedGroups, setExcludedGroups] = useState<Set<string>>(new Set());
  const [allDocs, setAllDocs] = useState<DocumentRow[]>([]);
  const [visibleDocs, setVisibleDocs] = useState<DocumentRow[]>([]);
  const [totalDocsCount, setTotalDocsCount] = useState<number>(0);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<string>("");

  // Collapsible containers (default closed)
  const [openEmpDetails, setOpenEmpDetails] = useState(false);
  const [openAccessInfo, setOpenAccessInfo] = useState(false);

  const lastLoadId = useRef(0);

  // ---- permissions
  const canEdit = useMemo(() => {
    if (!hasAnyRoleFuncs) return true;     // 👈 FULL ACCESS
    return allowedFunctions.has("USER_EDIT");
  }, [allowedFunctions, hasAnyRoleFuncs]);

  const canUpload = useMemo(() => {
    if (!hasAnyRoleFuncs) return true;
    return allowedFunctions.has("USER_UPLOAD");
  }, [allowedFunctions, hasAnyRoleFuncs]);

  const canZip = useMemo(() => {
    if (!hasAnyRoleFuncs) return true;
    return allowedFunctions.has("USER_ZIP");
  }, [allowedFunctions, hasAnyRoleFuncs]);

  const canDel = useMemo(() => {
    if (!hasAnyRoleFuncs) return true;     // 👈 FULL ACCESS
    return allowedFunctions.has("USER_DEL");
  }, [allowedFunctions, hasAnyRoleFuncs]);

  // ---- derived UI states (NOW safe: busy/visibleDocs/canZip/canEdit/editSaving exist)
  const zipDisabled = busy || visibleDocs.length === 0 || !canZip;
  const isLegalHoldLocked = !!editRow?.e_lhold;
  const saveDisabled = isLegalHoldLocked || !canEdit || editSaving || deleteBusy || deleteConfirmOpen;
  const deleteDisabled = isLegalHoldLocked || !canDel || deleteBusy || editSaving;  
  
  useEffect(() => {
    if (isLegalHoldLocked) setDeleteConfirmOpen(false);
  }, [isLegalHoldLocked]);
 
  useEffect(() => {
    if (!eidFromUrl) {
      setEmployee(null);
      setAllDocs([]);
      setVisibleDocs([]);
      setTotalDocsCount(0);
      setStatus("");
      return;
    }

    let cancelled = false;
    const myId = ++lastLoadId.current;

    async function load() {
      setBusy(true);
      setStatus("");

      try {
        const { data: emp, error: empErr } = await supabase
          .from("employees")
          .select(
            "e_id, e_fname, e_lname, e_class, e_status, e_join, e_tdate, e_wloc, e_compc, e_compn, e_ouco, e_ouna, e_lhold, e_hr, e_geb"
          )
          .eq("e_id", eidFromUrl)
          .maybeSingle();
        if (empErr) throw empErr;

        const { count: totalCount, error: cntErr } = await supabase
          .from("documents")
          .select("d_id", { count: "exact", head: true })
          .eq("e_id", eidFromUrl);
        if (cntErr) throw cntErr;

        const { data: docs, error: docsErr } = await supabase
          .from("documents")
          .select("*")
          .eq("e_id", eidFromUrl)
          .order("d_date", { ascending: false });
        if (docsErr) throw docsErr;

        const keys = Array.from(new Set(((docs ?? []) as any[]).map((d) => d.d_key).filter(Boolean)));
        let dtByKey: Record<string, DocTypeRow> = {};
        if (keys.length > 0) {
          const { data: dts, error: dtErr } = await supabase
            .from("doc_types")
            .select("d_key, d_name, d_group")
            .in("d_key", keys);
          if (dtErr) throw dtErr;
          for (const r of (dts ?? []) as DocTypeRow[]) dtByKey[r.d_key] = r;
        }

        let excl = new Set<string>();
        if (activeUser?.u_role) {
          const { data: rd, error: rdErr } = await supabase
            .from("role_dt")
            .select("rd_doctype")
            .eq("rd_role", activeUser.u_role);
          if (rdErr) throw rdErr;
          excl = new Set<string>(((rd ?? []) as RoleDT[]).map((x) => x.rd_doctype));
        }

        if (cancelled || myId !== lastLoadId.current) return;

        setEmployee((emp ?? null) as any);
        setTotalDocsCount(totalCount ?? 0);
        setAllDocs((docs ?? []) as DocumentRow[]);
        setDocTypesByKey(dtByKey);
        setExcludedGroups(excl);
      } catch (e: any) {
        if (!cancelled) setStatus(`Error: ${e?.message ?? String(e)}`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eidFromUrl, activeUser?.u_role]);

  useEffect(() => {
    const u = activeUser;
    const countryRaw = (u?.u_cou ?? "").trim();
    const userCountries =
      !countryRaw || countryRaw.toUpperCase() === "ALL"
        ? null
        : new Set(countryRaw.split(";").map((x) => x.trim()).filter(Boolean));

    const filtered = allDocs.filter((d) => {
      // ✅ filter by DOCUMENT country (prefix of d_key), not employee wloc
      const docCountry = (d.d_key ?? "").slice(0, 3);
      if (userCountries && docCountry && !userCountries.has(docCountry)) return false;

      const group = docTypesByKey[d.d_key]?.d_group ?? "";
      if (group && excludedGroups.has(group)) return false;

      const docHR = !!d.e_hr;
      const docGEB = !!d.e_geb;
      const userHR = !!u?.u_hr;
      const userGEB = !!u?.u_geb;
      if (docHR && !userHR) return false;
      if (docGEB && !userGEB) return false;

      return true;
    });

    setVisibleDocs(filtered);

    const groups = Array.from(new Set(filtered.map((d) => docTypesByKey[d.d_key]?.d_group ?? "N/A"))).sort((a, b) =>
      a.localeCompare(b)
    );
    const defaults: Record<string, boolean> = {};
    for (const g of groups) defaults[g] = true;
    setGroupOpen((prev) => (Object.keys(prev).length ? prev : defaults));
  }, [allDocs, activeUser, docTypesByKey, excludedGroups]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentRow[]>();
    for (const d of visibleDocs) {
      const g = docTypesByKey[d.d_key]?.d_group ?? "N/A";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(d);
    }
    const groups = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return groups.map((g) => ({ group: g, rows: map.get(g)! }));
  }, [visibleDocs, docTypesByKey]);

  const restrictionSummary = useMemo(() => {
    const u = activeUser;
    const countryRaw = (u?.u_cou ?? "").trim();
    const countries = !countryRaw ? "N/A" : countryRaw;
    const groups = excludedGroups.size ? Array.from(excludedGroups).sort().join("; ") : "none";
    return {
      countries,
      hr: yesNo(u?.u_hr),
      geb: yesNo(u?.u_geb),
      excludedGroups: groups,
      visibleDocs: visibleDocs.length,
      totalDocs: totalDocsCount,
    };
  }, [activeUser, excludedGroups, visibleDocs.length, totalDocsCount]);

  async function downloadZip() {
    if (!employee) return;

    setBusy(true);
    setStatus("");

    try {
      const zip = new JSZip();
      const folderName = `${employee.e_id}_${(employee.e_lname ?? "").replaceAll(" ", "_")}`.replaceAll("/", "_");
      const folder = zip.folder(folderName) ?? zip;

      let i = 0;
      for (const d of visibleDocs) {
        i += 1;
        const safeName = (d.d_file || `document_${i}.pdf`).replaceAll("/", "_");
        const { data, error } = await supabase.storage.from(d.d_stor).download(d.d_path);
        if (error) throw error;
        const buf = await data.arrayBuffer();
        folder.file(safeName, buf);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      setStatus(`Successful: ZIP created (${visibleDocs.length} files).`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function openProperties(doc: DocumentRow) {
    setEditRow({ ...doc });
    setEditOpen(true);
    setStatus("");
  }
  function closeEdit() {
    if (editSaving || deleteBusy) return;
    setEditOpen(false);
    setEditRow(null);
    setDeleteConfirmOpen(false);
  }
  // Code for Del Button in Model
  function openDeleteConfirm() {
    if (isLegalHoldLocked) return;
    if (!canDel) return;
    setDeleteConfirmOpen(true);
  }

  function cancelDeleteConfirm() {
    if (deleteBusy) return;
    setDeleteConfirmOpen(false);
  }

  async function doDeleteDocument() {
    if (!editRow) return;

    setDeleteBusy(true);
    setStatus("");

    try {
      // 1) Datei löschen (Bucket "docs" oder aus Record)
      const bucket = editRow.d_stor || "docs"; // du wolltest "docs"; so ist es robust
      const path = editRow.d_path;

      if (path) {
        const { error: rmErr } = await supabase.storage.from(bucket).remove([path]);
        if (rmErr) throw rmErr;
      }

      // 2) DB Record löschen
      const { error: delErr } = await supabase.from("documents").delete().eq("d_id", editRow.d_id);
      if (delErr) throw delErr;

      // 3) UI State aktualisieren
      setAllDocs((prev) => prev.filter((x) => x.d_id !== editRow.d_id));

      // Modal schließen
      setDeleteConfirmOpen(false);
      setEditOpen(false);
      setEditRow(null);

      setStatus("Successful: Document deleted.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveEdit() {
    if (!editRow) return;

    setEditSaving(true);
    setStatus("");

    try {
      const payload: Partial<DocumentRow> = {
        d_key: editRow.d_key.trim(),
        d_date: editRow.d_date,
        e_id: editRow.e_id?.trim() || null,
        e_compc: editRow.e_compc?.trim() || null,
        e_wloc: editRow.e_wloc?.trim() || null,
        e_lhold: !!editRow.e_lhold,
        e_hr: !!editRow.e_hr,
        e_geb: !!editRow.e_geb,
        d_text: editRow.d_text?.trim() || null,
        d_pages: editRow.d_pages === null ? null : Number(editRow.d_pages),
        d_u_id: editRow.d_u_id.trim(),
        d_c_fname: (editRow.d_c_fname ?? "").trim() || null,
        d_c_lname: (editRow.d_c_lname ?? "").trim() || null,
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

      setAllDocs((prev) => prev.map((d) => (d.d_id === editRow.d_id ? (editRow as DocumentRow) : d)));

      closeEdit();
      setStatus("Successful: Record updated.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setEditSaving(false);
    }
  }

  const uploadHref = eidFromUrl ? `/frame/user/upload?e_id=${encodeURIComponent(eidFromUrl)}` : "/frame/user/upload";

  const companyDisplay = useMemo(() => {
    if (!employee) return "";
    const code = (employee.e_compc ?? "").trim();
    const name = (employee.e_compn ?? "").trim();
    if (code && name) return `${code}: ${name}`;
    return code || name;
  }, [employee]);

  const ouDisplay = useMemo(() => {
    if (!employee) return "";
    const code = (employee.e_ouco ?? "").trim();
    const name = (employee.e_ouna ?? "").trim();
    if (code && name) return `${code}: ${name}`;
    return code || name;
  }, [employee]);

  function getPublicUrlForDoc(d: DocumentRow): string {
    const { data } = supabase.storage.from(d.d_stor).getPublicUrl(d.d_path);
    return data?.publicUrl ?? "";
  }

  if (!eidFromUrl) return <main className={styles.page}></main>;

  const fullName = employee ? `${employee.e_lname ?? ""}, ${employee.e_fname ?? ""}`.replace(/^,\s*/, "").trim() : "";

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>User — Dossier</h1>

      <section className={styles.card} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className={styles.searchTitle}>Employee Dossier</div>
            <div className={styles.searchTitle}>
              {fullName ? ` ${fullName}` : ""} | EID: {eidFromUrl}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href={uploadHref}
              className={`${styles.button} ${styles.buttonPrimary} ${!canUpload ? styles.disabledButton : ""}`}
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              aria-disabled={!canUpload}
              onClick={(e) => {
                if (!canUpload) e.preventDefault();
              }}
              title={!canUpload ? "You don’t have permission (USER_UPLOAD)" : ""}
            >
              Upload
            </a>

            <button
              className={`${styles.button} ${zipDisabled ? styles.disabledButton : ""}`}
              onClick={downloadZip}
              disabled={zipDisabled}
              title={!canZip ? "You don’t have permission (USER_ZIP)" : ""}
            >
              Download ZIP
            </button>
          </div>
        </div>

        {status && (
          <div className={styles.actions} style={{ marginTop: 10 }}>
            <span className={styles.status}>{status}</span>
          </div>
        )}
      </section>

      {/* Employee / Dossier Details header (collapsible) */}
      <div
        className={styles.sectionHeader}
        onClick={() => setOpenEmpDetails((v) => !v)}
        role="button"
        aria-expanded={openEmpDetails}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpenEmpDetails((v) => !v);
        }}
      >
        <span className={styles.collapseIcon}>{openEmpDetails ? "▼" : "▶"}</span>
        <h2 className={styles.sectionTitle}>Employee / Dossier Details</h2>
      </div>

      {/* Employee / Dossier Details Container */}
      {openEmpDetails && (
        <section className={styles.card}>
          <section className={styles.searchPanel}>
            {busy && !employee ? (
              <div className={styles.status}>Loading…</div>
            ) : !employee ? (
              <div className={styles.status}></div>
            ) : (
              <div className={styles.searchGrid}>
                <div className={styles.field}>
                  <label>Company</label>
                  <input value={companyDisplay} disabled />
                </div>
                <div className={styles.field}>
                  <label>Country</label>
                  <input value={employee.e_wloc ?? ""} disabled />
                </div>
                <div className={styles.field}>
                  <label>Employee Class</label>
                  <input value={employee.e_class ?? ""} disabled />
                </div>
                <div className={styles.field}>
                  <label>Status</label>
                  <input value={employee.e_status ?? ""} disabled />
                </div>
                <div className={styles.field}>
                  <label>Termination Date</label>
                  <input value={employee.e_tdate ? fmtDateTime(employee.e_tdate).split(" ")[0] : ""} disabled />
                </div>
                <div className={styles.field}>
                  <label>OU</label>
                  <input value={ouDisplay} disabled />
                </div>
                <div className={styles.field}>
                  <label>Legal Hold</label>
                  <input value={yesNo(employee.e_lhold)} disabled />
                </div>
                <div className={styles.field}>
                  <label>HR Employee</label>
                  <input value={yesNo(employee.e_hr)} disabled />
                </div>
                <div className={styles.field}>
                  <label>BoD Member</label>
                  <input value={yesNo(employee.e_geb)} disabled />
                </div>
              </div>
            )}
          </section>
        </section>
      )}

      {/* Access header (collapsible) */}
      <div
        className={styles.sectionHeader}
        onClick={() => setOpenAccessInfo((v) => !v)}
        role="button"
        aria-expanded={openAccessInfo}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpenAccessInfo((v) => !v);
        }}
      >
        <span className={styles.collapseIcon}>{openAccessInfo ? "▼" : "▶"}</span>
        <h2 className={styles.sectionTitle}>Your Access and Restrictions</h2>
      </div>

      {/* Access Info container */}
      {openAccessInfo && (
        <section className={styles.card}>
          <section className={styles.searchPanel}>
            <div className={styles.searchGrid} style={{ marginTop: 10 }}>
              <div className={styles.field}>
                <label>Your access to Countries</label>
                <input value={restrictionSummary.countries} disabled />
              </div>
              <div className={styles.field}>
                <label>You have HR4HR access</label>
                <input value={restrictionSummary.hr} disabled />
              </div>
              <div className={styles.field}>
                <label>You have BoD access</label>
                <input value={restrictionSummary.geb} disabled />
              </div>
              <div className={styles.field}>
                <label>You don't have access to</label>
                <input value={restrictionSummary.excludedGroups} disabled />
              </div>
              <div className={styles.field}>
                <label>Number of docs in your access</label>
                <input value={String(restrictionSummary.visibleDocs)} disabled />
              </div>
              <div className={styles.field}>
                <label>Total number of docs</label>
                <input value={String(restrictionSummary.totalDocs)} disabled />
              </div>
            </div>
          </section>
        </section>
      )}

      {/* Documents container */}
      <section className={styles.card} style={{ marginTop: 12 }}>
        <div className={styles.searchTitle}>Documents</div>

        <div style={{ marginTop: 10 }} className={styles.status}>
          {busy ? "Loading…" : `${visibleDocs.length} docs in your access of total ${totalDocsCount} in dossier`}
        </div>

        {grouped.length === 0 ? (
          <div className={styles.status} style={{ marginTop: 10 }}>
            No visible documents.
          </div>
        ) : (
          grouped.map(({ group, rows }) => {
            const open = groupOpen[group] ?? true;
            return (
              <div key={group} style={{ marginTop: 12 }}>
                <button
                  className={styles.linkButton}
                  onClick={() => setGroupOpen((p) => ({ ...p, [group]: !(p[group] ?? true) }))}
                >
                  {open ? "▼" : "▶"} {group} ({rows.length})
                </button>

                {open && (
                  <table className={styles.table} style={{ marginTop: 8, tableLayout: "fixed", width: "100%" }}>
                    <colgroup>
                      <col style={{ width: "200px" }} />
                      <col style={{ width: "60px" }} />
                      <col style={{ width: "390px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "70px" }} />
                      <col style={{ width: "50px" }} />
                    </colgroup>

                    <thead>
                      <tr>
                        <th>Doc Type Name</th>
                        <th>Country</th>
                        <th>File Name</th>
                        <th>Add Date</th>
                        <th>Properties</th>
                        <th>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => {
                        const dt = docTypesByKey[d.d_key];
                        const openUrl = getPublicUrlForDoc(d);
                        return (
                          <tr key={d.d_id}>
                            <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {dt?.d_name ?? ""}
                            </td>
                            <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {(d.d_key ?? "").slice(0, 3)}
                            </td>
                            <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.d_file}>
                              {d.d_file}
                            </td>
                            <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {fmtDateTime(d.d_date)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button onClick={() => openProperties(d)} className={styles.iconButton} title="Properties">
                                <Pencil size={15} />
                              </button>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {openUrl ? (
                                <a
                                  href={openUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.iconButton}
                                  title="Open document"
                                >
                                  <ArrowRight size={15} />
                                </a>
                              ) : (
                                <button className={styles.iconButton} disabled title="No public URL">
                                  <ArrowRight size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Properties modal */}
      {editOpen && editRow && (
        <div role="dialog" aria-modal="true" className={styles.modalOverlay} onClick={closeEdit}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Edit Document</h2>
            {isLegalHoldLocked && (
              <div className={styles.legalHoldBanner}>
                LEGAL HOLD — This document is locked. No changes (incl. Save/Delete) are allowed.
              </div>
            )}
            <div style={{ maxHeight: "72vh", overflowY: "auto", paddingRight: 8 }}>
              <div className={styles.modalGrid} style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <p>
                  <b>File Properties - not editable</b>
                </p>
                <div className={styles.field}>
                  <label></label>
                </div>

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

                <div className={styles.field}>
                  <label></label>
                </div>

                <p>
                  <b>Document Properties</b>
                </p>
                <div className={styles.field}>
                  <label></label>
                </div>

                <div className={styles.field}>
                  <label>Doc Type</label>
                  <input
                    value={editRow.d_key}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_key: e.target.value } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Pages</label>
                  <input
                    type="number"
                    value={editRow.d_pages ?? ""}
                    onChange={(e) =>
                      setEditRow((p) =>
                        p ? { ...p, d_pages: e.target.value === "" ? null : Number.parseInt(e.target.value, 10) } : p
                      )
                    }
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Add Date</label>
                  <input
                    value={editRow.d_date}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_date: e.target.value } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label></label>
                </div>

                <p>
                  <b>Employee Properties</b>
                </p>
                <div className={styles.field}>
                  <label></label>
                </div>

                <div className={styles.field}>
                  <label>Employee ID</label>
                  <input
                    value={editRow.e_id ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_id: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Company</label>
                  <input
                    value={editRow.e_compc ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_compc: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Country</label>
                  <input
                    value={editRow.e_wloc ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_wloc: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={`${styles.field} ${isLegalHoldLocked ? styles.legalHoldField : ""}`}>
                  <label>Legal Hold</label>
                  <select
                    value={String(!!editRow.e_lhold)}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_lhold: e.target.value === "true" } : p))}
                    disabled={saveDisabled}
                  >
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>HR Employee</label>
                  <select
                    value={String(!!editRow.e_hr)}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_hr: e.target.value === "true" } : p))}
                    disabled={saveDisabled}
                  >
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>BoD Member</label>
                  <select
                    value={String(!!editRow.e_geb)}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, e_geb: e.target.value === "true" } : p))}
                    disabled={saveDisabled}
                  >
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </div>

                <p>
                  <b>Retention Properties</b>
                </p>
                <div className={styles.field}>
                  <label></label>
                </div>

                <div className={styles.field}>
                  <label>Taxonomy</label>
                  <input
                    value={editRow.d_r_taxcode}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_taxcode: e.target.value } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Rule</label>
                  <input
                    value={editRow.d_r_rule}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_rule: e.target.value } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Trigger</label>
                  <input
                    value={editRow.d_r_trigger}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_trigger: e.target.value } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Month</label>
                  <input
                    type="number"
                    value={editRow.d_r_month}
                    onChange={(e) =>
                      setEditRow((p) => (p ? { ...p, d_r_month: Number.parseInt(e.target.value || "0", 10) } : p))
                    }
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Deletion Date</label>
                  <input
                    placeholder="YYYY-MM-DD"
                    value={editRow.d_r_deletion ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_deletion: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Retention Status</label>
                  <select
                    value={editRow.d_r_status}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_r_status: e.target.value } : p))}
                    disabled={saveDisabled}
                  >
                    <option value="not set">not set</option>
                    <option value="not started">not started</option>
                    <option value="started">started</option>
                    <option value="legal hold">legal hold</option>
                    <option value="expired">expired</option>
                  </select>
                </div>

                <p>
                  <b>Other Properties</b>
                </p>
                <div className={styles.field}>
                  <label></label>
                </div>

                <div className={styles.field}>
                  <label>Creator ID</label>
                  <input
                    value={editRow.d_u_id}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_u_id: e.target.value } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Creator Firstname</label>
                  <input
                    value={editRow.d_c_fname ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_c_fname: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Creator Lastname</label>
                  <input
                    value={editRow.d_c_lname ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_c_lname: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field}>
                  <label>Case ID</label>
                  <input
                    value={editRow.d_case ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_case: e.target.value || null } : p))}
                    disabled={saveDisabled}
                  />
                </div>

                <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <label>Content / OCR Text</label>
                  <textarea
                    value={editRow.d_text ?? ""}
                    onChange={(e) => setEditRow((p) => (p ? { ...p, d_text: e.target.value || null } : p))}
                    disabled={saveDisabled}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={saveEdit}
                className={`${styles.button} ${styles.buttonPrimary} ${saveDisabled ? styles.disabledButton : ""}`}
                disabled={saveDisabled}
                title={isLegalHoldLocked ? "Locked by Legal Hold" : (!canEdit ? "You don’t have permission (USER_EDIT)" : "")}

              >
                {editSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={openDeleteConfirm}
                className={`${styles.button} ${deleteDisabled ? styles.disabledButton : ""}`}
                disabled={deleteDisabled}
                title={isLegalHoldLocked ? "Locked by Legal Hold" : (!canDel ? "You don’t have permission (USER_DEL)" : "Delete document")}
              >
                Delete Document
              </button>
              <button onClick={closeEdit} className={styles.button} disabled={editSaving}>
                Cancel
              </button>
            </div>

            {deleteConfirmOpen && (
              <div style={{ marginTop: 12, padding: 12, border: "1px solid #c0392b", borderRadius: 8, background: "rgba(192, 57, 43, 0.06)" }}>
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
                    title="Delete"
                  >
                    {deleteBusy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
            {status && <p className={styles.status}>{status}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

