import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { collectEUOfficialJournalDataset } from "../_shared/eu-legal-designations.ts";

const SOURCE_BASE_URL = "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content";
const SOURCE_PAGE = "https://webgate.ec.europa.eu/fsd/fsf/#!/files";
const BUCKET = "screening-source-data";
const OBJECT_PATH = "eu/latest.csv";
const JOURNAL_SOURCE_PAGE = "https://op.europa.eu/en/web/cellar/cellar-data/metadata/knowledge-graph";
const JOURNAL_OBJECT_PATH = "eu/official-journal.json";
const REQUIRED_HEADERS = ["Entity_LogicalId", "Entity_SubjectType", "NameAlias_WholeName"];

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left:string,right:string){
  const leftBytes=new TextEncoder().encode(left),rightBytes=new TextEncoder().encode(right);
  if(leftBytes.length!==rightBytes.length)return false;
  let difference=0;for(let index=0;index<leftBytes.length;index++)difference|=leftBytes[index]^rightBytes[index];
  return difference===0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expectedSyncSecret=Deno.env.get("SOURCE_SYNC_SECRET"),providedSyncSecret=request.headers.get("x-clearcheck-sync-secret")||"";
  if(!expectedSyncSecret||!safeEqual(expectedSyncSecret,providedSyncSecret))return new Response("Unauthorized",{status:401});

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return Response.json({status:"failed",error:"Supabase service environment is unavailable"},{status:502});
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const syncConsolidated=async()=>{try {
    const crawlerToken = Deno.env.get("EU_FSF_CRAWLER_TOKEN");
    if (!crawlerToken) throw new Error("EU_FSF_CRAWLER_TOKEN is not configured");
    const sourceUrl = `${SOURCE_BASE_URL}?token=${encodeURIComponent(crawlerToken)}`;
    const response = await fetch(sourceUrl, {
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
      source_url: SOURCE_PAGE,
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

    return { status: "ready", refreshedAt, rowCount, checksum };
  } catch (error) {
    const message = error instanceof Error ? error.message : "EU sanctions sync failed";
    await admin.from("source_snapshots").upsert({
        source_key: "eu_consolidated",
        source_url: SOURCE_PAGE,
        storage_bucket: BUCKET,
        storage_path: OBJECT_PATH,
        status: "failed",
        error_message: message,
      }, { onConflict: "source_key" });
    return { status: "failed", error: message };
  }};

  const syncOfficialJournal=async()=>{try{
    const dataset=await collectEUOfficialJournalDataset(),encoded=new TextEncoder().encode(JSON.stringify(dataset));
    const {error:uploadError}=await admin.storage.from(BUCKET).upload(JOURNAL_OBJECT_PATH,encoded,{contentType:"application/octet-stream",cacheControl:"3600",upsert:true});
    if(uploadError)throw uploadError;
    const latestActDate=dataset.entries.map(entry=>entry.actDate).sort().at(-1)||null;
    const {error:metadataError}=await admin.from("source_snapshots").upsert({source_key:"eu_official_journal",source_url:JOURNAL_SOURCE_PAGE,storage_bucket:BUCKET,storage_path:JOURNAL_OBJECT_PATH,checksum_sha256:dataset.version,file_size_bytes:encoded.byteLength,row_count:dataset.entries.length,source_last_modified:latestActDate,refreshed_at:dataset.generatedAt,status:"ready",error_message:null},{onConflict:"source_key"});
    if(metadataError)throw metadataError;
    return{status:"ready",refreshedAt:dataset.generatedAt,rowCount:dataset.entries.length,actCount:dataset.acts,checksum:dataset.version};
  }catch(error){
    const message=error instanceof Error?error.message:"EU Official Journal sync failed";
    await admin.from("source_snapshots").upsert({source_key:"eu_official_journal",source_url:JOURNAL_SOURCE_PAGE,storage_bucket:BUCKET,storage_path:JOURNAL_OBJECT_PATH,status:"failed",error_message:message},{onConflict:"source_key"});
    return{status:"failed",error:message};
  }};

  const [consolidated,officialJournal]=await Promise.all([syncConsolidated(),syncOfficialJournal()]);
  const ready=consolidated.status==="ready"&&officialJournal.status==="ready";
  return Response.json({status:ready?"ready":"failed",sources:{consolidated,officialJournal}},{status:ready?200:502});
});
