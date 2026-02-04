"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "../css/users.module.css";
import { FrameProvider, type AppUser } from "./frame-context";

type ConfigRow = { c_name: string; c_value: string | null };
type RoleFuncRow = { rf_function: string };

const LS_KEY_ACTIVE_USER = "ehr_active_user_id";

export default function FrameLayout({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [allowedFunctions, setAllowedFunctions] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"success" | "error" | "">("");

  // Load config + users once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setStatus("");
      setStatusKind("");

      try {
        const [{ data: cfgData, error: cfgErr }, { data: userData, error: userErr }] = await Promise.all([
          supabase
            .from("config")
            .select("c_name, c_value")
            .in("c_name", ["APP_NAME", "APP_TITLE", "APP_HOME", "APP_FOOTER"]),
          supabase.from("users").select("u_id, u_email, u_role, u_cou, u_hr, u_geb").order("u_id"),
        ]);

        if (cfgErr) throw cfgErr;
        if (userErr) throw userErr;

        const cfgMap: Record<string, string> = {};
        (cfgData as ConfigRow[] | null)?.forEach((r) => {
          cfgMap[r.c_name] = r.c_value ?? "";
        });

        const loadedUsers = (userData ?? []) as AppUser[];

        if (cancelled) return;

        setCfg(cfgMap);
        setUsers(loadedUsers);

        const savedId = window.localStorage.getItem(LS_KEY_ACTIVE_USER);
        const resolved =
          (savedId && loadedUsers.find((u) => u.u_id === savedId)?.u_id) || loadedUsers[0]?.u_id || "";
        setActiveUserId(resolved);
      } catch (e: any) {
        if (cancelled) return;
        setStatusKind("error");
        setStatus(`Error: ${e?.message ?? String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeUser = useMemo(() => users.find((u) => u.u_id === activeUserId) ?? null, [users, activeUserId]);

  // Persist active user
  useEffect(() => {
    if (!activeUserId) return;
    try {
      window.localStorage.setItem(LS_KEY_ACTIVE_USER, activeUserId);
    } catch {
      // ignore
    }
  }, [activeUserId]);

  // Load role -> functions mapping for current user role (used to enable/disable menu links)
  useEffect(() => {
    let cancelled = false;

    async function loadRoleFuncs(roleName: string) {
      if (!roleName) {
        setAllowedFunctions(new Set());
        return;
      }
      try {
        const { data, error } = await supabase.from("role_func").select("rf_function").eq("rf_role", roleName);
        if (error) throw error;
        if (cancelled) return;
        const set = new Set<string>(((data ?? []) as RoleFuncRow[]).map((x) => x.rf_function));
        setAllowedFunctions(set);
      } catch {
        if (cancelled) return;
        // If something is missing, don't block the user; keep everything enabled.
        setAllowedFunctions(new Set());
      }
    }

    loadRoleFuncs(activeUser?.u_role ?? "");
    return () => {
      cancelled = true;
    };
  }, [activeUser?.u_role]);

  const appName = cfg["APP_NAME"] || "EHR Files";
  const appTitle = cfg["APP_TITLE"] || "Mockup";
  const footerHtml = cfg["APP_FOOTER"] || "";

  const userDisplay = useMemo(() => {
    if (!activeUser) return "";
    return `${activeUser.u_id} | ${activeUser.u_email} | ${activeUser.u_role}`;
  }, [activeUser]);

  const hasAnyRoleFuncs = allowedFunctions.size > 0;

  function enabled(requiredFunc?: string): boolean {
    if (!requiredFunc) return true;
    if (!hasAnyRoleFuncs) return true; // mockup-friendly default
    return allowedFunctions.has(requiredFunc);
  }

  const MENU = useMemo(() => {
    return [
      { type: "item" as const, label: "Home", href: "/frame" },

      { type: "title" as const, label: "User Functions" },
      { type: "item" as const, label: "Dossier Search", href: "/frame/user/dossier-search", fn: "USER_DOSSIER_SEARCH" },
      { type: "item" as const, label: "Upload", href: "/frame/user/upload", fn: "USER_UPLOAD" },
      { type: "item" as const, label: "Bulk Upload", href: "/frame/user/bulk-upload", fn: "USER_BULK_UPLOAD" },

      { type: "title" as const, label: "Admin Functions" },
      { type: "item" as const, label: "Documents", href: "/frame/admin/documents", fn: "ADMIN_DOCUMENTS" },
      { type: "item" as const, label: "Doc Types", href: "/frame/admin/doctypes", fn: "ADMIN_DOCTYPES" },
      { type: "item" as const, label: "Doc Type Groups", href: "/frame/admin/groups", fn: "ADMIN_DOCGROUPS" },
      { type: "item" as const, label: "Employees", href: "/frame/admin/employees", fn: "ADMIN_EMPLOYEES" },
      { type: "item" as const, label: "Users", href: "/frame/admin/users", fn: "ADMIN_USERS" },
      { type: "item" as const, label: "Roles", href: "/frame/admin/roles", fn: "ADMIN_ROLES" },
      { type: "item" as const, label: "Functions", href: "/frame/admin/functions", fn: "ADMIN_FUNCTIONS" },
      { type: "item" as const, label: "Roles & Functions", href: "/frame/admin/role-func", fn: "ADMIN_ROLE_FUNC" },
      { type: "item" as const, label: "Roles & Doc Types", href: "/frame/admin/role-dt", fn: "ADMIN_ROLE_DT" },
      { type: "item" as const, label: "Countries", href: "/frame/admin/countries", fn: "ADMIN_COUNTRIES" },
      { type: "item" as const, label: "Config", href: "/frame/admin/config", fn: "ADMIN_CONFIG" },

      { type: "title" as const, label: "Others" },
      { type: "item" as const, label: "API Doc Upload", href: "/frame/admin/api-upload", fn: "ADMIN_APIUPL" },
      { type: "item" as const, label: "API Doc Download", href: "/frame/admin/api-docinfo", fn: "ADMIN_APIDOC" },
      { type: "item" as const, label: "Batch Legal Hold", href: "/frame/admin/batch-lh", fn: "ADMIN_BAT_LH" },
      { type: "item" as const, label: "Batch Retention", href: "/frame/admin/batch-ret", fn: "ADMIN_BAT_RET" },

    ];
  }, []);

  const topBarHeight = 54;
  const leftMenuWidth = 260;
  const footerHeight = 56;

  const frameValue = useMemo(
    () => ({
      cfg,
      users,
      activeUserId,
      setActiveUserId,
      activeUser,
      allowedFunctions,
      hasAnyRoleFuncs,
    }),
    [cfg, users, activeUserId, activeUser, allowedFunctions, hasAnyRoleFuncs]
  );

  return (
    <FrameProvider value={frameValue}>
      <main className={styles.page}>
        {/* Top Bar */}
        <header
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: topBarHeight,
            background: "#020040",
            color: "#ffffff",
            borderBottom: "1px solid #d0d0d0",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            alignItems: "center",
            padding: "0 14px",
            zIndex: 50,
          }}
        >
          <div style={{ fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: appName }} />
          <div style={{ textAlign: "center", fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: appTitle }} />
          <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: "0.9rem" }}>{userDisplay}</div>
        </header>

        {/* Left Menu */}
        <aside
          style={{
            position: "fixed",
            top: topBarHeight,
            left: 0,
            bottom: footerHeight,
            width: leftMenuWidth,
            overflowY: "auto",
            background: "#f7f7f7",
            borderRight: "1px solid #d0d0d0",
            padding: "12px 10px",
            zIndex: 40,
          }}
        >
          {MENU.map((m) => {
            if (m.type === "title") {
              return (
                <div
                  key={m.label}
                  style={{
                    marginTop: 12,
                    marginBottom: 6,
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    color: "#444",
                  }}
                >
                  {m.label}
                </div>
              );
            }

            const ok = enabled(m.fn);
            const commonStyle: React.CSSProperties = {
              display: "block",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d9d9d9",
              background: ok ? "#CCE5FF" : "#efefef",
              color: ok ? "#222" : "#888",
              textDecoration: "none",
              cursor: ok ? "pointer" : "not-allowed",
              fontSize: "0.92rem",
              marginBottom: 6,
            };

            return ok ? (
              <a key={m.href} href={m.href} style={commonStyle}>
                {m.label}
              </a>
            ) : (
              <span key={m.href} style={commonStyle}>
                {m.label}
              </span>
            );
          })}
        </aside>

        {/* Main Content (Frame) */}
        <section
          style={{
            marginTop: topBarHeight,
            marginLeft: leftMenuWidth,
            marginBottom: footerHeight,
            padding: "14px 18px",
            overflow: "auto",
            minHeight: `calc(100vh - ${topBarHeight + footerHeight}px)`,
          }}
        >
          {status && (
            <div className={`${styles.status} ${statusKind === "error" ? (styles as any).error : ""}`}>{status}</div>
          )}

          {loading ? <div className={styles.status}>Loading…</div> : children}
        </section>

        {/* Footer */}
        <footer
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            height: footerHeight,
            background: "#020040",
            color: "#ffffff",
            borderTop: "1px solid #d0d0d0",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            zIndex: 50,
          }}
        >
          <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: footerHtml }} />
        </footer>
      </main>
    </FrameProvider>
  );
}
