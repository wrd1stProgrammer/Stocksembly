import { describe, expect, it } from "vitest";
import { questionLookupPlan } from "./questionLookupPlan";

describe("question lookup plan", () => {
  it("keeps report interpretation questions inside the published report", () => {
    // Given
    const question = {
      en: "What is the strongest counterargument to this conclusion?",
      ko: "이 결론에 대한 가장 강한 반론은 무엇인가요?",
    };

    // When
    const plan = questionLookupPlan(question);

    // Then
    expect(plan).toEqual({ mode: "report_only", useMarketApi: false });
  });

  it("does not mistake a target-price question for a live quote request", () => {
    const plan = questionLookupPlan({
      en: "Did the filing support a new price target?",
      ko: "공시가 새로운 목표주가를 뒷받침했나요?",
    });

    expect(plan).toEqual({ mode: "report_only", useMarketApi: false });
  });

  it("routes current market and latest-news questions to external lookup", () => {
    // Given
    const question = {
      en: "Check the current price and the latest news released today.",
      ko: "현재가와 오늘 나온 최신 뉴스를 확인해줘.",
    };

    // When
    const plan = questionLookupPlan(question);

    // Then
    expect(plan).toEqual({ mode: "external", useMarketApi: true });
  });

  it("recognizes a ticker name between the current qualifier and stock price", () => {
    const plan = questionLookupPlan({
      en: "Check the current Microsoft stock price.",
      ko: "현재 마이크로소프트 주가를 확인해줘.",
    });

    expect(plan).toEqual({ mode: "external", useMarketApi: true });
  });

  it("uses web lookup without a market API call for a latest-news question", () => {
    // Given
    const question = {
      en: "What is the latest company announcement since this report?",
      ko: "이 리포트 이후 나온 최신 회사 발표가 뭐야?",
    };

    // When
    const plan = questionLookupPlan(question);

    // Then
    expect(plan).toEqual({ mode: "external", useMarketApi: false });
  });
});
