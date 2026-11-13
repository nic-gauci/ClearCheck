import assert from "node:assert/strict";
import test from "node:test";
import { searchAdverseMedia } from "../app/lib/adverse-media.ts";

test("searches by name and returns unique, safe article links", async context => {
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://api.search.brave.com");
    assert.match(url.searchParams.get("q"), /^"Example Person" /);
    assert.equal(options.headers["X-Subscription-Token"], "test-token");
    assert.equal(options.cache, "no-store");
    return Response.json({ type: "search", web: { results: [
      { title: "Example article", url: "https://www.example.com/article", page_age: "2026-11-12T00:00:00" },
      { title: "Duplicate", url: "https://www.example.com/article#section" },
      { title: "Unsafe", url: "javascript:alert(1)" },
      { title: "Invalid", url: "invalid" },
    ] } });
  });
  assert.deepEqual(await searchAdverseMedia("Example Person", "test-token"), [
    { title: "Example article", url: "https://www.example.com/article", publisher: "example.com", date: "2026-11-12" },
  ]);
});

test("distinguishes an empty search from a provider outage", async context => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ type: "search" }));
  assert.deepEqual(await searchAdverseMedia("Example Person", "test-token"), []);
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 429 }));
  await assert.rejects(searchAdverseMedia("Example Person", "test-token"), /provider unavailable/i);
});
