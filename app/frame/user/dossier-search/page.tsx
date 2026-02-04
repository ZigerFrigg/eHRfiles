"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "../../../css/users.module.css";
import { ArrowRight } from 'lucide-react';
import PageInfo from "../../../components/PageInfo";

type Country = { c_id: string; c_desc: string | null };

type EmployeeRow = {
  e_id: string;
  e_fname: string | null;
  e_lname: string | null;
  e_compn: string | null;
  e_wloc: string | null;
  e_class: string | null;
  e_status: string | null;
  e_tdate: string | null; // date or timestamptz as string
  doc_count: number; // derived from documents(count)
};

type SortKey = "e_id" | "name" | "e_compn" | "e_wloc" | "e_class" | "e_status" | "e_tdate" | "docs";

function formatDateDMMyy(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const mon = d.toLocaleString("en-GB", { month: "short" }); // Jan, Feb...
  const yy = String(d.getFullYear()).slice(-2);
  return `${day}-${mon}-${yy}`;
}

function fullName(e: Pick<EmployeeRow, "e_fname" | "e_lname">): string {
  const ln = (e.e_lname ?? "").trim();
  const fn = (e.e_fname ?? "").trim();
  const name = [ln, fn].filter(Boolean).join(", ");
  return name || "—";
}

export default function DossierEmployeeSearchPage() {
  // Filters
  const [fEid, setFEid] = useState("");
  const [fName, setFName] = useState("");
  const [fCountry, setFCountry] = useState("");

  // Reference data
  const [countries, setCountries] = useState<Country[]>([]);

  // Results
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Table controls
  const [sortKey, setSortKey] = useState<SortKey>("e_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Paging
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // UI
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  const lastQueryId = useRef(0);

  // --- Load countries once
  useEffect(() => {
    let cancelled = false;
    async function loadCountries() {
      try {
        const { data, error } = await supabase.from("countries").select("c_id, c_desc").order("c_id");
        if (error) throw error;
        if (!cancelled) setCountries((data ?? []) as Country[]);
      } catch (e: any) {
        if (!cancelled) setStatus(`Error: ${e?.message ?? String(e)}`);
      }
    }
    loadCountries();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Debounce filters (live search)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPageIndex(0);
      loadEmployees();
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fEid, fName, fCountry]);

  // --- Load when paging/sorting changes
  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, pageSize, sortKey, sortDir]);

  async function loadEmployees() {
    const myId = ++lastQueryId.current;
    setBusy(true);
    setStatus("");

    try {
      // Build base query for count
      let countQ = supabase.from("employees").select("e_id", { count: "exact", head: true });

      // Filters
      const eid = fEid.trim();
      const name = fName.trim();
      const country = fCountry.trim();

      if (eid) countQ = countQ.ilike("e_id", `%${eid}%`);
      if (name) {
        // (lname contains) OR (fname contains)
        countQ = countQ.or(`e_lname.ilike.%${name}%,e_fname.ilike.%${name}%`);
      }
      if (country) countQ = countQ.eq("e_wloc", country);

      const { count, error: countErr } = await countQ;
      if (countErr) throw countErr;
      const total = count ?? 0;

      if (myId !== lastQueryId.current) return;
      setTotalCount(total);

      // Data query (include documents(count))
      let q = supabase.from("employees").select(`
        e_id,
        e_fname,
        e_lname,
        e_compn,
        e_wloc,
        e_class,
        e_status,
        e_tdate,
        documents(count)
      `);

      if (eid) q = q.ilike("e_id", `%${eid}%`);
      if (name) q = q.or(`e_lname.ilike.%${name}%,e_fname.ilike.%${name}%`);
      if (country) q = q.eq("e_wloc", country);

      // Sorting (server-side where possible)
      const dirAsc = sortDir === "asc";
      if (sortKey === "name") {
        q = q.order("e_lname", { ascending: dirAsc }).order("e_fname", { ascending: dirAsc });
      } else if (sortKey !== "docs") {
        const col =
          sortKey === "e_id"
            ? "e_id"
            : sortKey === "e_compn"
              ? "e_compn"
              : sortKey === "e_wloc"
                ? "e_wloc"
                : sortKey === "e_class"
                  ? "e_class"
                  : sortKey === "e_status"
                    ? "e_status"
                    : sortKey === "e_tdate"
                      ? "e_tdate"
                      : "e_id";
        q = q.order(col, { ascending: dirAsc, nullsFirst: false });
      }

      // Paging
      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, error } = await q;
      if (error) throw error;

      if (myId !== lastQueryId.current) return;

      const employeesRaw = (data ?? []) as any[];

      const employees: EmployeeRow[] = employeesRaw.map((r) => ({
        e_id: r.e_id,
        e_fname: r.e_fname ?? null,
        e_lname: r.e_lname ?? null,
        e_compn: r.e_compn ?? null,
        e_wloc: r.e_wloc ?? null,
        e_class: r.e_class ?? null,
        e_status: r.e_status ?? null,
        e_tdate: r.e_tdate ?? null,
        doc_count: (r.documents?.[0]?.count ?? 0) as number,
      }));

      setRows(employees);
    } catch (e: any) {
      if (myId !== lastQueryId.current) return;
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      if (myId === lastQueryId.current) setBusy(false);
    }
  }

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
    setPageIndex(0);
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // Client-side sort for docs column (only affects current page; acceptable for mockup)
  const displayRows = useMemo(() => {
    if (sortKey !== "docs") return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => (a.doc_count - b.doc_count) * dir);
  }, [rows, sortKey, sortDir]);

  const filteredCount = totalCount;
  const totalLabel = `Filter: ${filteredCount} of ${totalCount} Dossiers / Employees`;

  function sortIndicator(k: SortKey) {
    if (k !== sortKey) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>User — Dossier / Employee Search</h1>
      <PageInfo cName="USR_SEARCH" />
      {/* Filter */}
      <section className={styles.searchPanel}>
        <div className={styles.searchTitle}>Filter / Search</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label>EID</label>
            <input value={fEid} onChange={(e) => setFEid(e.target.value)} placeholder="e.g. 1234" />
          </div>

          <div className={styles.field}>
            <label>Name</label>
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. John" />
          </div>

          <div className={styles.field}>
            <label>Country</label>
            <select value={fCountry} onChange={(e) => setFCountry(e.target.value)}>
              <option value="">All</option>
              {countries.map((c) => (
                <option key={c.c_id} value={c.c_id}>
                  {c.c_id} {c.c_desc ? `— ${c.c_desc}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: 10 }}>
          <span className={styles.status}>{busy ? "Loading…" : totalLabel}</span>
          {status && <span className={`${styles.status} ${(styles as any).error}`}>{status}</span>}
        </div>
      </section>

      {/* Result */}
      <section className={styles.card}>
        <div className={styles.searchTitle}>Result</div>

        <table className={styles.table} style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("e_id")}>
                  EID {sortIndicator("e_id")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("name")}>
                  Name {sortIndicator("name")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("e_compn")}>
                  Company {sortIndicator("e_compn")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("e_wloc")}>
                  Country {sortIndicator("e_wloc")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("e_class")}>
                  Empl Class {sortIndicator("e_class")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("e_status")}>
                  Status {sortIndicator("e_status")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("e_tdate")}>
                  T Date {sortIndicator("e_tdate")}
                </button>
              </th>
              <th>
                <button className={styles.linkButton} onClick={() => toggleSort("docs")}>
                  # Docs {sortIndicator("docs")}
                </button>
              </th>
              <th>Open</th>
            </tr>
          </thead>

          <tbody>
            {displayRows.map((e) => {
              const terminated = (e.e_status ?? "").toLowerCase() === "terminated";
              const tdate = terminated ? formatDateDMMyy(e.e_tdate) : "";
              const docs = e.doc_count ?? 0;

              return (
                <tr key={e.e_id}>
                  <td>{e.e_id}</td>
                  <td>{fullName(e)}</td>
                  <td>{e.e_compn ?? ""}</td>
                  <td>{e.e_wloc ?? ""}</td>
                  <td>{e.e_class ?? ""}</td>
                  <td>{e.e_status ?? ""}</td>
                  <td>{tdate}</td>
                  <td>{docs}</td>
                  <td>
                    {docs > 0 ? (
                      <a
                          href={`/frame/user/dossier?e_id=${encodeURIComponent(e.e_id)}`}
                          className={styles.iconButton}
                          title="Open dossier"
                        >
                          <ArrowRight size={20} />
                        </a>
                      ) : (
                        <button
                          className={styles.iconButton}
                          disabled
                          title="No documents available"
                        >
                          <ArrowRight size={20} />
                        </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {displayRows.length === 0 && (
              <tr>
                <td colSpan={9} className={styles.status}>
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Paging */}
        <div className={styles.paginationBar} style={{ marginTop: 12 }}>
          <button
            className={styles.button}
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex <= 0 || busy}
          >
            Prev
          </button>

          <div className={`${styles.status} ${styles.pageIndicator}`}>
            Page {Math.min(pageIndex + 1, pageCount)} / {pageCount}
          </div>

          <div className={styles.pageSizeGroup}>
            <span className={styles.status}>Show</span>
            <select
              className={styles.pageSizeSelect}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number.parseInt(e.target.value, 10));
                setPageIndex(0);
              }}
              disabled={busy}
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
            </select>
          </div>

          <button
            className={styles.button}
            onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            disabled={pageIndex >= pageCount - 1 || busy}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
