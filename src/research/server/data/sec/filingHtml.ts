import { load } from "cheerio";

export type FilingHtmlNormalization =
  | {
      readonly kind: "normalized";
      readonly text: string;
      readonly byteLength: number;
      readonly truncated: false;
    }
  | { readonly kind: "malformed_html" }
  | {
      readonly kind: "normalized_too_large";
      readonly byteLength: number;
      readonly limitBytes: number;
      readonly truncated: true;
    };

export function normalizeFilingHtml(
  bytes: Uint8Array,
  limitBytes: number,
): FilingHtmlNormalization {
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return { kind: "malformed_html" };
    throw error;
  }
  if (html.trim().length === 0 || !/<(?:html|body)\b/i.test(html))
    return { kind: "malformed_html" };
  const document = load(html);
  document(
    "script,style,form,noscript,template,head,input,button,select,textarea",
  ).remove();
  document(
    "[hidden],[aria-hidden='true'],[aria-hidden='TRUE'],[style*='display:none'],[style*='display: none'],[style*='visibility:hidden'],[style*='visibility: hidden']",
  ).remove();
  const text = document("body").text().replace(/\s+/g, " ").trim();
  if (text.length === 0) return { kind: "malformed_html" };
  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > limitBytes)
    return {
      kind: "normalized_too_large",
      byteLength,
      limitBytes,
      truncated: true,
    };
  return { kind: "normalized", text, byteLength, truncated: false };
}
