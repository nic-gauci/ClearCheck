import { createClient } from "@supabase/supabase-js";
import { collectEUOfficialJournalDataset } from "../supabase/functions/_shared/eu-legal-designations.ts";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(!url||!key)throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const bucket="screening-source-data",path="eu/official-journal.json";
const dataset=await collectEUOfficialJournalDataset(),bytes=new TextEncoder().encode(JSON.stringify(dataset));
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {error:uploadError}=await admin.storage.from(bucket).upload(path,bytes,{contentType:"application/octet-stream",cacheControl:"3600",upsert:true});
if(uploadError)throw uploadError;
const latestActDate=dataset.entries.map(entry=>entry.actDate).sort().at(-1)||null;
const {error:metadataError}=await admin.from("source_snapshots").upsert({source_key:"eu_official_journal",source_url:"https://op.europa.eu/en/web/cellar/cellar-data/metadata/knowledge-graph",storage_bucket:bucket,storage_path:path,checksum_sha256:dataset.version,file_size_bytes:bytes.byteLength,row_count:dataset.entries.length,source_last_modified:latestActDate,refreshed_at:dataset.generatedAt,status:"ready",error_message:null},{onConflict:"source_key"});
if(metadataError)throw metadataError;
console.log(JSON.stringify({status:"ready",acts:dataset.acts,entries:dataset.entries.length,people:dataset.entries.filter(entry=>entry.type==="person").length,businesses:dataset.entries.filter(entry=>entry.type==="business").length,version:dataset.version},null,2));
