import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // empfohlen
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const BUCKET = "docs";

function sanitizeFileName(name: string) {
  return name.replace(/[\/\\]/g, "_").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

async function getEmployee(e_id: string) {
  const { data, error } = await supabase
    .from("employees")
    .select("e_id, e_compc, e_wloc, e_lhold, e_hr, e_geb")
    .eq("e_id", e_id)
    .maybeSingle();
  if (error) throw new Error(`Employee lookup failed: ${error.message}`);
  if (!data) throw new Error(`Employee not found: ${e_id}`);
  return data as any;
}

async function getDocType(d_key: string) {
  const { data, error } = await supabase
    .from("doc_types")
    .select("d_key, d_r_taxcode, d_r_rule, d_r_trigger, d_r_month")
    .eq("d_key", d_key)
    .maybeSingle();
  if (error) throw new Error(`Doc Type lookup failed: ${error.message}`);
  if (!data) throw new Error(`Doc Type not found: ${d_key}`);
  return data as any;
}

async function getCreatorName(d_u_id: string) {
  // wie eure Upload-Seite: Creator wird über employees.u_id gesucht
  const { data, error } = await supabase
    .from("employees")
    .select("e_fname, e_lname")
    .eq("u_id", d_u_id)
    .maybeSingle();
  if (error) throw new Error(`Creator lookup failed: ${error.message}`);

  const fn = (data as any)?.e_fname ?? "";
  const ln = (data as any)?.e_lname ?? "";
  return { d_c_fname: fn, d_c_lname: ln };
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();

    const e_id = String(form.get("e_id") ?? "").trim();
    const d_key = String(form.get("d_key") ?? "").trim();
    const d_u_id = String(form.get("d_u_id") ?? "").trim();
    const file = form.get("file");

    if (!e_id) return NextResponse.json({ error: "e_id is required" }, { status: 400 });
    if (!d_key) return NextResponse.json({ error: "d_key is required" }, { status: 400 });
    if (!d_u_id) return NextResponse.json({ error: "d_u_id is required" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

    const fileType = (file.type || "").toLowerCase();
    const lowerName = (file.name || "").toLowerCase();
    if (fileType !== "application/pdf" && !lowerName.endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF only" }, { status: 400 });
    }

    // Lookups (wie Upload-Seite)
    const [emp, dt, creator] = await Promise.all([
      getEmployee(e_id),
      getDocType(d_key),
      getCreatorName(d_u_id),
    ]);

    const originalName = file.name || "document.pdf";
    const fileSafe = sanitizeFileName(originalName);

    // bytes
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    // d_hash (NOT NULL)
    const d_hash = crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

    // storage path: YYYY/MM/<uuid>_<e_id>_<original>.pdf
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = pad2(now.getMonth() + 1);
    const storagePath = `${yyyy}/${mm}/${crypto.randomUUID()}_${sanitizeFileName(e_id)}_${fileSafe}`;

    // upload
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    // build payload (orientiert an eurer Upload-Seite)
    const payload: any = {
      d_key,
      d_date: now.toISOString(),
      e_id,

      e_compc: emp.e_compc ?? null,
      e_wloc: emp.e_wloc ?? null,
      e_lhold: !!emp.e_lhold,
      e_hr: !!emp.e_hr,
      e_geb: !!emp.e_geb,

      d_file: fileSafe,
      d_text: null,
      d_hash,
      d_pages: null,

      d_u_id,
      d_c_fname: creator.d_c_fname ?? "",
      d_c_lname: creator.d_c_lname ?? "",

      d_case: null, // in deiner Demo-Seite nicht vorhanden

      d_r_taxcode: dt.d_r_taxcode ?? "",
      d_r_rule: dt.d_r_rule ?? "",
      d_r_trigger: dt.d_r_trigger ?? "",
      d_r_month: Number(dt.d_r_month ?? 0),
      d_r_deletion: null,
      d_r_status: "not started",

      d_stor: BUCKET,
      d_path: storagePath,
      d_mime: "application/pdf",
      d_size: bytes.byteLength,
    };

    const { data: insData, error: insErr } = await supabase
      .from("documents")
      .insert(payload)
      .select("*")
      .single();

    if (insErr) {
      throw new Error(
        `documents insert failed: ${insErr.message} | ${insErr.details ?? ""} | ${insErr.hint ?? ""}`
      );
    }

    return NextResponse.json(
      { ok: true, document: insData, storage: { bucket: BUCKET, path: storagePath } },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("API /api/documents error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
