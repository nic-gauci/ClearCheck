import type { ScreeningMatch } from "./screening";

export function matchedEvidenceHref({ href, name, source }: Pick<ScreeningMatch, "href" | "name" | "source">) {
  let url: URL;
  try {
    url = new URL(href, source === "MT" ? "https://assetrecovery.mt/court-orders/" : undefined);
  } catch {
    return undefined;
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;

  const phrase = name.trim().replace(/\s+/g, " ");
  if (!phrase) return url.href;

  const isPdf = /\.pdf$/i.test(url.pathname) ||
    (url.hostname === "eur-lex.europa.eu" && /^\/legal-content\/(?:[a-z]{2}\/)?(?:TXT\/)?PDF\/?$/i.test(url.pathname));
  const fragment = url.hash.slice(1);

  if (isPdf) {
    // Keep named PDF destinations intact. They cannot be combined with open parameters.
    if (fragment && !fragment.includes("=")) return url.href;
    const params = new URLSearchParams(fragment);
    params.set("search", phrase);
    params.set("phrase", "true");
    url.hash = params.toString();
  } else {
    const anchor = fragment.split(":~:", 1)[0];
    const text = encodeURIComponent(phrase).replace(/-/g, "%2D");
    url.hash = `${anchor}:~:text=${text}`;
  }
  return url.href;
}
