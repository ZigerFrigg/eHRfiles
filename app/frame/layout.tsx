import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import FrameClientLayout from "./FrameClientLayout";

export default async function FrameLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies(); // ✅ await
  const authed = cookieStore.get("mockup_auth")?.value === "1";

  if (!authed) {
    redirect("/login?next=/frame");
  }

  return <FrameClientLayout>{children}</FrameClientLayout>;
}