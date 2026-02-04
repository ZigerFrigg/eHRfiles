import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// bevorzugt Service Role; fallback nur für Mockup
const KEY = SERVICE_KEY || ANON;

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const d_id = String(body?.d_id ?? "").trim();
    const techUser = String(body?.d_u_id ?? "").trim();

    if (!d_id) return NextResponse.json({ error: "Document ID (d_id) is required." }, { status: 400 });
    if (!techUser) return NextResponse.json({ error: "Tech User (d_u_id) is required." }, { status: 400 });

    // 1) user must exist
    const { data: uData, error: uErr } = await supabase
      .from("users")
      .select("u_id")
      .eq("u_id", techUser)
      .maybeSingle();

    if (uErr) return NextResponse.json({ error: `User lookup failed: ${uErr.message}` }, { status: 500 });
    if (!uData) return NextResponse.json({ error: `User not found: ${techUser}` }, { status: 404 });

    // 2) document must exist
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("d_id", d_id)
      .maybeSingle();

    if (docErr) return NextResponse.json({ error: `Document lookup failed: ${docErr.message}` }, { status: 500 });
    if (!doc) return NextResponse.json({ error: `Document not found: ${d_id}` }, { status: 404 });

    // 3) signed download link
    const bucket = (doc as any).d_stor || "docs";
    const path = (doc as any).d_path;

    if (!path) {
      return NextResponse.json({ error: "Document record has no d_path." }, { status: 500 });
    }

    const { data: signed, error: sErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10); // 10 min

    if (sErr) return NextResponse.json({ error: `Signed URL failed: ${sErr.message}` }, { status: 500 });

    return NextResponse.json(
      {
        ok: true,
        downloadUrl: signed?.signedUrl ?? null,
        document: doc,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("API /api/docinfo error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
