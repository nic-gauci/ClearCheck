import assert from "node:assert/strict";
import test from "node:test";
import { describeScreeningCoverage } from "../app/lib/screening-coverage.js";

test("incomplete official coverage qualifies the zero-match statement and names the missing source", () => {
  const eu = { key: "EU", name: "European Union", status: "unavailable" };
  const un = { key: "UN", name: "United Nations", status: "complete" };
  const mt = { key: "MT", name: "Malta ARB", status: "complete" };
  const web = { key: "WEB", name: "Web review", status: "review" };

  assert.deepEqual(describeScreeningCoverage([eu, un, mt, web]), {
    completed: 2,
    total: 3,
    incomplete: true,
    noMatches: "No matches on the 2 official sources checked",
    missingSources: "Sources not checked: European Union.",
  });
  assert.equal(describeScreeningCoverage([{ ...eu, status: "complete" }, un, mt, web]).noMatches, "No official-list names matched");
  assert.equal(describeScreeningCoverage([eu, web]).noMatches, "No official sources were checked");
  assert.equal(describeScreeningCoverage([web]).incomplete, true);
});
