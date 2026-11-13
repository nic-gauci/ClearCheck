import { NextResponse } from "next/server";
import { searchAdverseMedia, type AdverseMediaResult } from "../../../lib/adverse-media";
import { getBearerToken, getSupabaseForToken } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

function respond(result: AdverseMediaResult, status = 200) {
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (process.env.ENABLE_ADVERSE_MEDIA !== "true" || !apiKey) return respond({ status: "disabled" });

  const token = getBearerToken(request);
  if (!token) return respond({ status: "unavailable" }, 401);

  const body = await request.json().catch(() => null) as { screeningId?: unknown } | null;
  const id = body?.screeningId;
  if (typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
    return respond({ status: "unavailable" }, 400);
  }

  try {
    const supabase = getSupabaseForToken(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return respond({ status: "unavailable" }, 401);

    // Use the user's existing screening access policy and only send the saved name.
    const { data: screening, error } = await supabase.from("screenings")
      .select("subject_name")
      .eq("id", id)
      .eq("created_by", user.id)
      .maybeSingle();
    if (error) return respond({ status: "unavailable" }, 503);
    if (!screening) return respond({ status: "unavailable" }, 404);

    const articles = await searchAdverseMedia(screening.subject_name, apiKey);
    return respond({ status: "complete", articles });
  } catch {
    return respond({ status: "unavailable" }, 503);
  }
}
