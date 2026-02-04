"use client";

import React, { createContext, useContext } from "react";

export type AppUser = {
  u_id: string;
  u_email: string;
  u_role: string;
  u_cou: string | null;
  u_hr: boolean | null;
  u_geb: boolean | null;
};

export type FrameContextValue = {
  cfg: Record<string, string>;
  users: AppUser[];
  activeUserId: string;
  setActiveUserId: (id: string) => void;
  activeUser: AppUser | null;
  allowedFunctions: Set<string>;
  hasAnyRoleFuncs: boolean;
};

const FrameContext = createContext<FrameContextValue | null>(null);

export function FrameProvider({
  value,
  children,
}: {
  value: FrameContextValue;
  children: React.ReactNode;
}) {
  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>;
}

export function useFrame() {
  const ctx = useContext(FrameContext);
  if (!ctx) throw new Error("useFrame() must be used inside <FrameProvider>");
  return ctx;
}
