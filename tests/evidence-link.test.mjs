import assert from "node:assert/strict";
import test from "node:test";
import { matchedEvidenceHref } from "../app/lib/evidence-link.ts";

test("PDF evidence searches for the full matched name and keeps the page parameter", () => {
  const href = matchedEvidenceHref({
    href: "/documents/order.PDF?pageVersion=2#page=4",
    name: " Jean-Paul  D’Amato ",
    source: "MT",
  });
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  assert.equal(url.origin, "https://assetrecovery.mt");
  assert.equal(url.searchParams.get("pageVersion"), "2");
  assert.equal(fragment.get("page"), "4");
  assert.equal(fragment.get("search"), "Jean-Paul D’Amato");
  assert.equal(fragment.get("phrase"), "true");
});

test("publisher PDF routes and HTML evidence use their respective search fragments", () => {
  const name = "Jean-Paul, D’Amato";
  assert.match(matchedEvidenceHref({ href: "https://eur-lex.europa.eu/legal-content/EN/PDF/?uri=CELEX:123", name, source: "EU" }), /#search=.*&phrase=true$/);
  assert.equal(matchedEvidenceHref({ href: "https://example.org/decision#annex", name, source: "EU" }),
    "https://example.org/decision#annex:~:text=Jean%2DPaul%2C%20D%E2%80%99Amato");
  assert.equal(matchedEvidenceHref({ href: "javascript:alert(1)", name, source: "EU" }), undefined);
});
