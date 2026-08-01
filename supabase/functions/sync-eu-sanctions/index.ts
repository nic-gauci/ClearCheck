import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const SOURCE_URL = "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw";
const BUCKET = "screening-source-data";
const OBJECT_PATH = "eu/latest.csv";
const REQUIRED_HEADERS = ["Entity_LogicalId", "Entity_SubjectType", "NameAlias_WholeName"];

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const response = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "ClearCheck/1.0 daily-official-source-sync" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`European Commission returned ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const header = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
    const rowCount = Math.max(text.split(/\r?\n/).length - 2, 0);
    if (bytes.byteLength < 100_000 || rowCount < 500 || REQUIRED_HEADERS.some((name) => !header.includes(name))) {
      throw new Error("Downloaded EU sanctions file failed validation");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Supabase service environment is unavailable");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const checksum = hex(await crypto.subtle.digest("SHA-256", bytes));
    const refreshedAt = new Date().toISOString();

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(OBJECT_PATH, bytes, {
      contentType: "text/csv; charset=utf-8",
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { error: metadataError } = await admin.from("source_snapshots").upsert({
      source_key: "eu_consolidated",
      source_url: SOURCE_URL,
      storage_bucket: BUCKET,
      storage_path: OBJECT_PATH,
      checksum_sha256: checksum,
      file_size_bytes: bytes.byteLength,
      row_count: rowCount,
      source_last_modified: response.headers.get("last-modified"),
      refreshed_at: refreshedAt,
      status: "ready",
      error_message: null,
    }, { onConflict: "source_key" });
    if (metadataError) throw metadataError;

    return Response.json({ status: "ready", refreshedAt, rowCount, checksum });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EU sanctions sync failed";
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await admin.from("source_snapshots").upsert({
        source_key: "eu_consolidated",
        source_url: SOURCE_URL,
        storage_bucket: BUCKET,
        storage_path: OBJECT_PATH,
        status: "failed",
        error_message: message,
      }, { onConflict: "source_key" });
    }
    return Response.json({ status: "failed", error: message }, { status: 502 });
  }
});
