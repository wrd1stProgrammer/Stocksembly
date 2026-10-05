/** Return only an unambiguous, same-origin absolute path. */
export function safeDestination(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  if (
    [...value].some(
      (character) =>
        character === "\\" ||
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127,
    ) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|20|5c|7f)/iu.test(value)
  )
    return "/";
  try {
    const base = "https://stocksembly.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
