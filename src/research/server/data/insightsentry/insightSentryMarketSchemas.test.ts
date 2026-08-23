import { expect, it } from "vitest";
import { QuoteResponseSchema } from "./insightSentryMarketSchemas";

it("accepts provider quote metadata when required quote fields remain valid", () => {
  // Given
  const payload = {
    last_update: 1_787_538_600_000,
    _ct: 1_787_538_600_000,
    total_items: 1,
    data: [
      {
        code: "NASDAQ:MRNA",
        status: "CLOSED",
        lp_time: 1_787_538_600,
        last_price: 32.47,
        currency_code: "USD",
      },
    ],
  };

  // When
  const result = QuoteResponseSchema.safeParse(payload);

  // Then
  expect(result.success).toBe(true);
});
