import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic"; // ✅ verhindert Prerender/SSG

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
