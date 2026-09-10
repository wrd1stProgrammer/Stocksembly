function authenticationDiagnostic(text: string): boolean {
  return /\b(?:refresh_token_(?:reused|expired|invalid|revoked)|invalid_api_key|authentication_error|not authenticated|not logged in|invalid api key|incorrect api key|authentication (?:failed|required)|(?:log(?:ged)?[ -]?in|sign[ -]?in) (?:required|again)|please (?:log[ -]?in|sign[ -]?in))\b|\b(?:access|refresh|authentication|auth) token\b[^\n]{0,100}\b(?:expired|revoked|invalid|already (?:been )?used)\b|\b(?:unexpected status|status(?: code)?|HTTP(?:\/\d(?:\.\d)?)?)[: =]+401\b/iu.test(
    text,
  );
}

function errorEventText(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("type" in value)) return undefined;
  if (value.type === "error" || value.type === "turn.failed")
    return JSON.stringify(value);
  if (
    (value.type === "item.completed" || value.type === "item.started") &&
    "item" in value &&
    typeof value.item === "object" &&
    value.item !== null &&
    "type" in value.item &&
    value.item.type === "error"
  )
    return JSON.stringify(value.item);
  return undefined;
}

export function codexStdoutAuthenticationFailure(text: string): boolean {
  return text.split("\n").some((line) => {
    try {
      const value: unknown = JSON.parse(line);
      const diagnostic = errorEventText(value);
      return diagnostic !== undefined && authenticationDiagnostic(diagnostic);
    } catch {
      return (
        /^\s*(?:error:|ERROR\b)/u.test(line) && authenticationDiagnostic(line)
      );
    }
  });
}

/** Keeps only a bounded diagnostic tail in memory; no stderr content leaves the process boundary. */
export class CodexStderrAuthenticationDetector {
  private tail = "";
  private detected = false;

  feed(chunk: Uint8Array): void {
    if (this.detected) return;
    this.tail = (this.tail + Buffer.from(chunk).toString("utf8")).slice(
      -16_384,
    );
    this.detected = authenticationDiagnostic(this.tail);
  }

  get failed(): boolean {
    return this.detected;
  }
}
