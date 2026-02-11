import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { password } = (await req.json()) as { password?: string };

    if (!password) {
      return NextResponse.json({ ok: false, message: "Missing password" }, { status: 400 });
    }

    // Server-side Supabase client (Service Role recommended)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, message: "Server not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("config")
      .select("c_value")
      .eq("c_name", "APP_LOGIN")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const expected = (data?.c_value ?? "").trim();

    if (!expected || password !== expected) {
      return NextResponse.json(
        { ok: false, message: "Error, wrong Password - Contact the owner of the Site" },
        { status: 401 }
      );
    }

    // Success: set cookie
    const res = NextResponse.json({ ok: true });

    res.cookies.set("mockup_auth", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // optional: 7 days
      // maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? String(e) }, { status: 500 });
  }
}
