/**
 * @param {Pick<import("./screening").ScreeningSource, "key" | "name" | "status">[]} sources
 * @param {boolean} [markedIncomplete]
 */
export function describeScreeningCoverage(sources, markedIncomplete = false) {
  const official = sources.filter(source => source.key !== "WEB");
  const completed = official.filter(source => source.status === "complete").length;
  const missing = official.filter(source => source.status !== "complete").map(source => source.name);
  const incomplete = markedIncomplete || official.length === 0 || missing.length > 0;
  const noMatches = completed === 0
    ? "No official sources were checked"
    : incomplete
      ? `No matches on the ${completed} official source${completed === 1 ? "" : "s"} checked`
      : "No official-list names matched";
  const missingSources = missing.length ? `Sources not checked: ${missing.join(", ")}.` : "";

  return { completed, total: official.length, incomplete, noMatches, missingSources };
}
