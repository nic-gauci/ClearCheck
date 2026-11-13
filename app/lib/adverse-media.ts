export type WebArticle = { title: string; url: string; publisher: string; date?: string };
export type AdverseMediaResult =
  | { status: "disabled" | "unavailable" }
  | { status: "complete"; articles: WebArticle[] };

export async function searchAdverseMedia(name: string, apiKey: string): Promise<WebArticle[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  const phrase = name.replace(/["\u0000-\u001f]/g, " ").trim();
  url.search = new URLSearchParams({
    q: `"${phrase}" (fraud OR "money laundering" OR "financial crime")`,
    count: "10",
    result_filter: "web",
    spellcheck: "false",
    text_decorations: "false",
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Web search provider unavailable.");

  const payload = await response.json() as {
    web?: { results?: Array<{ title?: string; url?: string; page_age?: string }> };
    type?: string;
  };
  if (payload?.type !== "search") throw new Error("Unexpected web search response.");

  const articles = new Map<string, WebArticle>();
  for (const result of payload.web?.results ?? []) {
    if (typeof result?.title !== "string" || !result.title.trim() || typeof result.url !== "string") continue;
    let link: URL;
    try {
      link = new URL(result.url);
    } catch {
      continue;
    }
    if (!["https:", "http:"].includes(link.protocol) || link.username || link.password) continue;
    link.hash = "";
    const href = link.href;
    if (articles.has(href)) continue;

    articles.set(href, {
      title: result.title.trim(),
      url: href,
      publisher: link.hostname.replace(/^www\./, ""),
      date: typeof result.page_age === "string" && /^\d{4}-\d{2}-\d{2}/.test(result.page_age)
        ? result.page_age.slice(0, 10)
        : undefined,
    });
  }
  return [...articles.values()];
}
