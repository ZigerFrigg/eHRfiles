"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PageInfo from "../../../components/PageInfo";

// Re-use the shared CSS module you moved to your central css folder:
import styles from "../../../css/users.module.css";

type Country = { c_id: string; c_desc: string };

function parseSemicolonCsvWithHeader(text: string): Country[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0].split(";").map((h) => h.trim().toUpperCase());
  const idxId = header.indexOf("C_ID");
  const idxDesc = header.indexOf("C_DESC");

  if (idxId === -1 || idxDesc === -1) {
    throw new Error('CSV Header must contain "C_ID" and "C_DESC" (delimiter ";").');
  }

  const out: Country[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((c) => c.trim());
    const c_id = (cols[idxId] ?? "").toUpperCase();
    const c_desc = cols[idxDesc] ?? "";

    if (!c_id) continue;

    // Minimal validation: ISO Alpha-3
    if (!/^[A-Z]{3}$/.test(c_id)) {
      throw new Error(`Invalid Code "${c_id}" on line ${i + 1} (expected Alpha-3 like CHE).`);
    }

    out.push({ c_id, c_desc });
  }

  // Dedup by c_id (last wins)
  const map = new Map<string, Country>();
  for (const c of out) map.set(c.c_id, c);
  return Array.from(map.values());
}

export default function AdminCountriesPage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>(""); // keep simple (no error coloring requested here)

  const sorted = useMemo(() => {
    return [...countries].sort((a, b) => a.c_id.localeCompare(b.c_id));
  }, [countries]);

  async function loadCountries() {
    const { data, error } = await supabase.from("countries").select("c_id, c_desc");
    if (error) throw error;
    setCountries((data ?? []) as Country[]);
  }

  useEffect(() => {
    loadCountries().catch((e) => setStatus(`Error: ${e.message ?? String(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFileSelected(file: File | null) {
    if (!file) return;

    setStatus(""); 
    setLoading(true);

    try {
      const text = await file.text();
      const parsed = parseSemicolonCsvWithHeader(text);

      if (parsed.length === 0) {
        throw new Error("CSV contains no data rows (after the header).");
      }

      // 1) Flush table (Supabase often requires a filter on delete())
      const { error: delErr } = await supabase.from("countries").delete().neq("c_id", "__never__");
      if (delErr) throw delErr;

      // 2) Insert new rows (in batches)
      const batchSize = 500;
      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize);
        const { error: insErr } = await supabase.from("countries").insert(batch);
        if (insErr) throw insErr;
      }

      // 3) Reload view
      setStatus(`Loaded countries: ${parsed.length}`);
      await loadCountries();
      router.refresh();
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin — Countries</h1>
      <PageInfo cName="ADM_COU" />
      <div className={styles.actions}>
        <label className={`${styles.button} ${styles.buttonPrimary}`} style={{ opacity: loading ? 0.6 : 1 }}>
          Load Countries (CSV)
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={loading}
            style={{ display: "none" }}
            onClick={(e) => {
              // allow selecting the same file repeatedly
              (e.target as HTMLInputElement).value = "";
            }}
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
        </label>

        {loading && <span className={styles.status}>Loading…</span>}
        {status && <span className={styles.status}>{status}</span>}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Country</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.c_id}>
              <td>{c.c_id}</td>
              <td>{c.c_desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
