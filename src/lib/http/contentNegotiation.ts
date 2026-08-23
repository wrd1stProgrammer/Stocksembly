const PRODUCED_REPRESENTATIONS = ["text/html", "text/markdown"] as const;

export type ProducedRepresentation = (typeof PRODUCED_REPRESENTATIONS)[number];

type AcceptEntry = Readonly<{
  type: string;
  quality: number;
  specificity: number;
}>;

function parseQuality(parameters: readonly string[]): number {
  for (const parameter of parameters) {
    const [rawName, rawValue] = parameter.split("=", 2);
    if (rawName?.trim().toLowerCase() !== "q") continue;
    const parsed = Number(rawValue?.trim());
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed));
  }
  return 1;
}

function parseAccept(header: string): readonly AcceptEntry[] {
  const entries: AcceptEntry[] = [];
  for (const rawEntry of header.split(",")) {
    const [rawType, ...parameters] = rawEntry
      .trim()
      .split(";")
      .map((part) => part.trim());
    const type = rawType?.toLowerCase();
    if (type === undefined || type.length === 0 || !type.includes("/"))
      continue;
    entries.push({
      type,
      quality: parseQuality(parameters),
      specificity: type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2,
    });
  }
  return entries;
}

function matches(entry: AcceptEntry, candidate: ProducedRepresentation) {
  if (entry.type === "*/*") return true;
  if (entry.type.endsWith("/*"))
    return candidate.startsWith(entry.type.slice(0, -1));
  return entry.type === candidate;
}

export function preferredRepresentation(
  header: string | null,
): ProducedRepresentation | null {
  if (header === null || header.trim().length === 0) return "text/html";
  const entries = parseAccept(header);
  if (entries.length === 0) return "text/html";

  let bestType: ProducedRepresentation | null = null;
  let bestQuality = -1;
  let bestPosition = Number.POSITIVE_INFINITY;

  for (const candidate of PRODUCED_REPRESENTATIONS) {
    let matched: AcceptEntry | undefined;
    let matchedPosition = Number.POSITIVE_INFINITY;
    entries.forEach((entry, position) => {
      if (!matches(entry, candidate)) return;
      if (
        matched === undefined ||
        entry.specificity > matched.specificity ||
        (entry.specificity === matched.specificity &&
          position < matchedPosition)
      ) {
        matched = entry;
        matchedPosition = position;
      }
    });
    if (matched === undefined || matched.quality <= 0) continue;
    if (
      matched.quality > bestQuality ||
      (matched.quality === bestQuality && matchedPosition < bestPosition)
    ) {
      bestType = candidate;
      bestQuality = matched.quality;
      bestPosition = matchedPosition;
    }
  }

  return bestType;
}

export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get("Vary");
  if (existing === null || existing.trim().length === 0) {
    headers.set("Vary", "Accept");
    return;
  }
  const varies = existing.split(",").map((value) => value.trim().toLowerCase());
  if (!varies.includes("accept")) headers.set("Vary", `${existing}, Accept`);
}
