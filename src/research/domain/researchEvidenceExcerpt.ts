const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "company",
  "current",
  "evidence",
  "research",
  "what",
  "which",
  "should",
  "would",
  "please",
]);

export function researchSearchTerms(inputs: readonly string[]): string[] {
  return [
    ...new Set(
      inputs.flatMap(
        (input) =>
          input.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [],
      ),
    ),
  ]
    .filter((term) => !STOP_WORDS.has(term))
    .slice(0, 80);
}

export function researchEvidenceExcerpt(
  text: string,
  focus: readonly string[],
  maxChars: number,
): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const terms = researchSearchTerms(focus);
  const lower = text.toLowerCase();
  const windowSize = Math.min(2_400, Math.max(400, Math.floor(maxChars / 3)));
  const starts = new Set([0]);
  for (const term of terms) {
    let cursor = 0;
    for (let count = 0; count < 24; count += 1) {
      const index = lower.indexOf(term, cursor);
      if (index < 0) break;
      starts.add(Math.max(0, Math.min(text.length - windowSize, index - 600)));
      cursor = index + term.length;
    }
  }
  const ranked = [...starts]
    .map((start) => {
      const window = lower.slice(start, start + windowSize);
      const matches = terms.filter((term) => window.includes(term));
      return {
        start,
        matches,
        score:
          matches.length * 10 +
          Math.min(5, (window.match(/\d[%.,\d]*/gu) ?? []).length),
      };
    })
    .sort((a, b) => b.score - a.score || a.start - b.start);
  const selected: typeof ranked = [];
  const covered = new Set<string>();
  while (ranked.length > 0 && selected.length < 6) {
    ranked.sort(
      (a, b) =>
        b.score +
          b.matches.filter((term) => !covered.has(term)).length * 12 -
          (a.score +
            a.matches.filter((term) => !covered.has(term)).length * 12) ||
        a.start - b.start,
    );
    const next = ranked.shift();
    if (next === undefined) break;
    if (selected.some((item) => Math.abs(item.start - next.start) < windowSize))
      continue;
    selected.push(next);
    for (const term of next.matches) covered.add(term);
    if (selected.length * (windowSize + 45) >= maxChars) break;
  }
  return selected
    .map(
      ({ start }) =>
        `[source characters ${start}-${start + windowSize}]\n${text.slice(start, start + windowSize)}`,
    )
    .join("\n\n")
    .slice(0, maxChars);
}
