"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "../css/users.module.css";

type PageInfoProps = {
  cName: string; // config.c_name
};

export default function PageInfo({ cName }: PageInfoProps) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("config")
        .select("c_value")
        .eq("c_name", cName)
        .maybeSingle();

      if (!cancelled && !error) {
        setHtml(data?.c_value ?? "");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cName]);

  if (!html) return null;

  return (
    <div
      className={styles.pageInfoBox}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

