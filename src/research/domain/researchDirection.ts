export const RESEARCH_DIRECTION_MAX_CHARACTERS = 100;

export function normalizeResearchDirection(value: string): string | undefined {
  const normalized = value.trim().replace(/\s+/gu, " ");
  const characters = Array.from(normalized);
  const meaningful = /[\p{L}\p{N}]/u.test(normalized);
  const varied = new Set(characters.map((character) => character.toLowerCase()))
    .size;
  if (
    characters.length < 2 ||
    characters.length > RESEARCH_DIRECTION_MAX_CHARACTERS ||
    !meaningful ||
    varied < 2
  )
    return undefined;
  return normalized;
}
