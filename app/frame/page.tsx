"use client";

import { useMemo } from "react";
import styles from "../css/users.module.css";
import { useFrame } from "./frame-context";

function yesNo(v: boolean | null | undefined): string {
  return v ? "yes" : "no";
}

export default function FrameHomePage() {
  const { cfg, users, activeUserId, setActiveUserId } = useFrame();

  const homeHtml = cfg["APP_HOME"] || "";

  const switchUserOptions = useMemo(() => {
    return users.map((u) => {
      const country = u.u_cou ?? "N/A";
      const hr = yesNo(u.u_hr);
      const geb = yesNo(u.u_geb);
      return {
        value: u.u_id,
        label: `${u.u_id} | ${u.u_email} | ${u.u_role} | ${country} | HR: ${hr} | GEB: ${geb}`,
      };
    });
  }, [users]);

  return (
    <>
      <div className={styles.card} style={{ marginBottom: 14 }}>
        <div dangerouslySetInnerHTML={{ __html: homeHtml }} />
      </div>

      <div className={styles.card}>
        <div className={styles.searchTitle}>Switch User</div>

        <div className={styles.searchGrid} style={{ marginTop: 10 }}>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label>User</label>
            <select style={{background: "#CCE5FF"}} value={activeUserId} onChange={(e) => setActiveUserId(e.target.value)}>
              {switchUserOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <small></small>
          </div>
        </div>
      </div>
    </>
  );
}
