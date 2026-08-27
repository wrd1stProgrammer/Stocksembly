import type { AppLocale } from "../../lib/i18n";
import type { AgentId, AgentProfile } from "../../research/types";

type AgentUiOverrides = Readonly<
  Partial<Record<Exclude<AppLocale, "en" | "ko">, string>>
>;

const names: Readonly<Record<AgentId, AgentUiOverrides>> = {
  market: { ja: "マヤ", "zh-TW": "瑪雅" },
  market_news: { ja: "ジューン", "zh-TW": "朱恩" },
  benchmark: { ja: "アレックス", "zh-TW": "亞歷克斯" },
  company: { ja: "イーサン", "zh-TW": "伊森" },
  company_product: { ja: "アリア", "zh-TW": "艾莉亞" },
  company_competition: { ja: "レオ", "zh-TW": "里奧" },
  financial: { ja: "ノア", "zh-TW": "諾亞" },
  valuation: { ja: "ソフィア", "zh-TW": "蘇菲亞" },
  financial_quality: { ja: "ハナ", "zh-TW": "哈娜" },
  risk: { ja: "リアム", "zh-TW": "利亞姆" },
  risk_policy: { ja: "ミン", "zh-TW": "敏" },
  chair: { ja: "パク議長", "zh-TW": "朴議長" },
};

const roles: Readonly<Record<AgentId, AgentUiOverrides>> = {
  market: { ja: "市場分析責任者", "zh-TW": "市場分析負責人" },
  market_news: { ja: "テクニカルアナリスト", "zh-TW": "技術分析師" },
  benchmark: {
    ja: "ベンチマーク・クロスアセット分析",
    "zh-TW": "基準與跨資產分析師",
  },
  company: { ja: "企業分析責任者", "zh-TW": "企業分析負責人" },
  company_product: { ja: "製品アナリスト", "zh-TW": "產品分析師" },
  company_competition: { ja: "競合分析", "zh-TW": "競爭情報分析" },
  financial: { ja: "財務分析責任者", "zh-TW": "財務分析負責人" },
  valuation: { ja: "バリュエーション分析", "zh-TW": "估值分析師" },
  financial_quality: { ja: "利益の質分析", "zh-TW": "盈餘品質分析" },
  risk: { ja: "リスク分析責任者", "zh-TW": "風險分析負責人" },
  risk_policy: { ja: "政策・シナリオ分析", "zh-TW": "政策與情境分析" },
  chair: { ja: "リサーチ議長", "zh-TW": "研究議長" },
};

export function agentUiName(profile: AgentProfile, locale: AppLocale): string {
  if (locale === "ko" || locale === "en") return profile.name[locale];
  return names[profile.id][locale] ?? profile.name.en;
}

export function agentUiRole(profile: AgentProfile, locale: AppLocale): string {
  if (locale === "ko" || locale === "en") return profile.role[locale];
  return roles[profile.id][locale] ?? profile.role.en;
}
