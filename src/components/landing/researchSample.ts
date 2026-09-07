import type { ResearchFileData } from "../../research/compositions/types";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  SourceIdSchema,
} from "../../research/domain/ids";
import type { ResearchCompany } from "../../research/types";

// Published, publicly accessible report snapshot. Captured 2026-09-07.
export const researchSample: {
  readonly reportId: string;
  readonly company: ResearchCompany;
  readonly file: ResearchFileData;
  readonly version: number;
  readonly publishedAt: string;
} = {
  reportId: "a175c536-7da9-4c35-9f5f-c525d0f2f8de",
  company: {
    symbol: "NVDA",
    company: "NVIDIA Corporation",
    exchange: "NASDAQ",
    sector: "Semiconductors",
    price: "$214.72",
    change: "-0.98%",
    marketStatus: {
      en: "Published community research",
      ko: "공개 리서치룸 발행본",
    },
  },
  file: {
    presentationVersion: "workflow-v2",
    structuredEditorial: {
      decision: {
        stance: "wait_for_proof",
        confidence: "medium",
        decisiveReason: {
          en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it.",
          ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다.",
        },
        strongestCountercase: {
          en: "Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
          ko: "재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
        },
        falsifier: {
          en: "The view would be falsified if NVIDIA closes above $222.28 and outperforms the qualified peer median over the next two to four reporting periods without a material volume deterioration.",
          ko: "향후 2~4개 보고기간 동안 엔비디아가 222.28달러 위에서 마감하고 거래량 악화 없이 적격 peer 중앙값을 상회하면 이 판단은 무효화된다.",
        },
        primaryClaimIds: [
          ClaimIdSchema.parse("5905c8bb-e270-464a-8b41-8318dd4b6e46"),
        ],
      },
      claims: [
        {
          claimId: ClaimIdSchema.parse("5905c8bb-e270-464a-8b41-8318dd4b6e46"),
          decisionDimension: "relative_performance",
          roleOwner: "benchmark",
          stanceContribution: "uncertain",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it.",
            ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23"),
            ArtifactIdSchema.parse("d3b33079-fc88-4631-89f4-ae8a455d2a9b"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_quote.last_price:1",
            "insightsentry:provider_quote.change_percent:2",
          ],
          falsifier: {
            en: "The view would be falsified if NVIDIA closes above $222.28 and outperforms the qualified peer median over the next two to four reporting periods without a material volume deterioration.",
            ko: "향후 2~4개 보고기간 동안 엔비디아가 222.28달러 위에서 마감하고 거래량 악화 없이 적격 peer 중앙값을 상회하면 이 판단은 무효화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("bf707cb0-3847-44e9-88d7-d7f410a23d2d"),
          decisionDimension: "relative_performance",
          roleOwner: "benchmark",
          stanceContribution: "opposes",
          materiality: "supporting",
          publicThesis: {
            en: "NVIDIA’s operating quality can support a premium, but its valuation leaves less room for relative underperformance: the qualified peer median P/E is 12.7x versus NVIDIA at 32.9x, a 158.5% premium. For a medium-horizon new entry, waiting for earnings confirmation is better supported than assuming further multiple expansion.",
            ko: "엔비디아의 높은 운영 품질은 프리미엄을 정당화할 수 있지만 상대적 부진을 흡수할 여지는 작다. 적격 peer 중앙 P/E는 12.7배인데 엔비디아는 32.9배로 158.5% 프리미엄이다. 중기 신규 진입에서는 추가 멀티플 확장보다 실적 확인을 기다리는 쪽이 더 타당하다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("d3b33079-fc88-4631-89f4-ae8a455d2a9b"),
            ArtifactIdSchema.parse("12dc855b-3d25-4d75-9568-d24471af8b4e"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_quote.last_price:1",
            "insightsentry:provider_fundamental.earnings_per_share_diluted_ttm.value:11",
            "insightsentry:provider_fundamental.eps_estimate_ntm.value:12",
          ],
          falsifier: {
            en: "The valuation objection would be weakened if the August 26 earnings report materially exceeds the $2.0877 EPS forecast, sustains forward EPS growth, and the stock regains $227.92 with peer-relative outperformance.",
            ko: "8월 26일 실적이 EPS 전망치 2.0877달러를 크게 상회하고 선행 EPS 성장세를 유지하면서 주가가 227.92달러를 회복하고 peer 대비 초과성과를 보이면 밸류에이션 우려는 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("443bf1e3-b5f0-499e-89da-120159afa58a"),
          decisionDimension: "growth_engine",
          roleOwner: "company",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s growth engine is increasingly full-stack AI infrastructure: Compute & Networking generated roughly $193.5 billion of FY2025 revenue, while the Portsmouth agreement secured approximately 4.25 gigawatts of future OpenAI AI-factory capacity, with optional support for another 3.8 gigawatts. This supports the growth case only if capacity becomes operational and customer deployment converts into recognized demand over the next several reporting periods.",
            ko: "NVIDIA의 성장 엔진은 풀스택 AI 인프라로 이동하고 있습니다. Compute & Networking은 FY2025 매출 약 1,935억 달러를 창출했고, Portsmouth 계약은 OpenAI의 약 4.25GW AI 팩토리 용량과 추가 3.8GW 선택권을 확보했습니다. 다만 향후 몇 개 분기 동안 실제 가동과 고객 배치가 매출로 전환되어야 성장 가설이 유지됩니다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.revenue_seg_by_business_h.value.0.segments.0.value:26",
            "insightsentry:provider_fundamental.revenue_estimate_ntm.value:23",
            "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
          ],
          falsifier: {
            en: "The thesis weakens materially if the next two to four reports show revenue below the approximately $92.1 billion next-quarter forecast, declining Compute & Networking growth, or delayed/cancelled Portsmouth readiness without replacement demand.",
            ko: "향후 2~4개 보고서에서 매출이 약 921억 달러의 다음 분기 전망을 하회하거나 Compute & Networking 성장률이 둔화되고, Portsmouth 가동이 지연·취소되며 대체 수요가 없으면 가설은 크게 약화됩니다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("de96d7bb-1322-4e18-8e3a-d96ca8863db2"),
          decisionDimension: "growth_engine",
          roleOwner: "company",
          stanceContribution: "supports",
          materiality: "supporting",
          publicThesis: {
            en: "Management is reinforcing commercial execution and ecosystem reach: NVIDIA appointed a former Microsoft worldwide-sales executive to lead field operations, while reported TTM free cash flow of about $119.1 billion and cash plus short-term investments of about $80.6 billion provide capacity to fund platform expansion. For a new entry, this supports waiting for execution confirmation rather than paying solely for the narrative.",
            ko: "경영진은 상업적 실행력과 생태계 확장을 강화하고 있습니다. NVIDIA는 전 Microsoft 글로벌 영업 임원을 필드 운영 책임자로 영입했고, 약 1,191억 달러의 TTM 잉여현금흐름과 약 806억 달러의 현금·단기투자자산이 플랫폼 확장 재원을 제공합니다. 신규 진입자는 서사만으로 추격하기보다 실행 확인을 기다리는 편이 타당합니다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("09bbad1e-2de3-46bf-8956-deb869e87c49"),
            ArtifactIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.free_cash_flow_ttm.value:14",
            "insightsentry:provider_fundamental.cash_n_short_term_invest_fq.value:6",
            "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
          ],
          falsifier: {
            en: "This supporting case fails if cash generation deteriorates while infrastructure commitments rise, or if the next earnings report misses the approximately $2.09 EPS forecast and management reduces forward capacity or demand commentary.",
            ko: "인프라 약정이 늘어나는 동안 현금창출력이 악화되거나, 다음 실적이 약 2.09달러 EPS 전망을 하회하고 경영진이 향후 생산능력·수요 전망을 낮추면 이 보조 가설은 무너집니다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("816ced2a-1d24-4b93-87bb-d67b4845f648"),
          decisionDimension: "moat",
          roleOwner: "company_competition",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s moat is a full-stack ecosystem: CUDA, integrated GPUs, networking, and AI-factory software reduce switching friction and make deployment-scale substitution difficult; for a new entry, wait for the next two to four reports to confirm that major customer deployments continue adopting the stack without margin compression.",
            ko: "NVIDIA의 해자는 CUDA, 통합 GPU·네트워킹·AI 팩토리 소프트웨어로 구성된 풀스택 생태계이며, 전환 마찰을 낮추고 대규모 배포에서 대체를 어렵게 만든다. 신규 진입자는 향후 2~4개 보고서에서 주요 고객의 스택 채택이 마진 훼손 없이 지속되는지 확인해야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
            ArtifactIdSchema.parse("09bbad1e-2de3-46bf-8956-deb869e87c49"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [],
          falsifier: {
            en: "The moat would be weakened if, across the next two to four filings, major deployments increasingly use competing accelerators or customer-specific silicon while NVIDIA’s data-center economics and software adoption deteriorate.",
            ko: "향후 2~4개 공시에서 주요 배포가 경쟁 가속기나 고객 맞춤형 실리콘으로 이동하고 NVIDIA의 데이터센터 경제성과 소프트웨어 채택이 악화되면 해자 주장은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("e8f91311-ec22-4935-87cd-8160c9bbe4cc"),
          decisionDimension: "competitive_erosion",
          roleOwner: "company_competition",
          stanceContribution: "supports",
          materiality: "supporting",
          publicThesis: {
            en: "Competitive erosion is credible through hyperscaler silicon, AMD and other accelerators, and customer-funded infrastructure: NVIDIA’s $105 billion capped residual-value guarantees for an OpenAI campus show that ecosystem expansion can also create counterparty and utilization dependence; monitor whether committed capacity becomes revenue-generating rather than merely guaranteed.",
            ko: "경쟁 침식은 하이퍼스케일러 자체 실리콘, AMD 등 경쟁 가속기, 고객 자금 의존 인프라를 통해 현실화될 수 있다. OpenAI 캠퍼스에 대한 NVIDIA의 최대 1,050억 달러 잔존가치 보증은 생태계 확장이 거래상대방과 가동률 의존도도 높일 수 있음을 보여준다. 약정 용량이 단순 보증을 넘어 실제 매출로 전환되는지 확인해야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("4bd08389-c9f2-4eae-88e8-1da4b8bea3ea"),
            ArtifactIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [],
          falsifier: {
            en: "The erosion path is confirmed if subsequent filings disclose material guarantee payments, delayed ready-for-service milestones beginning in 2028, customer migration to non-NVIDIA systems, or falling software/platform adoption despite continued infrastructure spending.",
            ko: "후속 공시에서 보증금의 중대한 지급, 2028년부터 예정된 서비스 개시 지연, 고객의 비NVIDIA 시스템 전환, 인프라 지출 지속에도 소프트웨어·플랫폼 채택 감소가 나타나면 경쟁 침식 경로가 확인된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("83f2a070-8d63-4e62-8e11-73b51280d3bf"),
          decisionDimension: "moat",
          roleOwner: "company_competition",
          stanceContribution: "uncertain",
          materiality: "supporting",
          publicThesis: {
            en: "The next moat milestone is verified production adoption: NVIDIA must show that large AI-factory commitments translate into deployed, revenue-producing systems and sustained use of its software stack by the next two to four reporting periods.",
            ko: "다음 해자 검증 milestone은 실제 생산 채택이다. NVIDIA는 향후 2~4개 보고기간 내 대형 AI 팩토리 약정이 배포·매출 창출 시스템과 지속적인 소프트웨어 스택 사용으로 전환됨을 보여줘야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("4bd08389-c9f2-4eae-88e8-1da4b8bea3ea"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_earnings.next_eps_forecast:94",
          ],
          falsifier: {
            en: "This milestone fails if the next two to four filings do not disclose increasing deployed capacity, customer utilization, software adoption, or revenue contribution from the committed AI-factory infrastructure.",
            ko: "향후 2~4개 공시에서 약정 AI 팩토리 인프라의 배포 용량, 고객 가동률, 소프트웨어 채택 또는 매출 기여 증가가 공개되지 않으면 milestone은 실패한다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("5538f340-5e42-47bd-81d0-3bab409d152f"),
          decisionDimension: "adoption",
          roleOwner: "company_product",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA has secured a concrete production deployment path: OpenAI is contracted as tenant for approximately 4.25GW of IT load at the Portsmouth campus to deploy NVIDIA’s full-stack DSX AI factory platform, with service conditions expected from 2028. For a new entry, wait for construction and tenant-payment milestones to convert announced capacity into demonstrated utilization.",
            ko: "NVIDIA는 OpenAI를 임차인으로 확보하고 약 4.25GW IT 부하 규모의 Portsmouth 캠퍼스에서 NVIDIA의 풀스택 DSX AI 팩토리 플랫폼을 배치하는 구체적인 생산 배포 경로를 확보했다. 다만 서비스 개시 조건은 2028년부터 예상되므로, 신규 진입자는 건설 및 임차인 지급 마일스톤을 확인해 발표된 용량이 실제 사용으로 전환되는지 기다려야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [],
          falsifier: {
            en: "The thesis weakens if the 2028 ready-for-service milestone slips materially, OpenAI does not begin paying for the contracted capacity, or subsequent filings show the DSX deployment is reduced below the approximately 4.25GW commitment.",
            ko: "2028년 서비스 준비 마일스톤이 크게 지연되거나 OpenAI가 계약 용량에 대한 지급을 시작하지 않거나 후속 공시에서 DSX 배치가 약 4.25GW 약정 이하로 축소되면 이 주장은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("609eefdf-a178-4c98-8444-79f196d07dfa"),
          decisionDimension: "adoption",
          roleOwner: "company_product",
          stanceContribution: "supports",
          materiality: "supporting",
          publicThesis: {
            en: "Current economics show that AI adoption is already monetizing at exceptional scale: NVIDIA reports $253.5 billion of TTM revenue, $119.1 billion of TTM free cash flow, and 74.1% TTM gross margin. This supports valuation tolerance only if the next two to four reports sustain revenue expansion without a sharp margin or cash-conversion reversal.",
            ko: "현재 경제성은 AI 채택이 이미 예외적인 규모로 수익화되고 있음을 보여준다. NVIDIA의 TTM 매출은 2,535억 달러, TTM 잉여현금흐름은 1,190.8억 달러, TTM 매출총이익률은 74.1%다. 향후 2~4개 분기 동안 매출 증가가 지속되고 마진이나 현금전환이 급격히 악화되지 않는 경우에만 높은 밸류에이션을 용인할 수 있다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("09bbad1e-2de3-46bf-8956-deb869e87c49"),
            ArtifactIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.total_revenue_ttm.value:35",
            "insightsentry:provider_fundamental.free_cash_flow_ttm.value:14",
            "insightsentry:provider_fundamental.gross_margin_ttm.value:16",
          ],
          falsifier: {
            en: "The thesis weakens if TTM free-cash-flow growth stalls for two consecutive reporting periods, gross margin falls materially below 70%, or reported revenue misses the next-quarter forecast and management lowers the following outlook.",
            ko: "TTM 잉여현금흐름 증가가 2개 연속 보고기간 동안 정체되거나 매출총이익률이 70% 아래로 크게 하락하거나 다음 분기 매출이 전망을 하회하고 경영진이 후속 전망을 낮추면 이 주장은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("8730d876-da78-468c-86c0-9cd5a7dbd8e3"),
          decisionDimension: "margin",
          roleOwner: "financial",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s margin structure currently supports premium economics: operating margin rose from 54.1% in FY2024 to 60.4% in FY2026 and reached 65.6% in the latest quarter, although the medium-term valuation case requires this durability to persist.",
            ko: "NVIDIA의 마진 구조는 현재 프리미엄 경제성을 뒷받침한다. 영업이익률은 FY2024 54.1%에서 FY2026 60.4%로 상승했고 최근 분기 65.6%에 도달했지만, 밸류에이션 정당화에는 이러한 지속성이 필요하다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("9aa52720-3781-4d46-8b61-238500ec73c3"),
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "operating_margin_annual:FY:2024-01-28",
            "operating_margin_annual:FY:2026-01-25",
            "operating_margin_quarter:Q:2026-04-26",
          ],
          falsifier: {
            en: "The margin thesis weakens materially if operating margin falls below 55% for two consecutive reported quarters or gross-margin compression exceeds five percentage points year over year.",
            ko: "영업이익률이 두 개의 연속 공시 분기에서 55% 아래로 하락하거나 매출총이익률이 전년 대비 5%포인트 이상 하락하면 마진 가설은 크게 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("7effe5c1-9ce3-43b5-832d-259a99cf0025"),
          decisionDimension: "reinvestment",
          roleOwner: "financial",
          stanceContribution: "supports",
          materiality: "supporting",
          publicThesis: {
            en: "Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
            ko: "재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
            ArtifactIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
            ArtifactIdSchema.parse("2e0ca83a-c3e0-4a02-9ba6-2be04f82a548"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "sec:us-gaap:NetCashProvidedByUsedInOperatingActivities:USD:0001045810-26-000052:2026-01-26:2026-04-26:15507",
            "insightsentry:provider_fundamental.free_cash_flow_fq.value:13",
            "insightsentry:provider_fundamental.capital_expenditures_fq.value:4",
          ],
          falsifier: {
            en: "The reinvestment thesis weakens if quarterly free-cash-flow conversion remains below 80% of operating cash flow for two quarters while contractual guarantees become probable or require material cash payments.",
            ko: "분기 잉여현금흐름 전환율이 두 분기 연속 영업현금흐름의 80% 아래에 머물고 계약상 보증의 지급 가능성이 높아지거나 상당한 현금 지급이 발생하면 재투자 가설은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("cedc1548-2a5a-4649-805d-775761ac0f8b"),
          decisionDimension: "cash_conversion",
          roleOwner: "financial_quality",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s reported earnings continue to convert into substantial cash, but conversion has weakened: FY2026 operating cash flow was 85.6% of net income and Q1 FY2027 was 86.3%, so valuation support depends on sustaining cash generation rather than accounting earnings alone.",
            ko: "NVIDIA의 보고 이익은 여전히 상당한 현금으로 전환되지만 전환율은 약화됐다. FY2026 영업현금흐름은 순이익의 85.6%, FY2027 1분기는 86.3%였으므로 밸류에이션은 회계이익보다 지속적인 현금창출에 달려 있다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("9aa52720-3781-4d46-8b61-238500ec73c3"),
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "cash_conversion_annual:FY:2026-01-25",
            "cash_conversion_quarter:Q:2026-04-26",
          ],
          falsifier: {
            en: "The thesis weakens if operating cash flow remains below 80% of net income for two consecutive quarters or if receivables and inventory grow materially faster than revenue without a corresponding cash-flow recovery.",
            ko: "두 분기 연속 영업현금흐름이 순이익의 80%를 밑돌거나, 현금흐름 회복 없이 매출채권과 재고가 매출보다 크게 빠르게 증가하면 이 주장은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("16638dcb-30ff-488e-81c2-861356dc1da8"),
          decisionDimension: "cash_conversion",
          roleOwner: "financial_quality",
          stanceContribution: "uncertain",
          materiality: "supporting",
          publicThesis: {
            en: "Balance-sheet liquidity is strong, but working-capital intensity and dilution require monitoring: Q1 FY2027 cash flow was $50.3B versus $48.6B of provider-reported free cash flow, while quarterly diluted shares declined modestly and stock compensation remained material.",
            ko: "대차대조표 유동성은 강하지만 운전자본 부담과 희석을 점검해야 한다. FY2027 1분기 현금흐름은 503억 달러, 제공업체 기준 잉여현금흐름은 486억 달러였고, 희석주식수는 소폭 감소했지만 주식보상은 여전히 중요하다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
            ArtifactIdSchema.parse("2e0ca83a-c3e0-4a02-9ba6-2be04f82a548"),
            ArtifactIdSchema.parse("9dca57b0-e4a8-42b6-bdd9-c3737c835298"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.free_cash_flow_fq.value:13",
            "insightsentry:provider_fundamental.accounts_receivables_net_fq.value:36",
            "insightsentry:provider_fundamental.diluted_shares_outstanding_fq.value:8",
          ],
          falsifier: {
            en: "The concern is confirmed if accounts receivable rises above 20% of quarterly revenue for two reporting periods, free cash flow falls below 75% of operating cash flow, or diluted shares reverse into sustained year-over-year growth above 3%.",
            ko: "매출채권이 두 보고기간 연속 분기 매출의 20%를 넘거나, 잉여현금흐름이 영업현금흐름의 75% 아래로 하락하거나, 희석주식수가 3%를 넘는 지속적인 전년 대비 증가로 전환되면 우려가 확인된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("303e5a0f-da6f-402e-83d7-10cd5be1faf0"),
          decisionDimension: "regime",
          roleOwner: "market",
          stanceContribution: "uncertain",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s price regime is conflicted: daily trend remains above its 20-, 50-, and 200-day averages, but hourly momentum is bearish and price sits near $214.50 support. For a new entry, wait for a close above $220.65 with volume confirmation; a break below $212.87 would weaken the market view.",
            ko: "엔비디아의 가격 국면은 혼조다. 일간 가격은 20·50·200일 이동평균 위에 있지만 시간봉 모멘텀은 약세이며 약 214.50달러 지지선에 있다. 신규 진입은 거래량 동반 220.65달러 상회 확인을 기다리고, 212.87달러 하회는 시장 견해를 약화시키는 신호다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("d3d53578-3ad1-487b-838f-8e4e8b59a65b"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: ["insightsentry:provider_quote.last_price:1"],
          falsifier: {
            en: "A sustained close below $212.87, especially with volume above the 20-period average, would invalidate the constructive price-regime view.",
            ko: "20기간 평균을 웃도는 거래량과 함께 212.87달러 아래에서 지속 종가가 형성되면 긍정적 가격 국면 견해가 무효화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("f1830d55-90e8-49a6-860e-06fd66671a0e"),
          decisionDimension: "regime",
          roleOwner: "market",
          stanceContribution: "opposes",
          materiality: "supporting",
          publicThesis: {
            en: "The macro backdrop is a valuation headwind rather than a demand collapse: the 10-year Treasury yield was 4.74%, core CPI continued rising through June, and wages increased to $37.64 per hour. Higher discount rates and sticky service costs leave less tolerance for NVIDIA’s premium multiple.",
            ko: "거시 환경은 수요 붕괴보다 밸류에이션 역풍에 가깝다. 10년물 국채금리는 4.74%였고 근원 CPI는 6월까지 상승했으며 시간당 임금은 37.64달러로 올랐다. 높은 할인율과 끈적한 비용은 엔비디아의 프리미엄 멀티플 허용도를 낮춘다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("2093ee05-1a4f-4363-8e36-9c6a93572708"),
            ArtifactIdSchema.parse("0d93a3fc-9b45-48a2-b48e-ceedb5146290"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.eps_estimate_ntm.value:12",
          ],
          falsifier: {
            en: "A sustained decline in the 10-year yield below 4.25% alongside easing core CPI would remove this valuation headwind.",
            ko: "10년물 금리가 4.25% 아래로 지속 하락하고 근원 CPI도 둔화되면 이 밸류에이션 역풍은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("a647bbc8-3518-4739-8383-aad5a49fa0ac"),
          decisionDimension: "catalyst",
          roleOwner: "market",
          stanceContribution: "uncertain",
          materiality: "supporting",
          publicThesis: {
            en: "The decisive near-term catalyst is NVIDIA’s August 26 earnings release. A bullish market confirmation requires upside to the $92.06 billion next-quarter revenue forecast and constructive China commentary, followed by a break above $220.65; failure to hold $214.50 after the release would signal that expectations remain too high.",
            ko: "가장 중요한 단기 촉매는 8월 26일 실적 발표다. 강세 확인에는 920.6억 달러의 다음 분기 매출 전망 상회와 긍정적인 중국 관련 발언, 그리고 220.65달러 돌파가 필요하다. 발표 후 214.50달러를 지키지 못하면 기대치가 과도하다는 신호다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23"),
            ArtifactIdSchema.parse("d3d53578-3ad1-487b-838f-8e4e8b59a65b"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
            "insightsentry:provider_earnings.next_eps_forecast:94",
          ],
          falsifier: {
            en: "An earnings reaction that exceeds guidance, holds above $220.65 on above-average volume, and sustains the move for several sessions would falsify the wait-for-confirmation stance.",
            ko: "실적 발표 후 가이던스를 웃돌고 평균 이상 거래량으로 220.65달러 위를 유지하며 수 거래일 상승이 지속되면 확인 대기 관점은 무효화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("090cbb1d-b08d-4230-84b3-cf82e4c74e3e"),
          decisionDimension: "timing",
          roleOwner: "market_news",
          stanceContribution: "uncertain",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s medium-term structure is mixed: price at $214.72 sits near $214.50 support, below the 1-hour 20/50-hour averages and the 4-hour 20-period average, while remaining above the 4-hour 50-period and daily 20/50-period averages; the August 26 earnings release is the next decisive catalyst. A sustained break below $211.45–$212.87 would weaken the constructive medium-term case, while a move above $227.92 would restore broader upside confirmation.",
            ko: "엔비디아의 중기 구조는 혼조세다. 주가는 $214.72로 $214.50 지지선 부근에 있으며 1시간 20·50기간 이동평균과 4시간 20기간 이동평균을 밑돌지만, 4시간 50기간 및 일간 20·50기간 이동평균은 웃돌고 있다. 8월 26일 실적 발표가 다음 핵심 촉매다. $211.45~$212.87 아래에서 지속 하락하면 중기 강세 논리가 약화되고, $227.92 상향 돌파는 broader 상승 확인 신호가 된다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
            ArtifactIdSchema.parse("2093ee05-1a4f-4363-8e36-9c6a93572708"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: ["insightsentry:provider_quote.last_price:1"],
          falsifier: {
            en: "This timing assessment is falsified if NVDA closes above $227.92 with expanding volume and improving 4-hour momentum, or if it closes below $211.45 and fails to reclaim that level after earnings.",
            ko: "엔비디아가 거래량 증가와 4시간 모멘텀 개선을 동반해 $227.92 위에서 마감하거나, 실적 발표 후 $211.45 아래에서 마감하고 해당 수준을 회복하지 못하면 이 타이밍 판단은 무효화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("83b15a03-f7cb-44b1-8efd-27a6199bad69"),
          decisionDimension: "timing",
          roleOwner: "market_news",
          stanceContribution: "opposes",
          materiality: "supporting",
          publicThesis: {
            en: "Momentum and volume do not yet confirm a durable rebound: 1-hour RSI is 32.92 with negative MACD, while 4-hour RSI is 43.64, MACD is below its signal, and volume is only 0.57x its 20-period average; the recent close also fell 0.98% to $214.72. Confirmation would require recovery through $220.65–$227.92 on stronger volume, especially after the August 26 earnings event.",
            ko: "모멘텀과 거래량은 아직 지속적인 반등을 확인하지 않는다. 1시간 RSI는 32.92, MACD는 음수이고, 4시간 RSI는 43.64이며 MACD가 시그널 아래에 있고 거래량은 20기간 평균의 0.57배에 불과하다. 최근 종가는 0.98% 하락한 $214.72였다. 확인 신호는 8월 26일 실적 발표 이후 특히 거래량 증가와 함께 $220.65~$227.92를 회복하는 것이다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
            ArtifactIdSchema.parse("2093ee05-1a4f-4363-8e36-9c6a93572708"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_quote.last_price:1",
            "insightsentry:provider_quote.change_percent:2",
          ],
          falsifier: {
            en: "This momentum caution is falsified if 4-hour RSI rises above 50, MACD crosses above its signal, and volume exceeds its 20-period average while price holds above $220.65.",
            ko: "4시간 RSI가 50을 넘고 MACD가 시그널을 상향 돌파하며 거래량이 20기간 평균을 웃도는 동시에 주가가 $220.65 위를 유지하면 이 모멘텀 경계 판단은 무효화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("e1585c60-4e0e-4c1e-84ae-f5e3377a3adf"),
          decisionDimension: "downside_path",
          roleOwner: "risk",
          stanceContribution: "opposes",
          materiality: "material",
          publicThesis: {
            en: "The highest-impact downside is counterparty and infrastructure concentration: NVIDIA guaranteed up to $105 billion of residual lease value tied to OpenAI’s 4.25GW Ohio campus, so OpenAI default or project underperformance could transmit into large contingent payments, asset-reletting losses, and valuation compression despite NVIDIA’s net cash buffer; a new entry should wait for lease conditions, OpenAI payment performance, and disclosed exposure to become clearer.",
            ko: "가장 큰 하방 위험은 거래상대방 및 인프라 집중이다. NVIDIA는 OpenAI의 오하이오 4.25GW 캠퍼스와 연계된 최대 1,050억 달러의 잔존 임대가치를 보증했으므로, OpenAI의 채무불이행이나 프로젝트 부진은 순현금 완충에도 불구하고 대규모 우발지급, 재임대 손실, 밸류에이션 압박으로 전이될 수 있다. 신규 진입은 임대 조건, OpenAI 지급 이행, 관련 노출이 명확해질 때까지 기다리는 것이 합리적이다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("238374c7-411c-4542-822e-fa7732272be5"),
            ArtifactIdSchema.parse("53f3d25b-bc86-41cd-9ae2-ce8222c12867"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.net_debt_fq.value:17",
            "insightsentry:provider_fundamental.cash_n_short_term_invest_fq.value:6",
            "insightsentry:provider_fundamental.market_cap_basic.value:38",
          ],
          falsifier: {
            en: "The risk thesis weakens if the upcoming 10-Q shows the guarantees are substantially reduced or collateralized, OpenAI maintains payments and credit quality, and the Ohio campus reaches ready-for-service milestones without material NVIDIA cash outflows.",
            ko: "다음 10-Q에서 보증 규모가 크게 축소되거나 담보화되고, OpenAI가 지급 및 신용등급을 유지하며, 오하이오 캠퍼스가 NVIDIA의 유의미한 현금 유출 없이 ready-for-service 조건을 충족하면 이 위험 가설은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("3e2bc131-f2b7-44af-8b42-7498c3a0ba4d"),
          decisionDimension: "leading_indicator",
          roleOwner: "risk",
          stanceContribution: "supports",
          materiality: "supporting",
          publicThesis: {
            en: "The earliest measurable warning signal is the August 26 earnings release: a miss or weaker forward revenue outlook against the approximately $92.1 billion next-quarter forecast would indicate that AI infrastructure demand is not absorbing the company’s capacity and contingent commitments; investors should track revenue guidance, accounts receivable, inventory, and gross margin together.",
            ko: "가장 이른 측정 가능 경고 신호는 8월 26일 실적 발표다. 약 921억 달러의 다음 분기 매출 전망을 하회하거나 전망이 약화되면 AI 인프라 수요가 회사의 생산능력과 우발적 약정을 흡수하지 못한다는 신호가 될 수 있다. 매출 가이던스, 매출채권, 재고, 총마진을 함께 확인해야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            ArtifactIdSchema.parse("d3d53578-3ad1-487b-838f-8e4e8b59a65b"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
            "insightsentry:provider_fundamental.accounts_receivables_net_fq.value:36",
            "insightsentry:provider_fundamental.total_inventory_fq.value:48",
          ],
          falsifier: {
            en: "The warning signal is disproven if August 26 revenue guidance exceeds $92.1 billion, gross margin remains near current levels, and receivables and inventory grow no faster than revenue over the next two reporting periods.",
            ko: "8월 26일 매출 가이던스가 921억 달러를 상회하고, 총마진이 현재 수준에 가깝게 유지되며, 향후 두 번의 보고기간 동안 매출채권과 재고 증가율이 매출 증가율을 넘지 않으면 이 경고 신호는 반증된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("41da6711-15a7-4257-8490-1fd0f3d88b3e"),
          decisionDimension: "downside_path",
          roleOwner: "risk",
          stanceContribution: "opposes",
          materiality: "supporting",
          publicThesis: {
            en: "Valuation magnifies any operating disappointment: at $214.72 per share, NVIDIA trades at roughly 32.9 times trailing earnings versus a qualified peer median of 12.7 times, so a demand or margin reset can reduce both earnings and the multiple; the recovery condition is sustained revenue growth with gross margin near 70% or higher and no increase in contingent-liability disclosures.",
            ko: "밸류에이션은 영업 실망을 확대한다. 주당 214.72달러에서 NVIDIA의 최근 12개월 이익 배수는 약 32.9배로, 적격 peer 중앙값 12.7배보다 높다. 따라서 수요나 마진이 재설정되면 이익과 배수가 동시에 하락할 수 있다. 회복 조건은 매출 성장 지속, 70% 이상에 가까운 총마진, 우발부채 공시 증가 없음이다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_quote.last_price:1",
            "insightsentry:provider_fundamental.earnings_per_share_diluted_ttm.value:11",
            "insightsentry:provider_fundamental.gross_margin_ttm.value:16",
          ],
          falsifier: {
            en: "The valuation downside path weakens if the next two reporting periods deliver revenue above guidance, NTM EPS remains at or above $10.06, gross margin stays at least 70%, and the market continues valuing the shares above 30 times forward earnings.",
            ko: "향후 두 보고기간 동안 매출이 가이던스를 상회하고, NTM EPS가 10.06달러 이상을 유지하며, 총마진이 70% 이상이고, 시장이 주식을 선행 이익 30배 이상으로 계속 평가하면 이 밸류에이션 하방 경로는 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("1b6c8a66-c282-4ba5-8a66-c8addbb32333"),
          decisionDimension: "mitigant",
          roleOwner: "risk_policy",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA has substantial liquidity and contractual recovery rights that can absorb a policy or customer shock, but its new Portsmouth commitments create a contingent downside path: an OpenAI default could leave NVIDIA exposed to up to $105 billion of residual-value guarantees before reimbursement or asset recovery. For a new entry, require the upcoming 10-Q to quantify the guarantees and monitor OpenAI credit quality, lease readiness, and replacement-value coverage.",
            ko: "NVIDIA는 상당한 유동성과 계약상 회수권을 보유해 정책 또는 고객 충격을 흡수할 수 있지만, Portsmouth 약정은 새로운 하방 경로를 만든다. OpenAI가 채무불이행하면 상환 또는 자산 회수 전 NVIDIA가 최대 1,050억 달러의 잔존가치 보증에 노출될 수 있다. 신규 진입자는 다음 10-Q의 보증 규모, OpenAI 신용도, 임대 개시 조건 및 대체가치 보전 여부를 확인해야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            ArtifactIdSchema.parse("238374c7-411c-4542-822e-fa7732272be5"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [],
          falsifier: {
            en: "The next 10-Q shows no material increase in guarantee exposure, OpenAI obtains satisfactory credit quality, and lease-level replacement values cover obligations without NVIDIA cash outflow.",
            ko: "다음 10-Q에서 보증 노출이 중요하게 증가하지 않고 OpenAI의 신용도가 만족 기준을 충족하며, 임대별 대체가치가 NVIDIA의 현금 유출 없이 의무를 충당하면 이 주장은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("18f913d6-2377-4cea-8bc3-9301ee85f50b"),
          decisionDimension: "leading_indicator",
          roleOwner: "risk_policy",
          stanceContribution: "opposes",
          materiality: "supporting",
          publicThesis: {
            en: "The earliest policy warning signal is a formal expansion of U.S. export controls from physical-chip shipments to overseas cloud access; that would transmit through lost China-linked compute demand and a higher discount rate. NVIDIA already assumes no China data-center compute revenue in its near-term outlook, so the next decisive confirmation is whether regulators impose cloud-access restrictions or NVIDIA discloses incremental customer-screening costs.",
            ko: "가장 이른 정책 경고 신호는 미국 수출통제가 실물 칩 선적에서 해외 클라우드 접근으로 확대되는 것이다. 이는 중국 관련 컴퓨팅 수요 감소와 할인율 상승으로 전이된다. NVIDIA는 이미 단기 전망에서 중국 데이터센터 컴퓨팅 매출을 제외하고 있으므로, 다음 확인 지표는 규제당국의 클라우드 접근 제한 또는 NVIDIA가 공시하는 추가 고객심사 비용이다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("a892fbb7-15d8-4f23-b1bc-79c66e93336c"),
            ArtifactIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            ArtifactIdSchema.parse("53f3d25b-bc86-41cd-9ae2-ce8222c12867"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_earnings.next_eps_forecast:94",
          ],
          falsifier: {
            en: "Within the next two reporting periods, no cloud-access rule is adopted, China-exposed revenue remains immaterial, and customer-screening costs do not increase materially.",
            ko: "향후 두 번의 실적 발표 동안 클라우드 접근 규제가 도입되지 않고 중국 노출 매출이 중요하지 않으며 고객심사 비용도 유의미하게 증가하지 않으면 이 경로는 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("e753f502-22a7-469d-88be-ffb404d51243"),
          decisionDimension: "mitigant",
          roleOwner: "risk_policy",
          stanceContribution: "supports",
          materiality: "supporting",
          publicThesis: {
            en: "NVIDIA’s recovery capacity is strengthened by ecosystem expansion and executive commercial continuity: the company appointed a Microsoft veteran to lead worldwide field operations while pursuing large AI-campus commitments. Recovery from a policy or macro shock would be more credible if the next two to four reports preserve demand, margin, and cash generation while management converts capacity into diversified tenants and end markets.",
            ko: "NVIDIA는 생태계 확장과 영업 리더십 연속성으로 정책·거시 충격 이후 회복 역량을 높였다. Microsoft 출신 임원을 전세계 영업 책임자로 임명했고 대형 AI 캠퍼스 약정을 추진 중이다. 향후 2~4개 분기에서 수요·마진·현금창출을 유지하고 다양한 임차인과 최종시장으로 용량을 전환하면 회복 논리가 강화된다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
            ArtifactIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            ArtifactIdSchema.parse("31e71ecf-dc5c-45d9-aa6d-be9ad40ac8c6"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_earnings.eps_actual:93",
            "insightsentry:provider_earnings.next_eps_forecast:94",
          ],
          falsifier: {
            en: "Over the next two to four reports, revenue or EPS misses recur, operating margins contract materially, or new capacity remains concentrated in OpenAI-related commitments without diversified paying tenants.",
            ko: "향후 2~4개 분기에서 매출 또는 EPS 미스가 반복되고 영업마진이 크게 하락하거나 신규 용량이 다양한 유료 임차인 없이 OpenAI 관련 약정에 집중되면 회복 조건은 충족되지 않는다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("b3d5dc44-48ec-4b70-848f-d4e238e84829"),
          decisionDimension: "embedded_expectations",
          roleOwner: "valuation",
          stanceContribution: "supports",
          materiality: "material",
          publicThesis: {
            en: "NVIDIA’s valuation is demanding but not detached from operating momentum: the price implies roughly 21x NTM EPS while NTM revenue is about 75% above TTM revenue and the latest quarterly operating margin was 65.6%. For a medium-horizon entry, the next two to four reports must validate continued high growth without material margin compression.",
            ko: "NVIDIA의 밸류에이션은 높지만 실적 모멘텀과 완전히 동떨어져 있지는 않다. 주가는 NTM EPS 기준 약 21배를 반영하며, NTM 매출은 TTM 대비 약 75% 높고 최근 분기 영업이익률은 65.6%였다. 중기 신규 진입에서는 향후 2~4개 분기 동안 높은 성장 지속과 의미 있는 마진 하락 부재를 확인해야 한다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("9aa52720-3781-4d46-8b61-238500ec73c3"),
            ArtifactIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            ArtifactIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_quote.last_price:1",
            "insightsentry:provider_fundamental.eps_estimate_ntm.value:12",
            "insightsentry:provider_fundamental.revenue_estimate_ntm.value:23",
          ],
          falsifier: {
            en: "The thesis weakens if the next two reported quarters show revenue growth below 30% year over year or operating margin below 60% while NTM EPS estimates fail to rise.",
            ko: "향후 두 개 분기에서 매출 성장률이 전년 대비 30% 아래로 떨어지거나 영업이익률이 60% 아래로 하락하고 NTM EPS 추정치도 상승하지 않으면 이 주장은 약화된다.",
          },
        },
        {
          claimId: ClaimIdSchema.parse("b7a23d8b-c9c5-4007-8fb9-6d29d5a1775b"),
          decisionDimension: "embedded_expectations",
          roleOwner: "valuation",
          stanceContribution: "opposes",
          materiality: "supporting",
          publicThesis: {
            en: "Relative valuation leaves limited margin of safety: NVIDIA trades at 32.9x TTM earnings versus the qualified peer median of 12.7x, a 158.5% premium. That premium can be justified only by sustained superior growth and margins; absent upward earnings revisions, waiting for a better valuation cushion is warranted for a new entry.",
            ko: "상대 밸류에이션상 안전마진은 제한적이다. NVIDIA는 TTM 이익의 32.9배로 거래되어 적격 peer median 12.7배 대비 158.5% 프리미엄이다. 이 프리미엄은 지속적인 성장·마진 우위로만 정당화될 수 있으므로, 이익 추정치 상향이 없으면 신규 진입자는 더 나은 밸류에이션 여유를 기다릴 근거가 있다.",
          },
          evidenceArtifactIds: [
            ArtifactIdSchema.parse("d3b33079-fc88-4631-89f4-ae8a455d2a9b"),
            ArtifactIdSchema.parse("12dc855b-3d25-4d75-9568-d24471af8b4e"),
          ],
          counterevidenceArtifactIds: [],
          decisiveMetricIds: [
            "insightsentry:provider_fundamental.earnings_per_share_diluted_ttm.value:11",
            "insightsentry:provider_fundamental.market_cap_basic.value:38",
          ],
          falsifier: {
            en: "The relative-valuation objection weakens if NVIDIA sustains at least 30% revenue growth, operating margin above 60%, and repeated upward revisions to NTM EPS across the next two to four reporting periods.",
            ko: "향후 2~4개 분기 동안 매출 성장률 30% 이상, 영업이익률 60% 초과, NTM EPS의 반복적인 상향 조정이 확인되면 상대 밸류에이션 우려는 약화된다.",
          },
        },
      ],
      claimRegister: [
        {
          claimId: ClaimIdSchema.parse("5905c8bb-e270-464a-8b41-8318dd4b6e46"),
          text: {
            en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it.",
            ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23"),
            SourceIdSchema.parse("d3b33079-fc88-4631-89f4-ae8a455d2a9b"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("bf707cb0-3847-44e9-88d7-d7f410a23d2d"),
          text: {
            en: "NVIDIA’s operating quality can support a premium, but its valuation leaves less room for relative underperformance: the qualified peer median P/E is 12.7x versus NVIDIA at 32.9x, a 158.5% premium. For a medium-horizon new entry, waiting for earnings confirmation is better supported than assuming further multiple expansion.",
            ko: "엔비디아의 높은 운영 품질은 프리미엄을 정당화할 수 있지만 상대적 부진을 흡수할 여지는 작다. 적격 peer 중앙 P/E는 12.7배인데 엔비디아는 32.9배로 158.5% 프리미엄이다. 중기 신규 진입에서는 추가 멀티플 확장보다 실적 확인을 기다리는 쪽이 더 타당하다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("d3b33079-fc88-4631-89f4-ae8a455d2a9b"),
            SourceIdSchema.parse("12dc855b-3d25-4d75-9568-d24471af8b4e"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("443bf1e3-b5f0-499e-89da-120159afa58a"),
          text: {
            en: "NVIDIA’s growth engine is increasingly full-stack AI infrastructure: Compute & Networking generated roughly $193.5 billion of FY2025 revenue, while the Portsmouth agreement secured approximately 4.25 gigawatts of future OpenAI AI-factory capacity, with optional support for another 3.8 gigawatts. This supports the growth case only if capacity becomes operational and customer deployment converts into recognized demand over the next several reporting periods.",
            ko: "NVIDIA의 성장 엔진은 풀스택 AI 인프라로 이동하고 있습니다. Compute & Networking은 FY2025 매출 약 1,935억 달러를 창출했고, Portsmouth 계약은 OpenAI의 약 4.25GW AI 팩토리 용량과 추가 3.8GW 선택권을 확보했습니다. 다만 향후 몇 개 분기 동안 실제 가동과 고객 배치가 매출로 전환되어야 성장 가설이 유지됩니다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("de96d7bb-1322-4e18-8e3a-d96ca8863db2"),
          text: {
            en: "Management is reinforcing commercial execution and ecosystem reach: NVIDIA appointed a former Microsoft worldwide-sales executive to lead field operations, while reported TTM free cash flow of about $119.1 billion and cash plus short-term investments of about $80.6 billion provide capacity to fund platform expansion. For a new entry, this supports waiting for execution confirmation rather than paying solely for the narrative.",
            ko: "경영진은 상업적 실행력과 생태계 확장을 강화하고 있습니다. NVIDIA는 전 Microsoft 글로벌 영업 임원을 필드 운영 책임자로 영입했고, 약 1,191억 달러의 TTM 잉여현금흐름과 약 806억 달러의 현금·단기투자자산이 플랫폼 확장 재원을 제공합니다. 신규 진입자는 서사만으로 추격하기보다 실행 확인을 기다리는 편이 타당합니다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("09bbad1e-2de3-46bf-8956-deb869e87c49"),
            SourceIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("816ced2a-1d24-4b93-87bb-d67b4845f648"),
          text: {
            en: "NVIDIA’s moat is a full-stack ecosystem: CUDA, integrated GPUs, networking, and AI-factory software reduce switching friction and make deployment-scale substitution difficult; for a new entry, wait for the next two to four reports to confirm that major customer deployments continue adopting the stack without margin compression.",
            ko: "NVIDIA의 해자는 CUDA, 통합 GPU·네트워킹·AI 팩토리 소프트웨어로 구성된 풀스택 생태계이며, 전환 마찰을 낮추고 대규모 배포에서 대체를 어렵게 만든다. 신규 진입자는 향후 2~4개 보고서에서 주요 고객의 스택 채택이 마진 훼손 없이 지속되는지 확인해야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
            SourceIdSchema.parse("09bbad1e-2de3-46bf-8956-deb869e87c49"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("e8f91311-ec22-4935-87cd-8160c9bbe4cc"),
          text: {
            en: "Competitive erosion is credible through hyperscaler silicon, AMD and other accelerators, and customer-funded infrastructure: NVIDIA’s $105 billion capped residual-value guarantees for an OpenAI campus show that ecosystem expansion can also create counterparty and utilization dependence; monitor whether committed capacity becomes revenue-generating rather than merely guaranteed.",
            ko: "경쟁 침식은 하이퍼스케일러 자체 실리콘, AMD 등 경쟁 가속기, 고객 자금 의존 인프라를 통해 현실화될 수 있다. OpenAI 캠퍼스에 대한 NVIDIA의 최대 1,050억 달러 잔존가치 보증은 생태계 확장이 거래상대방과 가동률 의존도도 높일 수 있음을 보여준다. 약정 용량이 단순 보증을 넘어 실제 매출로 전환되는지 확인해야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("4bd08389-c9f2-4eae-88e8-1da4b8bea3ea"),
            SourceIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("83f2a070-8d63-4e62-8e11-73b51280d3bf"),
          text: {
            en: "The next moat milestone is verified production adoption: NVIDIA must show that large AI-factory commitments translate into deployed, revenue-producing systems and sustained use of its software stack by the next two to four reporting periods.",
            ko: "다음 해자 검증 milestone은 실제 생산 채택이다. NVIDIA는 향후 2~4개 보고기간 내 대형 AI 팩토리 약정이 배포·매출 창출 시스템과 지속적인 소프트웨어 스택 사용으로 전환됨을 보여줘야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("4bd08389-c9f2-4eae-88e8-1da4b8bea3ea"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("5538f340-5e42-47bd-81d0-3bab409d152f"),
          text: {
            en: "NVIDIA has secured a concrete production deployment path: OpenAI is contracted as tenant for approximately 4.25GW of IT load at the Portsmouth campus to deploy NVIDIA’s full-stack DSX AI factory platform, with service conditions expected from 2028. For a new entry, wait for construction and tenant-payment milestones to convert announced capacity into demonstrated utilization.",
            ko: "NVIDIA는 OpenAI를 임차인으로 확보하고 약 4.25GW IT 부하 규모의 Portsmouth 캠퍼스에서 NVIDIA의 풀스택 DSX AI 팩토리 플랫폼을 배치하는 구체적인 생산 배포 경로를 확보했다. 다만 서비스 개시 조건은 2028년부터 예상되므로, 신규 진입자는 건설 및 임차인 지급 마일스톤을 확인해 발표된 용량이 실제 사용으로 전환되는지 기다려야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("609eefdf-a178-4c98-8444-79f196d07dfa"),
          text: {
            en: "Current economics show that AI adoption is already monetizing at exceptional scale: NVIDIA reports $253.5 billion of TTM revenue, $119.1 billion of TTM free cash flow, and 74.1% TTM gross margin. This supports valuation tolerance only if the next two to four reports sustain revenue expansion without a sharp margin or cash-conversion reversal.",
            ko: "현재 경제성은 AI 채택이 이미 예외적인 규모로 수익화되고 있음을 보여준다. NVIDIA의 TTM 매출은 2,535억 달러, TTM 잉여현금흐름은 1,190.8억 달러, TTM 매출총이익률은 74.1%다. 향후 2~4개 분기 동안 매출 증가가 지속되고 마진이나 현금전환이 급격히 악화되지 않는 경우에만 높은 밸류에이션을 용인할 수 있다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("09bbad1e-2de3-46bf-8956-deb869e87c49"),
            SourceIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("8730d876-da78-468c-86c0-9cd5a7dbd8e3"),
          text: {
            en: "NVIDIA’s margin structure currently supports premium economics: operating margin rose from 54.1% in FY2024 to 60.4% in FY2026 and reached 65.6% in the latest quarter, although the medium-term valuation case requires this durability to persist.",
            ko: "NVIDIA의 마진 구조는 현재 프리미엄 경제성을 뒷받침한다. 영업이익률은 FY2024 54.1%에서 FY2026 60.4%로 상승했고 최근 분기 65.6%에 도달했지만, 밸류에이션 정당화에는 이러한 지속성이 필요하다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("9aa52720-3781-4d46-8b61-238500ec73c3"),
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("7effe5c1-9ce3-43b5-832d-259a99cf0025"),
          text: {
            en: "Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
            ko: "재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
            SourceIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
            SourceIdSchema.parse("2e0ca83a-c3e0-4a02-9ba6-2be04f82a548"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("cedc1548-2a5a-4649-805d-775761ac0f8b"),
          text: {
            en: "NVIDIA’s reported earnings continue to convert into substantial cash, but conversion has weakened: FY2026 operating cash flow was 85.6% of net income and Q1 FY2027 was 86.3%, so valuation support depends on sustaining cash generation rather than accounting earnings alone.",
            ko: "NVIDIA의 보고 이익은 여전히 상당한 현금으로 전환되지만 전환율은 약화됐다. FY2026 영업현금흐름은 순이익의 85.6%, FY2027 1분기는 86.3%였으므로 밸류에이션은 회계이익보다 지속적인 현금창출에 달려 있다.",
          },
          materiality: "material",
          semanticVerdict: "not_assessable",
          sourceIds: [
            SourceIdSchema.parse("9aa52720-3781-4d46-8b61-238500ec73c3"),
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("16638dcb-30ff-488e-81c2-861356dc1da8"),
          text: {
            en: "Balance-sheet liquidity is strong, but working-capital intensity and dilution require monitoring: Q1 FY2027 cash flow was $50.3B versus $48.6B of provider-reported free cash flow, while quarterly diluted shares declined modestly and stock compensation remained material.",
            ko: "대차대조표 유동성은 강하지만 운전자본 부담과 희석을 점검해야 한다. FY2027 1분기 현금흐름은 503억 달러, 제공업체 기준 잉여현금흐름은 486억 달러였고, 희석주식수는 소폭 감소했지만 주식보상은 여전히 중요하다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("97822eb4-085c-487d-be5d-bf0354684206"),
            SourceIdSchema.parse("2e0ca83a-c3e0-4a02-9ba6-2be04f82a548"),
            SourceIdSchema.parse("9dca57b0-e4a8-42b6-bdd9-c3737c835298"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("303e5a0f-da6f-402e-83d7-10cd5be1faf0"),
          text: {
            en: "NVIDIA’s price regime is conflicted: daily trend remains above its 20-, 50-, and 200-day averages, but hourly momentum is bearish and price sits near $214.50 support. For a new entry, wait for a close above $220.65 with volume confirmation; a break below $212.87 would weaken the market view.",
            ko: "엔비디아의 가격 국면은 혼조다. 일간 가격은 20·50·200일 이동평균 위에 있지만 시간봉 모멘텀은 약세이며 약 214.50달러 지지선에 있다. 신규 진입은 거래량 동반 220.65달러 상회 확인을 기다리고, 212.87달러 하회는 시장 견해를 약화시키는 신호다.",
          },
          materiality: "material",
          semanticVerdict: "entailed",
          sourceIds: [
            SourceIdSchema.parse("d3d53578-3ad1-487b-838f-8e4e8b59a65b"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("f1830d55-90e8-49a6-860e-06fd66671a0e"),
          text: {
            en: "The macro backdrop is a valuation headwind rather than a demand collapse: the 10-year Treasury yield was 4.74%, core CPI continued rising through June, and wages increased to $37.64 per hour. Higher discount rates and sticky service costs leave less tolerance for NVIDIA’s premium multiple.",
            ko: "거시 환경은 수요 붕괴보다 밸류에이션 역풍에 가깝다. 10년물 국채금리는 4.74%였고 근원 CPI는 6월까지 상승했으며 시간당 임금은 37.64달러로 올랐다. 높은 할인율과 끈적한 비용은 엔비디아의 프리미엄 멀티플 허용도를 낮춘다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("2093ee05-1a4f-4363-8e36-9c6a93572708"),
            SourceIdSchema.parse("0d93a3fc-9b45-48a2-b48e-ceedb5146290"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("a647bbc8-3518-4739-8383-aad5a49fa0ac"),
          text: {
            en: "The decisive near-term catalyst is NVIDIA’s August 26 earnings release. A bullish market confirmation requires upside to the $92.06 billion next-quarter revenue forecast and constructive China commentary, followed by a break above $220.65; failure to hold $214.50 after the release would signal that expectations remain too high.",
            ko: "가장 중요한 단기 촉매는 8월 26일 실적 발표다. 강세 확인에는 920.6억 달러의 다음 분기 매출 전망 상회와 긍정적인 중국 관련 발언, 그리고 220.65달러 돌파가 필요하다. 발표 후 214.50달러를 지키지 못하면 기대치가 과도하다는 신호다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23"),
            SourceIdSchema.parse("d3d53578-3ad1-487b-838f-8e4e8b59a65b"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("090cbb1d-b08d-4230-84b3-cf82e4c74e3e"),
          text: {
            en: "NVIDIA’s medium-term structure is mixed: price at $214.72 sits near $214.50 support, below the 1-hour 20/50-hour averages and the 4-hour 20-period average, while remaining above the 4-hour 50-period and daily 20/50-period averages; the August 26 earnings release is the next decisive catalyst. A sustained break below $211.45–$212.87 would weaken the constructive medium-term case, while a move above $227.92 would restore broader upside confirmation.",
            ko: "엔비디아의 중기 구조는 혼조세다. 주가는 $214.72로 $214.50 지지선 부근에 있으며 1시간 20·50기간 이동평균과 4시간 20기간 이동평균을 밑돌지만, 4시간 50기간 및 일간 20·50기간 이동평균은 웃돌고 있다. 8월 26일 실적 발표가 다음 핵심 촉매다. $211.45~$212.87 아래에서 지속 하락하면 중기 강세 논리가 약화되고, $227.92 상향 돌파는 broader 상승 확인 신호가 된다.",
          },
          materiality: "material",
          semanticVerdict: "entailed",
          sourceIds: [
            SourceIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
            SourceIdSchema.parse("2093ee05-1a4f-4363-8e36-9c6a93572708"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("83b15a03-f7cb-44b1-8efd-27a6199bad69"),
          text: {
            en: "Momentum and volume do not yet confirm a durable rebound: 1-hour RSI is 32.92 with negative MACD, while 4-hour RSI is 43.64, MACD is below its signal, and volume is only 0.57x its 20-period average; the recent close also fell 0.98% to $214.72. Confirmation would require recovery through $220.65–$227.92 on stronger volume, especially after the August 26 earnings event.",
            ko: "모멘텀과 거래량은 아직 지속적인 반등을 확인하지 않는다. 1시간 RSI는 32.92, MACD는 음수이고, 4시간 RSI는 43.64이며 MACD가 시그널 아래에 있고 거래량은 20기간 평균의 0.57배에 불과하다. 최근 종가는 0.98% 하락한 $214.72였다. 확인 신호는 8월 26일 실적 발표 이후 특히 거래량 증가와 함께 $220.65~$227.92를 회복하는 것이다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
            SourceIdSchema.parse("2093ee05-1a4f-4363-8e36-9c6a93572708"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("e1585c60-4e0e-4c1e-84ae-f5e3377a3adf"),
          text: {
            en: "The highest-impact downside is counterparty and infrastructure concentration: NVIDIA guaranteed up to $105 billion of residual lease value tied to OpenAI’s 4.25GW Ohio campus, so OpenAI default or project underperformance could transmit into large contingent payments, asset-reletting losses, and valuation compression despite NVIDIA’s net cash buffer; a new entry should wait for lease conditions, OpenAI payment performance, and disclosed exposure to become clearer.",
            ko: "가장 큰 하방 위험은 거래상대방 및 인프라 집중이다. NVIDIA는 OpenAI의 오하이오 4.25GW 캠퍼스와 연계된 최대 1,050억 달러의 잔존 임대가치를 보증했으므로, OpenAI의 채무불이행이나 프로젝트 부진은 순현금 완충에도 불구하고 대규모 우발지급, 재임대 손실, 밸류에이션 압박으로 전이될 수 있다. 신규 진입은 임대 조건, OpenAI 지급 이행, 관련 노출이 명확해질 때까지 기다리는 것이 합리적이다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("238374c7-411c-4542-822e-fa7732272be5"),
            SourceIdSchema.parse("53f3d25b-bc86-41cd-9ae2-ce8222c12867"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("3e2bc131-f2b7-44af-8b42-7498c3a0ba4d"),
          text: {
            en: "The earliest measurable warning signal is the August 26 earnings release: a miss or weaker forward revenue outlook against the approximately $92.1 billion next-quarter forecast would indicate that AI infrastructure demand is not absorbing the company’s capacity and contingent commitments; investors should track revenue guidance, accounts receivable, inventory, and gross margin together.",
            ko: "가장 이른 측정 가능 경고 신호는 8월 26일 실적 발표다. 약 921억 달러의 다음 분기 매출 전망을 하회하거나 전망이 약화되면 AI 인프라 수요가 회사의 생산능력과 우발적 약정을 흡수하지 못한다는 신호가 될 수 있다. 매출 가이던스, 매출채권, 재고, 총마진을 함께 확인해야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            SourceIdSchema.parse("d3d53578-3ad1-487b-838f-8e4e8b59a65b"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("41da6711-15a7-4257-8490-1fd0f3d88b3e"),
          text: {
            en: "Valuation magnifies any operating disappointment: at $214.72 per share, NVIDIA trades at roughly 32.9 times trailing earnings versus a qualified peer median of 12.7 times, so a demand or margin reset can reduce both earnings and the multiple; the recovery condition is sustained revenue growth with gross margin near 70% or higher and no increase in contingent-liability disclosures.",
            ko: "밸류에이션은 영업 실망을 확대한다. 주당 214.72달러에서 NVIDIA의 최근 12개월 이익 배수는 약 32.9배로, 적격 peer 중앙값 12.7배보다 높다. 따라서 수요나 마진이 재설정되면 이익과 배수가 동시에 하락할 수 있다. 회복 조건은 매출 성장 지속, 70% 이상에 가까운 총마진, 우발부채 공시 증가 없음이다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("1b6c8a66-c282-4ba5-8a66-c8addbb32333"),
          text: {
            en: "NVIDIA has substantial liquidity and contractual recovery rights that can absorb a policy or customer shock, but its new Portsmouth commitments create a contingent downside path: an OpenAI default could leave NVIDIA exposed to up to $105 billion of residual-value guarantees before reimbursement or asset recovery. For a new entry, require the upcoming 10-Q to quantify the guarantees and monitor OpenAI credit quality, lease readiness, and replacement-value coverage.",
            ko: "NVIDIA는 상당한 유동성과 계약상 회수권을 보유해 정책 또는 고객 충격을 흡수할 수 있지만, Portsmouth 약정은 새로운 하방 경로를 만든다. OpenAI가 채무불이행하면 상환 또는 자산 회수 전 NVIDIA가 최대 1,050억 달러의 잔존가치 보증에 노출될 수 있다. 신규 진입자는 다음 10-Q의 보증 규모, OpenAI 신용도, 임대 개시 조건 및 대체가치 보전 여부를 확인해야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            SourceIdSchema.parse("238374c7-411c-4542-822e-fa7732272be5"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("18f913d6-2377-4cea-8bc3-9301ee85f50b"),
          text: {
            en: "The earliest policy warning signal is a formal expansion of U.S. export controls from physical-chip shipments to overseas cloud access; that would transmit through lost China-linked compute demand and a higher discount rate. NVIDIA already assumes no China data-center compute revenue in its near-term outlook, so the next decisive confirmation is whether regulators impose cloud-access restrictions or NVIDIA discloses incremental customer-screening costs.",
            ko: "가장 이른 정책 경고 신호는 미국 수출통제가 실물 칩 선적에서 해외 클라우드 접근으로 확대되는 것이다. 이는 중국 관련 컴퓨팅 수요 감소와 할인율 상승으로 전이된다. NVIDIA는 이미 단기 전망에서 중국 데이터센터 컴퓨팅 매출을 제외하고 있으므로, 다음 확인 지표는 규제당국의 클라우드 접근 제한 또는 NVIDIA가 공시하는 추가 고객심사 비용이다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("a892fbb7-15d8-4f23-b1bc-79c66e93336c"),
            SourceIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            SourceIdSchema.parse("53f3d25b-bc86-41cd-9ae2-ce8222c12867"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("e753f502-22a7-469d-88be-ffb404d51243"),
          text: {
            en: "NVIDIA’s recovery capacity is strengthened by ecosystem expansion and executive commercial continuity: the company appointed a Microsoft veteran to lead worldwide field operations while pursuing large AI-campus commitments. Recovery from a policy or macro shock would be more credible if the next two to four reports preserve demand, margin, and cash generation while management converts capacity into diversified tenants and end markets.",
            ko: "NVIDIA는 생태계 확장과 영업 리더십 연속성으로 정책·거시 충격 이후 회복 역량을 높였다. Microsoft 출신 임원을 전세계 영업 책임자로 임명했고 대형 AI 캠퍼스 약정을 추진 중이다. 향후 2~4개 분기에서 수요·마진·현금창출을 유지하고 다양한 임차인과 최종시장으로 용량을 전환하면 회복 논리가 강화된다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("4a321099-ee5b-4347-a404-15204a6e88f5"),
            SourceIdSchema.parse("09c1f1b4-3e86-481d-8400-cac0fde0c51b"),
            SourceIdSchema.parse("31e71ecf-dc5c-45d9-aa6d-be9ad40ac8c6"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("b3d5dc44-48ec-4b70-848f-d4e238e84829"),
          text: {
            en: "NVIDIA’s valuation is demanding but not detached from operating momentum: the price implies roughly 21x NTM EPS while NTM revenue is about 75% above TTM revenue and the latest quarterly operating margin was 65.6%. For a medium-horizon entry, the next two to four reports must validate continued high growth without material margin compression.",
            ko: "NVIDIA의 밸류에이션은 높지만 실적 모멘텀과 완전히 동떨어져 있지는 않다. 주가는 NTM EPS 기준 약 21배를 반영하며, NTM 매출은 TTM 대비 약 75% 높고 최근 분기 영업이익률은 65.6%였다. 중기 신규 진입에서는 향후 2~4개 분기 동안 높은 성장 지속과 의미 있는 마진 하락 부재를 확인해야 한다.",
          },
          materiality: "material",
          semanticVerdict: "partial",
          sourceIds: [
            SourceIdSchema.parse("9aa52720-3781-4d46-8b61-238500ec73c3"),
            SourceIdSchema.parse("5b489b3f-ccfa-4065-ace9-f947c5717bac"),
            SourceIdSchema.parse("85e7102b-36a7-44dd-8a4b-19d9f17f7d58"),
          ],
          disposition: "accepted",
        },
        {
          claimId: ClaimIdSchema.parse("b7a23d8b-c9c5-4007-8fb9-6d29d5a1775b"),
          text: {
            en: "Relative valuation leaves limited margin of safety: NVIDIA trades at 32.9x TTM earnings versus the qualified peer median of 12.7x, a 158.5% premium. That premium can be justified only by sustained superior growth and margins; absent upward earnings revisions, waiting for a better valuation cushion is warranted for a new entry.",
            ko: "상대 밸류에이션상 안전마진은 제한적이다. NVIDIA는 TTM 이익의 32.9배로 거래되어 적격 peer median 12.7배 대비 158.5% 프리미엄이다. 이 프리미엄은 지속적인 성장·마진 우위로만 정당화될 수 있으므로, 이익 추정치 상향이 없으면 신규 진입자는 더 나은 밸류에이션 여유를 기다릴 근거가 있다.",
          },
          materiality: "material",
          semanticVerdict: "entailed",
          sourceIds: [
            SourceIdSchema.parse("d3b33079-fc88-4631-89f4-ae8a455d2a9b"),
            SourceIdSchema.parse("12dc855b-3d25-4d75-9568-d24471af8b4e"),
          ],
          disposition: "accepted",
        },
      ],
      comparators: [],
      sectionNarratives: [
        {
          id: "ten_second_brief",
          title: {
            en: "Ten-second brief",
            ko: "10초 요약",
          },
          body: {
            en: "Yes, NVIDIA’s AI growth can justify its valuation, but not yet with enough margin of safety for a medium-horizon new entry. The operating case is strong, while short-term momentum and peer-relative signals remain mixed. The actionable test is sustained strength above $222.28 with peer outperformance over the next two to four reporting periods.",
            ko: "엔비디아의 AI 성장은 밸류에이션을 정당화할 수 있지만, 중기 신규 진입을 위한 안전마진이 충분하다고 보기는 아직 어렵다. 실적 기반은 강하지만 단기 모멘텀과 peer 대비 신호는 혼조다. 향후 2~4개 보고기간 동안 $222.28 위의 강세와 peer 대비 초과성과가 지속되는지가 핵심 확인 조건이다.",
          },
        },
        {
          id: "supported_analysis",
          title: {
            en: "Supported analysis",
            ko: "근거 기반 분석",
          },
          body: {
            en: "What is established is a credible full-stack AI growth engine, exceptional margins and cash generation, and meaningful capacity to fund expansion. The teams dispute whether those strengths already offset execution risk, valuation concentration, and the uncertain monetization of announced infrastructure commitments. The deciding checkpoint is whether the next two to four reports show deployment becoming revenue-producing while margins, cash conversion, working capital, and guarantee exposure remain controlled.",
            ko: "확인된 사실은 신뢰할 수 있는 풀스택 AI 성장 엔진, 탁월한 마진과 현금창출력, 그리고 확장에 필요한 재원이다. 다만 이러한 강점이 실행 위험, 높은 밸류에이션, 발표된 인프라 약정의 불확실한 수익화를 이미 상쇄하는지는 부서 간 이견이 있다. 향후 2~4개 보고서에서 배포가 매출로 전환되고 마진·현금전환·운전자본·보증 노출이 통제되는지가 판단을 가를 기준이다.",
          },
        },
        {
          id: "valuation_comparison",
          title: {
            en: "Valuation and comparison",
            ko: "밸류에이션과 기업 비교",
          },
          body: {
            en: "The modeled forward-earnings sensitivity spans $229.40 to $407.49 using forward EPS of $10.06 and multiples from 22.8x to 40.5x; this is a sensitivity framework, not guaranteed fair value. The base case implies $317.94 at 31.6x, while the observed valuation remains demanding relative to the qualified peer median. The premium therefore requires sustained growth and margin delivery, with disappointment capable of compressing both earnings and the multiple.",
            ko: "선행 이익가치 민감도는 선행 EPS $10.06에 22.8~40.5배를 적용해 $229.40~$407.49로 산출되며, 이는 보장된 적정가가 아닌 민감도 범위다. 기준 시나리오는 31.6배 적용 시 $317.94를 제시하지만, 현재 밸류에이션은 적격 peer 중앙값보다 높다. 따라서 프리미엄은 지속적인 성장과 마진 달성을 요구하며, 실망 시 이익과 멀티플이 함께 낮아질 수 있다.",
          },
        },
        {
          id: "operational_scenarios",
          title: {
            en: "Operational scenarios",
            ko: "운영 시나리오",
          },
          body: {
            en: "In the upside path, AI-factory commitments become deployed systems, software adoption persists, and revenue growth supports premium multiples. In the base path, strong cash generation continues but investors require repeated evidence that capacity and customer deployments convert into recognized demand. In the downside path, delayed utilization, competing silicon, margin pressure, or guarantee-related cash exposure would reduce the earnings power supporting the valuation.",
            ko: "상방 경로에서는 AI 팩토리 약정이 실제 시스템으로 배포되고 소프트웨어 채택이 지속되며 매출 성장이 프리미엄 멀티플을 지지한다. 기준 경로에서는 현금창출력이 강하게 유지되지만, 용량과 고객 배포가 인식 매출로 전환된다는 반복적인 증거가 필요하다. 하방 경로에서는 가동 지연, 경쟁 실리콘, 마진 압박 또는 보증 관련 현금 노출이 밸류에이션을 지지하는 이익가치를 낮춘다.",
          },
        },
        {
          id: "dissent_unknowns",
          title: {
            en: "Dissent and unknowns",
            ko: "이견과 미확인 사항",
          },
          body: {
            en: "The strongest opposing case is that NVIDIA’s current cash generation is highly supportive of expansion, while customer arrangements and platform integration could turn infrastructure commitments into reinforcing demand. The unresolved issue is whether that demand will produce durable utilization and recognized revenue before guarantee and financing exposure become material. Resolving this would determine whether the premium reflects compounding economics or merely optimistic commitments.",
            ko: "가장 강한 반대 논리는 엔비디아의 현재 현금창출력이 확장을 강하게 뒷받침하고, 고객 계약과 플랫폼 통합이 인프라 약정을 강화되는 수요로 전환할 수 있다는 것이다. 미해결 쟁점은 보증 및 금융 노출이 중요해지기 전에 이러한 수요가 지속적인 가동률과 인식 매출로 이어지는지다. 이 문제가 확인되면 현재 프리미엄이 복리 성장의 경제성을 반영하는지 낙관적 약정에 불과한지가 결정된다.",
          },
        },
        {
          id: "change_conditions",
          title: {
            en: "Change conditions",
            ko: "변경 조건",
          },
          body: {
            en: "The case strengthens if the next two to four reports show sustained revenue growth, resilient margins and cash conversion, and increasing deployed capacity and software adoption. It weakens if operating margin falls below 55% for two consecutive reported quarters or if gross-margin compression exceeds five percentage points year over year. Recheck these conditions at the next earnings release and subsequent filings, alongside utilization and guarantee disclosures.",
            ko: "향후 2~4개 보고서에서 매출 성장, 마진과 현금전환의 안정성, 배포 용량과 소프트웨어 채택 증가가 확인되면 투자 논리는 강화된다. 영업이익률이 두 분기 연속 55% 아래로 떨어지거나 매출총이익률 하락폭이 전년 대비 5%포인트를 넘으면 약화된다. 다음 실적 발표와 후속 공시에서 가동률 및 보증 공시와 함께 이 조건들을 재점검해야 한다.",
          },
        },
      ],
      conflicts: [],
    },
    reportDecisionFalsifier: {
      en: "The view would be falsified if NVIDIA closes above $222.28 and outperforms the qualified peer median over the next two to four reporting periods without a material volume deterioration.",
      ko: "향후 2~4개 보고기간 동안 엔비디아가 222.28달러 위에서 마감하고 거래량 악화 없이 적격 peer 중앙값을 상회하면 이 판단은 무효화된다.",
    },
    researchTarget: {
      kind: "committee",
    },
    researchDirection: "Can NVIDIA’s AI growth justify its valuation?",
    marketSnapshot: {
      price: "214.72",
      currency: "USD",
      observedAt: "2026-08-21T23:59:59.000Z",
      marketState: "CLOSED",
      change: "-2.13",
      changePercent: -0.982245792022135,
    },
    metricSnapshot: {
      asOf: "2026-08-22T09:50:15.874Z",
      metrics: [
        {
          id: "current_price",
          label: {
            en: "Current price",
            ko: "현재가",
          },
          category: "market",
          value: 214.72,
          unit: "USD_per_share",
          observedAt: "2026-08-21T23:59:59.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "daily_change_percent",
          label: {
            en: "Previous-day change",
            ko: "전일 대비",
          },
          category: "market",
          value: -0.982245792022135,
          unit: "percent",
          observedAt: "2026-08-21T23:59:59.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "revenue_ttm",
          label: {
            en: "TTM revenue",
            ko: "최근 12개월 매출",
          },
          category: "financial",
          value: 253491000000,
          unit: "USD",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "gross_margin",
          label: {
            en: "Gross margin",
            ko: "매출총이익률",
          },
          category: "financial",
          value: 74.1454331711974,
          unit: "percent",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "operating_margin",
          label: {
            en: "Operating margin",
            ko: "영업이익률",
          },
          category: "financial",
          value: 65.5957850885254,
          unit: "percent",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "free_cash_flow",
          label: {
            en: "Free cash flow",
            ko: "잉여현금흐름",
          },
          category: "financial",
          value: 119076000000,
          unit: "USD",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "operating_cash_flow",
          label: {
            en: "Operating cash flow",
            ko: "영업현금흐름",
          },
          category: "financial",
          value: 125648000000,
          unit: "USD",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "net_income",
          label: {
            en: "Net income",
            ko: "순이익",
          },
          category: "financial",
          value: 58321000000,
          unit: "USD",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "eps_ttm",
          label: {
            en: "Diluted EPS",
            ko: "희석 EPS",
          },
          category: "financial",
          value: 6.5298,
          unit: "USD_per_share",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "net_margin",
          label: {
            en: "Net margin",
            ko: "순이익률",
          },
          category: "financial",
          value: 62.9659435640713,
          unit: "percent",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "capital_expenditures",
          label: {
            en: "Capital expenditure",
            ko: "설비투자",
          },
          category: "financial",
          value: -6572000000,
          unit: "USD",
          period: "TTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "net_debt",
          label: {
            en: "Net debt",
            ko: "순부채",
          },
          category: "risk",
          value: -67758000000,
          unit: "USD",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "lower_better",
        },
        {
          id: "total_assets",
          label: {
            en: "Total assets",
            ko: "총자산",
          },
          category: "financial",
          value: 259474000000,
          unit: "USD",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "total_equity",
          label: {
            en: "Total equity",
            ko: "자기자본",
          },
          category: "financial",
          value: 195474000000,
          unit: "USD",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "debt_to_equity",
          label: {
            en: "Debt to equity",
            ko: "부채비율",
          },
          category: "risk",
          value: 0.0655534751424742,
          unit: "multiple",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "lower_better",
        },
        {
          id: "cash",
          label: {
            en: "Cash and short-term investments",
            ko: "현금·단기투자자산",
          },
          category: "risk",
          value: 80572000000,
          unit: "USD",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "inventory",
          label: {
            en: "Inventory",
            ko: "재고자산",
          },
          category: "risk",
          value: 25797000000,
          unit: "USD",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "diluted_shares",
          label: {
            en: "Diluted shares",
            ko: "희석주식 수",
          },
          category: "risk",
          value: 24391000000,
          unit: "shares",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "lower_better",
        },
        {
          id: "roe",
          label: {
            en: "Return on equity",
            ko: "자기자본이익률",
          },
          category: "financial",
          value: 114.288066963343,
          unit: "percent",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "roic",
          label: {
            en: "Return on invested capital",
            ko: "투하자본수익률",
          },
          category: "financial",
          value: 106.178613005156,
          unit: "percent",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "market_cap",
          label: {
            en: "Market capitalization",
            ko: "시가총액",
          },
          category: "market",
          value: 5196224146254,
          unit: "USD",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "price_to_book",
          label: {
            en: "Price to book",
            ko: "PBR",
          },
          category: "market",
          value: 25.8066,
          unit: "multiple",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "book_value_per_share",
          label: {
            en: "Book value per share",
            ko: "주당순자산",
          },
          category: "financial",
          value: 8.07043,
          unit: "USD_per_share",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "dividend_yield",
          label: {
            en: "Dividend yield",
            ko: "배당수익률",
          },
          category: "financial",
          value: 0.12912151256629,
          unit: "percent",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "ev_ebitda",
          label: {
            en: "EV/EBITDA",
            ko: "EV/EBITDA",
          },
          category: "market",
          value: 30.2563035531952,
          unit: "multiple",
          period: "FQ",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "forward_revenue",
          label: {
            en: "Forward revenue",
            ko: "선행 매출 전망",
          },
          category: "expectations",
          value: 442542121835,
          unit: "USD",
          period: "NTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "forward_eps",
          label: {
            en: "Forward EPS",
            ko: "선행 EPS 전망",
          },
          category: "expectations",
          value: 10.061455,
          unit: "USD_per_share",
          period: "NTM",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "price_target_median",
          label: {
            en: "Consensus price target",
            ko: "컨센서스 목표주가",
          },
          category: "expectations",
          value: 300,
          unit: "USD_per_share",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "price_target_high",
          label: {
            en: "High price target",
            ko: "목표주가 상단",
          },
          category: "expectations",
          value: 743.1,
          unit: "USD_per_share",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "price_target_low",
          label: {
            en: "Low price target",
            ko: "목표주가 하단",
          },
          category: "expectations",
          value: 180,
          unit: "USD_per_share",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "price_target_count",
          label: {
            en: "Price-target sample",
            ko: "목표주가 표본 수",
          },
          category: "expectations",
          value: 58,
          unit: "count",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "recommendation_buy",
          label: {
            en: "Buy recommendations",
            ko: "매수 의견 수",
          },
          category: "expectations",
          value: 57,
          unit: "count",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "recommendation_hold",
          label: {
            en: "Hold recommendations",
            ko: "중립 의견 수",
          },
          category: "expectations",
          value: 2,
          unit: "count",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "recommendation_sell",
          label: {
            en: "Sell recommendations",
            ko: "매도 의견 수",
          },
          category: "expectations",
          value: 1,
          unit: "count",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "lower_better",
        },
        {
          id: "segment_share:compute_networking",
          label: {
            en: "Compute & Networking segment share",
            ko: "Compute & Networking 사업부 비중",
          },
          category: "company",
          value: 89.59932943715326,
          unit: "percent",
          period: "2025",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "segment_share:graphics",
          label: {
            en: "Graphics segment share",
            ko: "Graphics 사업부 비중",
          },
          category: "company",
          value: 10.400670562846743,
          unit: "percent",
          period: "2025",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "region_share:united_states",
          label: {
            en: "United States region share",
            ko: "United States 지역 비중",
          },
          category: "risk",
          value: 69.28701756985801,
          unit: "percent",
          period: "2025",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "region_share:taiwan",
          label: {
            en: "Taiwan region share",
            ko: "Taiwan 지역 비중",
          },
          category: "risk",
          value: 19.6097954042364,
          unit: "percent",
          period: "2025",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "region_share:china_including_hong_kong",
          label: {
            en: "China (Including Hong Kong) region share",
            ko: "China (Including Hong Kong) 지역 비중",
          },
          category: "risk",
          value: 9.112337800665006,
          unit: "percent",
          period: "2025",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "region_share:other",
          label: {
            en: "Other region share",
            ko: "Other 지역 비중",
          },
          category: "risk",
          value: 1.9908492252405783,
          unit: "percent",
          period: "2025",
          observedAt: "2026-08-22T08:37:57.843Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "relative_performance_3m",
          label: {
            en: "3-month performance",
            ko: "3개월 수익률",
          },
          category: "market",
          value: 1.0356177534750055,
          unit: "percent",
          observedAt: "2026-08-22T08:37:48.472Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "relative_performance_1y",
          label: {
            en: "1-year performance",
            ko: "1년 수익률",
          },
          category: "market",
          value: 23.01979840286523,
          unit: "percent",
          observedAt: "2026-08-22T08:37:48.472Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "peer_premium:price_earnings_ttm",
          label: {
            en: "price earnings ttm vs peers",
            ko: "price earnings ttm 동종업계 대비",
          },
          category: "market",
          value: 158.51,
          unit: "percent",
          observedAt: "2026-08-22T08:37:48.472Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "peer_premium:enterprise_value_ebitda_ttm",
          label: {
            en: "enterprise value ebitda ttm vs peers",
            ko: "enterprise value ebitda ttm 동종업계 대비",
          },
          category: "market",
          value: 189.8,
          unit: "percent",
          observedAt: "2026-08-22T08:37:48.472Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "peer_premium:enterprise_value_to_revenue_ttm",
          label: {
            en: "enterprise value to revenue ttm vs peers",
            ko: "enterprise value to revenue ttm 동종업계 대비",
          },
          category: "market",
          value: 537.46,
          unit: "percent",
          observedAt: "2026-08-22T08:37:48.472Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "latest_eps_actual",
          label: {
            en: "Latest EPS actual",
            ko: "최근 EPS 실제치",
          },
          category: "expectations",
          value: 1.866323,
          unit: "USD_per_share",
          observedAt: "2026-08-22T08:37:51.972Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "next_eps_forecast",
          label: {
            en: "Next EPS estimate",
            ko: "다음 EPS 예상치",
          },
          category: "expectations",
          value: 2.087725,
          unit: "USD_per_share",
          observedAt: "2026-08-22T08:37:51.972Z",
          source: "insightsentry",
          signal: "contextual",
        },
      ],
      earningsCalendar: {
        latestReportAt: "2026-05-20T20:20:00.000Z",
        nextReportAt: "2026-08-26T20:00:00.000Z",
      },
      investmentModel: {
        version: "universal-investment-model-v1",
        archetype: "growth",
        archetypeLabel: {
          en: "Growth before mature cash flow",
          ko: "성장 선반영형",
        },
        primaryMethod: "earnings_power",
        methodLabel: {
          en: "Forward earnings power",
          ko: "선행 이익가치",
        },
        methodNote: {
          en: "Forward EPS is tested across explicit valuation multiples; this is a sensitivity range, not a single price target.",
          ko: "선행 EPS에 서로 다른 멀티플을 적용한 민감도 범위이며 단일 목표주가가 아닙니다.",
        },
        capabilities: [
          {
            key: "price",
            status: "measured",
            label: {
              en: "Observed price",
              ko: "현재 가격",
            },
          },
          {
            key: "earnings",
            status: "measured",
            label: {
              en: "Earnings anchor",
              ko: "이익 기준",
            },
          },
          {
            key: "cash_flow",
            status: "measured",
            label: {
              en: "Cash-flow anchor",
              ko: "현금흐름 기준",
            },
          },
          {
            key: "growth",
            status: "derived",
            label: {
              en: "Growth anchor",
              ko: "성장 기준",
            },
          },
          {
            key: "balance_sheet",
            status: "measured",
            label: {
              en: "Balance-sheet anchor",
              ko: "재무상태 기준",
            },
          },
          {
            key: "peer_comparison",
            status: "measured",
            label: {
              en: "Qualified peers",
              ko: "적격 비교기업",
            },
          },
          {
            key: "consensus",
            status: "context_only",
            label: {
              en: "Market estimates",
              ko: "시장 추정치",
            },
          },
        ],
        scenarios: [
          {
            id: "downside",
            label: {
              en: "Downside",
              ko: "하방",
            },
            impliedPrice: 229.4,
            returnPercent: 6.8,
            requiredMetric: {
              en: "Forward P/E",
              ko: "선행 PER",
            },
            requiredValue: 22.8,
            requiredUnit: "multiple",
            assumptions: [
              {
                en: "Forward EPS $10.06 × 22.8x",
                ko: "선행 EPS $10.06 × 22.8배",
              },
              {
                en: "Forward EPS growth versus trailing EPS: 54.1%",
                ko: "최근 EPS 대비 선행 EPS 증가율 54.1%",
              },
              {
                en: "Current implied forward P/E: 21.3x",
                ko: "현재 주가 기준 선행 PER 21.3배",
              },
            ],
          },
          {
            id: "base",
            label: {
              en: "Base",
              ko: "기준",
            },
            impliedPrice: 317.94,
            returnPercent: 48.1,
            requiredMetric: {
              en: "Forward P/E",
              ko: "선행 PER",
            },
            requiredValue: 31.6,
            requiredUnit: "multiple",
            assumptions: [
              {
                en: "Forward EPS $10.06 × 31.6x",
                ko: "선행 EPS $10.06 × 31.6배",
              },
              {
                en: "Forward EPS growth versus trailing EPS: 54.1%",
                ko: "최근 EPS 대비 선행 EPS 증가율 54.1%",
              },
              {
                en: "Current implied forward P/E: 21.3x",
                ko: "현재 주가 기준 선행 PER 21.3배",
              },
            ],
          },
          {
            id: "upside",
            label: {
              en: "Upside",
              ko: "상방",
            },
            impliedPrice: 407.49,
            returnPercent: 89.8,
            requiredMetric: {
              en: "Forward P/E",
              ko: "선행 PER",
            },
            requiredValue: 40.5,
            requiredUnit: "multiple",
            assumptions: [
              {
                en: "Forward EPS $10.06 × 40.5x",
                ko: "선행 EPS $10.06 × 40.5배",
              },
              {
                en: "Forward EPS growth versus trailing EPS: 54.1%",
                ko: "최근 EPS 대비 선행 EPS 증가율 54.1%",
              },
              {
                en: "Current implied forward P/E: 21.3x",
                ko: "현재 주가 기준 선행 PER 21.3배",
              },
            ],
          },
        ],
        currentPrice: 214.72,
        consensusTarget: 300,
        consensusUpsidePercent: 39.7,
        freeCashFlowYieldPercent: 2.3,
        netCashToMarketCapPercent: 1.3,
        summary: {
          en: "The explicit sensitivity range is $229.40–$407.49; the spread shows which operating and valuation assumptions matter, not a promise of fair value.",
          ko: "명시적 민감도 범위는 $229.40~$407.49이며, 이 폭은 적정가 약속이 아니라 어떤 실적·배수 가정이 중요한지를 보여줍니다.",
        },
      },
    },
    anticipatedQuestions: [
      {
        id: "9075bcdd-458c-4614-84ed-c301eca3de65",
        decisionKey: "decision_new_entry",
        question: {
          en: "What must be true before a new position has a favorable evidence-to-price trade-off?",
          ko: "신규 진입의 근거 대비 가격 조건이 유리하려면 무엇이 먼저 확인돼야 하나요?",
        },
        answer: {
          en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it. Countercase: Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
          ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다. 반대 논거: 재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
        },
        lens: {
          en: "Decision lens",
          ko: "투자 판단",
        },
        primaryClaimIds: ["5905c8bb-e270-464a-8b41-8318dd4b6e46"],
        evidenceArtifactIds: [
          "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
        ],
        rank: 1,
      },
      {
        id: "d790864e-ebdf-4693-88e7-8644c87d4c2e",
        decisionKey: "consensus_price_gap",
        question: {
          en: "How much upside or downside does the cited market level imply from here?",
          ko: "현재가 대비 컨센서스 목표주가는 어느 정도의 상승·하락 여지를 뜻하나요?",
        },
        answer: {
          en: "The median cited market level above the current price. Treat the gap as a sentiment hurdle: upside requires estimate upgrades or better operating delivery, while downside signals that the current cited market level already exceeds the center of published expectations.",
          ko: "컨센서스 중앙값은 현재가보다 39.7% 높습니다. 이 격차는 가치의 증명이 아니라 기대의 문턱입니다. 상승 여력을 현실화하려면 추정치 상향이나 운영 성과 개선이 필요하고, 하락 여지라면 현재 진입가가 공개 기대의 중심을 이미 넘어섰다는 뜻입니다.",
        },
        lens: {
          en: "Calculated lens",
          ko: "계산 검증",
        },
        primaryClaimIds: ["090cbb1d-b08d-4230-84b3-cf82e4c74e3e"],
        evidenceArtifactIds: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
        ],
        rank: 2,
      },
      {
        id: "e3b24141-05e2-45ed-8499-5ef4bf9a75ed",
        decisionKey: "decision_breaker",
        question: {
          en: "What single observable result would force the current decision to change?",
          ko: "어떤 단 하나의 관찰 결과가 나오면 현재 판단을 바꿔야 하나요?",
        },
        answer: {
          en: "The view would be falsified if NVIDIA closes above $222.28 and outperforms the qualified peer median over the next two to four reporting periods without a material volume deterioration.",
          ko: "향후 2~4개 보고기간 동안 엔비디아가 222.28달러 위에서 마감하고 거래량 악화 없이 적격 peer 중앙값을 상회하면 이 판단은 무효화된다.",
        },
        lens: {
          en: "Downside test",
          ko: "반대·하방 검증",
        },
        primaryClaimIds: ["5905c8bb-e270-464a-8b41-8318dd4b6e46"],
        evidenceArtifactIds: [
          "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
        ],
        rank: 3,
      },
      {
        id: "d67412f0-5409-4200-8431-f7d549fd3610",
        decisionKey: "free_cash_flow_conversion",
        question: {
          en: "What share of revenue is actually surviving as free cash flow?",
          ko: "매출 중 실제 잉여현금흐름으로 남는 비중은 얼마나 되나요?",
        },
        answer: {
          en: "Free cash flow equals 47% of trailing revenue. Use that conversion rate as the earnings-quality floor: reported growth deserves less valuation weight if cash conversion falls while revenue expands.",
          ko: "잉여현금흐름은 최근 12개월 매출의 47%입니다. 이 전환율을 이익의 질을 판단하는 하한선으로 사용해야 하며, 매출이 늘어도 현금 전환율이 낮아지면 보고 성장률의 밸류에이션 가중치를 낮춰야 합니다.",
        },
        lens: {
          en: "Calculated lens",
          ko: "계산 검증",
        },
        primaryClaimIds: ["8730d876-da78-468c-86c0-9cd5a7dbd8e3"],
        evidenceArtifactIds: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        rank: 4,
      },
      {
        id: "175459fa-723f-4fdc-8b6b-8345645dc39e",
        decisionKey: "implied_forward_earnings_multiple",
        question: {
          en: "What earnings multiple does the current price place on forward consensus EPS?",
          ko: "현재가는 선행 컨센서스 EPS에 몇 배의 이익 배수를 부여하고 있나요?",
        },
        answer: {
          en: "At $214.72 and forward EPS of $10.06, the price implies about 21.3x forward earnings. The next release must justify that multiple through durable margins and upward estimate revisions; a one-quarter beat without a higher earnings path does not improve the entry case.",
          ko: "현재가 $214.72와 선행 EPS $10.06를 적용하면 약 21.3배의 선행 이익 배수가 계산됩니다. 다음 실적은 지속 가능한 마진과 추정치 상향으로 이 배수를 정당화해야 하며, 이익 경로가 높아지지 않는 한 한 분기의 어닝 서프라이즈만으로 신규 진입 조건이 좋아지지는 않습니다.",
        },
        lens: {
          en: "Calculated lens",
          ko: "계산 검증",
        },
        primaryClaimIds: ["443bf1e3-b5f0-499e-89da-120159afa58a"],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        rank: 5,
      },
      {
        id: "7c5e57f7-a711-4e5e-821b-53c5387306dd",
        decisionKey: "forward_revenue_expectation",
        question: {
          en: "What revenue growth is embedded in the next-twelve-month consensus?",
          ko: "향후 12개월 컨센서스에는 어느 정도의 매출 성장이 반영돼 있나요?",
        },
        answer: {
          en: "Forward revenue is +74.6% versus trailing revenue. This becomes investable only if guidance preserves or lifts that path without weaker margins or cash conversion; revenue growth bought with lower operating quality should not receive the same valuation weight.",
          ko: "선행 매출 전망은 최근 12개월 매출보다 +74.6% 높습니다. 가이던스가 마진이나 현금 전환을 훼손하지 않으면서 이 경로를 유지하거나 높일 때만 투자 가치가 생기며, 운영의 질을 낮춰 얻은 매출 성장은 같은 밸류에이션 가중치를 받을 수 없습니다.",
        },
        lens: {
          en: "Calculated lens",
          ko: "계산 검증",
        },
        primaryClaimIds: ["443bf1e3-b5f0-499e-89da-120159afa58a"],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        rank: 6,
      },
      {
        id: "416be183-92be-4a6d-8f10-53a6d1192d8e",
        decisionKey: "capital_intensity",
        question: {
          en: "How capital-intensive is the current growth engine?",
          ko: "현재 성장 엔진은 매출 대비 얼마나 많은 자본을 요구하나요?",
        },
        answer: {
          en: "Capital expenditure equals 2.6% of trailing revenue. The reinvestment is productive only if subsequent growth or free-cash-flow capacity rises with it; a higher ratio without that payoff should reduce the acceptable valuation multiple.",
          ko: "설비투자는 최근 12개월 매출의 2.6%입니다. 이후 성장률이나 잉여현금흐름 창출력이 함께 높아져야 생산적인 재투자이며, 성과 없이 이 비율만 상승하면 허용 가능한 밸류에이션 배수를 낮춰야 합니다.",
        },
        lens: {
          en: "Calculated lens",
          ko: "계산 검증",
        },
        primaryClaimIds: ["7effe5c1-9ce3-43b5-832d-259a99cf0025"],
        evidenceArtifactIds: [
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
          "97822eb4-085c-487d-be5d-bf0354684206",
          "2e0ca83a-c3e0-4a02-9ba6-2be04f82a548",
        ],
        rank: 7,
      },
      {
        id: "38a99017-b47b-46d8-8af4-bad200c0404d",
        decisionKey: "consensus_positioning",
        question: {
          en: "How crowded is the positive analyst view, and what does that imply for surprise risk?",
          ko: "긍정적 애널리스트 시각은 얼마나 쏠려 있으며, 이는 서프라이즈 위험에 무엇을 뜻하나요?",
        },
        answer: {
          en: "95% of 60 tracked recommendations are buys (57 buy, 2 hold, 1 sell). That crowding raises the upside-surprise hurdle and makes the stock more sensitive to even a modest estimate cut; consensus support is therefore expectation risk, not an independent buy signal.",
          ko: "추적된 60개 의견 중 매수는 95%입니다(매수 57, 중립 2, 매도 1). 긍정 의견이 몰릴수록 추가 상승을 위한 서프라이즈 기준은 높아지고 작은 추정치 하향에도 민감해지므로, 컨센서스 지지는 독립적인 매수 신호가 아니라 기대 위험으로 봐야 합니다.",
        },
        lens: {
          en: "Calculated lens",
          ko: "계산 검증",
        },
        primaryClaimIds: ["e1585c60-4e0e-4c1e-84ae-f5e3377a3adf"],
        evidenceArtifactIds: [
          "238374c7-411c-4542-822e-fa7732272be5",
          "53f3d25b-bc86-41cd-9ae2-ce8222c12867",
        ],
        rank: 8,
      },
      {
        id: "995fd15b-a1ec-4479-8c6e-e8eda17910ed",
        decisionKey: "relative_performance_decision_2",
        question: {
          en: "Which hard evidence makes the relative performance case decision-relevant now?",
          ko: "상대 성과 관점에서 지금 판단을 바꿀 만큼 강한 근거는 무엇인가요?",
        },
        answer: {
          en: "NVIDIA’s operating quality can support a premium, but its valuation leaves less room for relative underperformance: the qualified peer median P/E is 12.7x versus NVIDIA at 32.9x, a 158.5% premium. For a medium-horizon new entry, waiting for earnings confirmation is better supported than assuming further multiple expansion. Decision checkpoint: The valuation objection would be weakened if the August 26 earnings report materially exceeds the $2.0877 EPS forecast, sustains forward EPS growth, and the stock regains $227.92 with peer-relative outperformance.",
          ko: "엔비디아의 높은 운영 품질은 프리미엄을 정당화할 수 있지만 상대적 부진을 흡수할 여지는 작다. 적격 peer 중앙 P/E는 12.7배인데 엔비디아는 32.9배로 158.5% 프리미엄이다. 중기 신규 진입에서는 추가 멀티플 확장보다 실적 확인을 기다리는 쪽이 더 타당하다. 판단 변경 조건: 8월 26일 실적이 EPS 전망치 2.0877달러를 크게 상회하고 선행 EPS 성장세를 유지하면서 주가가 227.92달러를 회복하고 peer 대비 초과성과를 보이면 밸류에이션 우려는 약화된다.",
        },
        lens: {
          en: "Timing lens",
          ko: "시점·시장 검증",
        },
        primaryClaimIds: ["bf707cb0-3847-44e9-88d7-d7f410a23d2d"],
        evidenceArtifactIds: [
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
          "12dc855b-3d25-4d75-9568-d24471af8b4e",
        ],
        rank: 9,
      },
      {
        id: "cb61b424-2f1d-4876-8388-096d56b63389",
        decisionKey: "moat_falsifier_3",
        question: {
          en: "What evidence would reverse the competitive moat call before the next report?",
          ko: "다음 리포트 전이라도 경쟁 우위 판단을 뒤집을 근거는 무엇인가요?",
        },
        answer: {
          en: "The moat would be weakened if, across the next two to four filings, major deployments increasingly use competing accelerators or customer-specific silicon while NVIDIA’s data-center economics and software adoption deteriorate.",
          ko: "향후 2~4개 공시에서 주요 배포가 경쟁 가속기나 고객 맞춤형 실리콘으로 이동하고 NVIDIA의 데이터센터 경제성과 소프트웨어 채택이 악화되면 해자 주장은 약화된다.",
        },
        lens: {
          en: "Downside test",
          ko: "반대·하방 검증",
        },
        primaryClaimIds: ["816ced2a-1d24-4b93-87bb-d67b4845f648"],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
        ],
        rank: 10,
      },
    ],
    qualityScorecard: {
      evidenceCoverage: 100,
      freshnessCoverage: 0,
      rebuttalResolution: 0,
    },
    claimMatrix: [
      {
        id: "5905c8bb-e270-464a-8b41-8318dd4b6e46",
        claim: {
          en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it.",
          ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The view would be falsified if NVIDIA closes above $222.28 and outperforms the qualified peer median over the next two to four reporting periods without a material volume deterioration.",
          ko: "향후 2~4개 보고기간 동안 엔비디아가 222.28달러 위에서 마감하고 거래량 악화 없이 적격 peer 중앙값을 상회하면 이 판단은 무효화된다.",
        },
        roleOwner: "benchmark",
        decisionDimension: "relative_performance",
        decisiveMetricIds: [
          "insightsentry:provider_quote.last_price:1",
          "insightsentry:provider_quote.change_percent:2",
        ],
        evidenceArtifactIds: [
          "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "bf707cb0-3847-44e9-88d7-d7f410a23d2d",
        claim: {
          en: "NVIDIA’s operating quality can support a premium, but its valuation leaves less room for relative underperformance: the qualified peer median P/E is 12.7x versus NVIDIA at 32.9x, a 158.5% premium. For a medium-horizon new entry, waiting for earnings confirmation is better supported than assuming further multiple expansion.",
          ko: "엔비디아의 높은 운영 품질은 프리미엄을 정당화할 수 있지만 상대적 부진을 흡수할 여지는 작다. 적격 peer 중앙 P/E는 12.7배인데 엔비디아는 32.9배로 158.5% 프리미엄이다. 중기 신규 진입에서는 추가 멀티플 확장보다 실적 확인을 기다리는 쪽이 더 타당하다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
          "12dc855b-3d25-4d75-9568-d24471af8b4e",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The valuation objection would be weakened if the August 26 earnings report materially exceeds the $2.0877 EPS forecast, sustains forward EPS growth, and the stock regains $227.92 with peer-relative outperformance.",
          ko: "8월 26일 실적이 EPS 전망치 2.0877달러를 크게 상회하고 선행 EPS 성장세를 유지하면서 주가가 227.92달러를 회복하고 peer 대비 초과성과를 보이면 밸류에이션 우려는 약화된다.",
        },
        roleOwner: "benchmark",
        decisionDimension: "relative_performance",
        decisiveMetricIds: [
          "insightsentry:provider_quote.last_price:1",
          "insightsentry:provider_fundamental.earnings_per_share_diluted_ttm.value:11",
          "insightsentry:provider_fundamental.eps_estimate_ntm.value:12",
        ],
        evidenceArtifactIds: [
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
          "12dc855b-3d25-4d75-9568-d24471af8b4e",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "443bf1e3-b5f0-499e-89da-120159afa58a",
        claim: {
          en: "NVIDIA’s growth engine is increasingly full-stack AI infrastructure: Compute & Networking generated roughly $193.5 billion of FY2025 revenue, while the Portsmouth agreement secured approximately 4.25 gigawatts of future OpenAI AI-factory capacity, with optional support for another 3.8 gigawatts. This supports the growth case only if capacity becomes operational and customer deployment converts into recognized demand over the next several reporting periods.",
          ko: "NVIDIA의 성장 엔진은 풀스택 AI 인프라로 이동하고 있습니다. Compute & Networking은 FY2025 매출 약 1,935억 달러를 창출했고, Portsmouth 계약은 OpenAI의 약 4.25GW AI 팩토리 용량과 추가 3.8GW 선택권을 확보했습니다. 다만 향후 몇 개 분기 동안 실제 가동과 고객 배치가 매출로 전환되어야 성장 가설이 유지됩니다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The thesis weakens materially if the next two to four reports show revenue below the approximately $92.1 billion next-quarter forecast, declining Compute & Networking growth, or delayed/cancelled Portsmouth readiness without replacement demand.",
          ko: "향후 2~4개 보고서에서 매출이 약 921억 달러의 다음 분기 전망을 하회하거나 Compute & Networking 성장률이 둔화되고, Portsmouth 가동이 지연·취소되며 대체 수요가 없으면 가설은 크게 약화됩니다.",
        },
        roleOwner: "company",
        decisionDimension: "growth_engine",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.revenue_seg_by_business_h.value.0.segments.0.value:26",
          "insightsentry:provider_fundamental.revenue_estimate_ntm.value:23",
          "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
        ],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "de96d7bb-1322-4e18-8e3a-d96ca8863db2",
        claim: {
          en: "Management is reinforcing commercial execution and ecosystem reach: NVIDIA appointed a former Microsoft worldwide-sales executive to lead field operations, while reported TTM free cash flow of about $119.1 billion and cash plus short-term investments of about $80.6 billion provide capacity to fund platform expansion. For a new entry, this supports waiting for execution confirmation rather than paying solely for the narrative.",
          ko: "경영진은 상업적 실행력과 생태계 확장을 강화하고 있습니다. NVIDIA는 전 Microsoft 글로벌 영업 임원을 필드 운영 책임자로 영입했고, 약 1,191억 달러의 TTM 잉여현금흐름과 약 806억 달러의 현금·단기투자자산이 플랫폼 확장 재원을 제공합니다. 신규 진입자는 서사만으로 추격하기보다 실행 확인을 기다리는 편이 타당합니다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
          "97822eb4-085c-487d-be5d-bf0354684206",
        ],
        strength: "moderate",
        checkpoint: {
          en: "This supporting case fails if cash generation deteriorates while infrastructure commitments rise, or if the next earnings report misses the approximately $2.09 EPS forecast and management reduces forward capacity or demand commentary.",
          ko: "인프라 약정이 늘어나는 동안 현금창출력이 악화되거나, 다음 실적이 약 2.09달러 EPS 전망을 하회하고 경영진이 향후 생산능력·수요 전망을 낮추면 이 보조 가설은 무너집니다.",
        },
        roleOwner: "company",
        decisionDimension: "growth_engine",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.free_cash_flow_ttm.value:14",
          "insightsentry:provider_fundamental.cash_n_short_term_invest_fq.value:6",
          "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
        ],
        evidenceArtifactIds: [
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
          "97822eb4-085c-487d-be5d-bf0354684206",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "816ced2a-1d24-4b93-87bb-d67b4845f648",
        claim: {
          en: "NVIDIA’s moat is a full-stack ecosystem: CUDA, integrated GPUs, networking, and AI-factory software reduce switching friction and make deployment-scale substitution difficult; for a new entry, wait for the next two to four reports to confirm that major customer deployments continue adopting the stack without margin compression.",
          ko: "NVIDIA의 해자는 CUDA, 통합 GPU·네트워킹·AI 팩토리 소프트웨어로 구성된 풀스택 생태계이며, 전환 마찰을 낮추고 대규모 배포에서 대체를 어렵게 만든다. 신규 진입자는 향후 2~4개 보고서에서 주요 고객의 스택 채택이 마진 훼손 없이 지속되는지 확인해야 한다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The moat would be weakened if, across the next two to four filings, major deployments increasingly use competing accelerators or customer-specific silicon while NVIDIA’s data-center economics and software adoption deteriorate.",
          ko: "향후 2~4개 공시에서 주요 배포가 경쟁 가속기나 고객 맞춤형 실리콘으로 이동하고 NVIDIA의 데이터센터 경제성과 소프트웨어 채택이 악화되면 해자 주장은 약화된다.",
        },
        roleOwner: "company_competition",
        decisionDimension: "moat",
        decisiveMetricIds: [],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "e8f91311-ec22-4935-87cd-8160c9bbe4cc",
        claim: {
          en: "Competitive erosion is credible through hyperscaler silicon, AMD and other accelerators, and customer-funded infrastructure: NVIDIA’s $105 billion capped residual-value guarantees for an OpenAI campus show that ecosystem expansion can also create counterparty and utilization dependence; monitor whether committed capacity becomes revenue-generating rather than merely guaranteed.",
          ko: "경쟁 침식은 하이퍼스케일러 자체 실리콘, AMD 등 경쟁 가속기, 고객 자금 의존 인프라를 통해 현실화될 수 있다. OpenAI 캠퍼스에 대한 NVIDIA의 최대 1,050억 달러 잔존가치 보증은 생태계 확장이 거래상대방과 가동률 의존도도 높일 수 있음을 보여준다. 약정 용량이 단순 보증을 넘어 실제 매출로 전환되는지 확인해야 한다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "4bd08389-c9f2-4eae-88e8-1da4b8bea3ea",
          "4a321099-ee5b-4347-a404-15204a6e88f5",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The erosion path is confirmed if subsequent filings disclose material guarantee payments, delayed ready-for-service milestones beginning in 2028, customer migration to non-NVIDIA systems, or falling software/platform adoption despite continued infrastructure spending.",
          ko: "후속 공시에서 보증금의 중대한 지급, 2028년부터 예정된 서비스 개시 지연, 고객의 비NVIDIA 시스템 전환, 인프라 지출 지속에도 소프트웨어·플랫폼 채택 감소가 나타나면 경쟁 침식 경로가 확인된다.",
        },
        roleOwner: "company_competition",
        decisionDimension: "competitive_erosion",
        decisiveMetricIds: [],
        evidenceArtifactIds: [
          "4bd08389-c9f2-4eae-88e8-1da4b8bea3ea",
          "4a321099-ee5b-4347-a404-15204a6e88f5",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "83f2a070-8d63-4e62-8e11-73b51280d3bf",
        claim: {
          en: "The next moat milestone is verified production adoption: NVIDIA must show that large AI-factory commitments translate into deployed, revenue-producing systems and sustained use of its software stack by the next two to four reporting periods.",
          ko: "다음 해자 검증 milestone은 실제 생산 채택이다. NVIDIA는 향후 2~4개 보고기간 내 대형 AI 팩토리 약정이 배포·매출 창출 시스템과 지속적인 소프트웨어 스택 사용으로 전환됨을 보여줘야 한다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "4bd08389-c9f2-4eae-88e8-1da4b8bea3ea",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "moderate",
        checkpoint: {
          en: "This milestone fails if the next two to four filings do not disclose increasing deployed capacity, customer utilization, software adoption, or revenue contribution from the committed AI-factory infrastructure.",
          ko: "향후 2~4개 공시에서 약정 AI 팩토리 인프라의 배포 용량, 고객 가동률, 소프트웨어 채택 또는 매출 기여 증가가 공개되지 않으면 milestone은 실패한다.",
        },
        roleOwner: "company_competition",
        decisionDimension: "moat",
        decisiveMetricIds: [
          "insightsentry:provider_earnings.next_eps_forecast:94",
        ],
        evidenceArtifactIds: [
          "4bd08389-c9f2-4eae-88e8-1da4b8bea3ea",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "5538f340-5e42-47bd-81d0-3bab409d152f",
        claim: {
          en: "NVIDIA has secured a concrete production deployment path: OpenAI is contracted as tenant for approximately 4.25GW of IT load at the Portsmouth campus to deploy NVIDIA’s full-stack DSX AI factory platform, with service conditions expected from 2028. For a new entry, wait for construction and tenant-payment milestones to convert announced capacity into demonstrated utilization.",
          ko: "NVIDIA는 OpenAI를 임차인으로 확보하고 약 4.25GW IT 부하 규모의 Portsmouth 캠퍼스에서 NVIDIA의 풀스택 DSX AI 팩토리 플랫폼을 배치하는 구체적인 생산 배포 경로를 확보했다. 다만 서비스 개시 조건은 2028년부터 예상되므로, 신규 진입자는 건설 및 임차인 지급 마일스톤을 확인해 발표된 용량이 실제 사용으로 전환되는지 기다려야 한다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The thesis weakens if the 2028 ready-for-service milestone slips materially, OpenAI does not begin paying for the contracted capacity, or subsequent filings show the DSX deployment is reduced below the approximately 4.25GW commitment.",
          ko: "2028년 서비스 준비 마일스톤이 크게 지연되거나 OpenAI가 계약 용량에 대한 지급을 시작하지 않거나 후속 공시에서 DSX 배치가 약 4.25GW 약정 이하로 축소되면 이 주장은 약화된다.",
        },
        roleOwner: "company_product",
        decisionDimension: "adoption",
        decisiveMetricIds: [],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "609eefdf-a178-4c98-8444-79f196d07dfa",
        claim: {
          en: "Current economics show that AI adoption is already monetizing at exceptional scale: NVIDIA reports $253.5 billion of TTM revenue, $119.1 billion of TTM free cash flow, and 74.1% TTM gross margin. This supports valuation tolerance only if the next two to four reports sustain revenue expansion without a sharp margin or cash-conversion reversal.",
          ko: "현재 경제성은 AI 채택이 이미 예외적인 규모로 수익화되고 있음을 보여준다. NVIDIA의 TTM 매출은 2,535억 달러, TTM 잉여현금흐름은 1,190.8억 달러, TTM 매출총이익률은 74.1%다. 향후 2~4개 분기 동안 매출 증가가 지속되고 마진이나 현금전환이 급격히 악화되지 않는 경우에만 높은 밸류에이션을 용인할 수 있다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
          "97822eb4-085c-487d-be5d-bf0354684206",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The thesis weakens if TTM free-cash-flow growth stalls for two consecutive reporting periods, gross margin falls materially below 70%, or reported revenue misses the next-quarter forecast and management lowers the following outlook.",
          ko: "TTM 잉여현금흐름 증가가 2개 연속 보고기간 동안 정체되거나 매출총이익률이 70% 아래로 크게 하락하거나 다음 분기 매출이 전망을 하회하고 경영진이 후속 전망을 낮추면 이 주장은 약화된다.",
        },
        roleOwner: "company_product",
        decisionDimension: "adoption",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.total_revenue_ttm.value:35",
          "insightsentry:provider_fundamental.free_cash_flow_ttm.value:14",
          "insightsentry:provider_fundamental.gross_margin_ttm.value:16",
        ],
        evidenceArtifactIds: [
          "09bbad1e-2de3-46bf-8956-deb869e87c49",
          "97822eb4-085c-487d-be5d-bf0354684206",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "8730d876-da78-468c-86c0-9cd5a7dbd8e3",
        claim: {
          en: "NVIDIA’s margin structure currently supports premium economics: operating margin rose from 54.1% in FY2024 to 60.4% in FY2026 and reached 65.6% in the latest quarter, although the medium-term valuation case requires this durability to persist.",
          ko: "NVIDIA의 마진 구조는 현재 프리미엄 경제성을 뒷받침한다. 영업이익률은 FY2024 54.1%에서 FY2026 60.4%로 상승했고 최근 분기 65.6%에 도달했지만, 밸류에이션 정당화에는 이러한 지속성이 필요하다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The margin thesis weakens materially if operating margin falls below 55% for two consecutive reported quarters or gross-margin compression exceeds five percentage points year over year.",
          ko: "영업이익률이 두 개의 연속 공시 분기에서 55% 아래로 하락하거나 매출총이익률이 전년 대비 5%포인트 이상 하락하면 마진 가설은 크게 약화된다.",
        },
        roleOwner: "financial",
        decisionDimension: "margin",
        decisiveMetricIds: [
          "operating_margin_annual:FY:2024-01-28",
          "operating_margin_annual:FY:2026-01-25",
          "operating_margin_quarter:Q:2026-04-26",
        ],
        evidenceArtifactIds: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "7effe5c1-9ce3-43b5-832d-259a99cf0025",
        claim: {
          en: "Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
          ko: "재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
          "97822eb4-085c-487d-be5d-bf0354684206",
          "2e0ca83a-c3e0-4a02-9ba6-2be04f82a548",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The reinvestment thesis weakens if quarterly free-cash-flow conversion remains below 80% of operating cash flow for two quarters while contractual guarantees become probable or require material cash payments.",
          ko: "분기 잉여현금흐름 전환율이 두 분기 연속 영업현금흐름의 80% 아래에 머물고 계약상 보증의 지급 가능성이 높아지거나 상당한 현금 지급이 발생하면 재투자 가설은 약화된다.",
        },
        roleOwner: "financial",
        decisionDimension: "reinvestment",
        decisiveMetricIds: [
          "sec:us-gaap:NetCashProvidedByUsedInOperatingActivities:USD:0001045810-26-000052:2026-01-26:2026-04-26:15507",
          "insightsentry:provider_fundamental.free_cash_flow_fq.value:13",
          "insightsentry:provider_fundamental.capital_expenditures_fq.value:4",
        ],
        evidenceArtifactIds: [
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
          "97822eb4-085c-487d-be5d-bf0354684206",
          "2e0ca83a-c3e0-4a02-9ba6-2be04f82a548",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "cedc1548-2a5a-4649-805d-775761ac0f8b",
        claim: {
          en: "NVIDIA’s reported earnings continue to convert into substantial cash, but conversion has weakened: FY2026 operating cash flow was 85.6% of net income and Q1 FY2027 was 86.3%, so valuation support depends on sustaining cash generation rather than accounting earnings alone.",
          ko: "NVIDIA의 보고 이익은 여전히 상당한 현금으로 전환되지만 전환율은 약화됐다. FY2026 영업현금흐름은 순이익의 85.6%, FY2027 1분기는 86.3%였으므로 밸류에이션은 회계이익보다 지속적인 현금창출에 달려 있다.",
        },
        verdict: "not_assessable",
        sourceCount: 3,
        sourceRefs: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "unverified",
        checkpoint: {
          en: "The thesis weakens if operating cash flow remains below 80% of net income for two consecutive quarters or if receivables and inventory grow materially faster than revenue without a corresponding cash-flow recovery.",
          ko: "두 분기 연속 영업현금흐름이 순이익의 80%를 밑돌거나, 현금흐름 회복 없이 매출채권과 재고가 매출보다 크게 빠르게 증가하면 이 주장은 약화된다.",
        },
        roleOwner: "financial_quality",
        decisionDimension: "cash_conversion",
        decisiveMetricIds: [
          "cash_conversion_annual:FY:2026-01-25",
          "cash_conversion_quarter:Q:2026-04-26",
        ],
        evidenceArtifactIds: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "16638dcb-30ff-488e-81c2-861356dc1da8",
        claim: {
          en: "Balance-sheet liquidity is strong, but working-capital intensity and dilution require monitoring: Q1 FY2027 cash flow was $50.3B versus $48.6B of provider-reported free cash flow, while quarterly diluted shares declined modestly and stock compensation remained material.",
          ko: "대차대조표 유동성은 강하지만 운전자본 부담과 희석을 점검해야 한다. FY2027 1분기 현금흐름은 503억 달러, 제공업체 기준 잉여현금흐름은 486억 달러였고, 희석주식수는 소폭 감소했지만 주식보상은 여전히 중요하다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "97822eb4-085c-487d-be5d-bf0354684206",
          "2e0ca83a-c3e0-4a02-9ba6-2be04f82a548",
          "9dca57b0-e4a8-42b6-bdd9-c3737c835298",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The concern is confirmed if accounts receivable rises above 20% of quarterly revenue for two reporting periods, free cash flow falls below 75% of operating cash flow, or diluted shares reverse into sustained year-over-year growth above 3%.",
          ko: "매출채권이 두 보고기간 연속 분기 매출의 20%를 넘거나, 잉여현금흐름이 영업현금흐름의 75% 아래로 하락하거나, 희석주식수가 3%를 넘는 지속적인 전년 대비 증가로 전환되면 우려가 확인된다.",
        },
        roleOwner: "financial_quality",
        decisionDimension: "cash_conversion",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.free_cash_flow_fq.value:13",
          "insightsentry:provider_fundamental.accounts_receivables_net_fq.value:36",
          "insightsentry:provider_fundamental.diluted_shares_outstanding_fq.value:8",
        ],
        evidenceArtifactIds: [
          "97822eb4-085c-487d-be5d-bf0354684206",
          "2e0ca83a-c3e0-4a02-9ba6-2be04f82a548",
          "9dca57b0-e4a8-42b6-bdd9-c3737c835298",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "303e5a0f-da6f-402e-83d7-10cd5be1faf0",
        claim: {
          en: "NVIDIA’s price regime is conflicted: daily trend remains above its 20-, 50-, and 200-day averages, but hourly momentum is bearish and price sits near $214.50 support. For a new entry, wait for a close above $220.65 with volume confirmation; a break below $212.87 would weaken the market view.",
          ko: "엔비디아의 가격 국면은 혼조다. 일간 가격은 20·50·200일 이동평균 위에 있지만 시간봉 모멘텀은 약세이며 약 214.50달러 지지선에 있다. 신규 진입은 거래량 동반 220.65달러 상회 확인을 기다리고, 212.87달러 하회는 시장 견해를 약화시키는 신호다.",
        },
        verdict: "entailed",
        sourceCount: 1,
        sourceRefs: ["d3d53578-3ad1-487b-838f-8e4e8b59a65b"],
        strength: "moderate",
        checkpoint: {
          en: "A sustained close below $212.87, especially with volume above the 20-period average, would invalidate the constructive price-regime view.",
          ko: "20기간 평균을 웃도는 거래량과 함께 212.87달러 아래에서 지속 종가가 형성되면 긍정적 가격 국면 견해가 무효화된다.",
        },
        roleOwner: "market",
        decisionDimension: "regime",
        decisiveMetricIds: ["insightsentry:provider_quote.last_price:1"],
        evidenceArtifactIds: ["d3d53578-3ad1-487b-838f-8e4e8b59a65b"],
        counterevidenceArtifactIds: [],
      },
      {
        id: "f1830d55-90e8-49a6-860e-06fd66671a0e",
        claim: {
          en: "The macro backdrop is a valuation headwind rather than a demand collapse: the 10-year Treasury yield was 4.74%, core CPI continued rising through June, and wages increased to $37.64 per hour. Higher discount rates and sticky service costs leave less tolerance for NVIDIA’s premium multiple.",
          ko: "거시 환경은 수요 붕괴보다 밸류에이션 역풍에 가깝다. 10년물 국채금리는 4.74%였고 근원 CPI는 6월까지 상승했으며 시간당 임금은 37.64달러로 올랐다. 높은 할인율과 끈적한 비용은 엔비디아의 프리미엄 멀티플 허용도를 낮춘다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
          "0d93a3fc-9b45-48a2-b48e-ceedb5146290",
        ],
        strength: "moderate",
        checkpoint: {
          en: "A sustained decline in the 10-year yield below 4.25% alongside easing core CPI would remove this valuation headwind.",
          ko: "10년물 금리가 4.25% 아래로 지속 하락하고 근원 CPI도 둔화되면 이 밸류에이션 역풍은 약화된다.",
        },
        roleOwner: "market",
        decisionDimension: "regime",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.eps_estimate_ntm.value:12",
        ],
        evidenceArtifactIds: [
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
          "0d93a3fc-9b45-48a2-b48e-ceedb5146290",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "a647bbc8-3518-4739-8383-aad5a49fa0ac",
        claim: {
          en: "The decisive near-term catalyst is NVIDIA’s August 26 earnings release. A bullish market confirmation requires upside to the $92.06 billion next-quarter revenue forecast and constructive China commentary, followed by a break above $220.65; failure to hold $214.50 after the release would signal that expectations remain too high.",
          ko: "가장 중요한 단기 촉매는 8월 26일 실적 발표다. 강세 확인에는 920.6억 달러의 다음 분기 매출 전망 상회와 긍정적인 중국 관련 발언, 그리고 220.65달러 돌파가 필요하다. 발표 후 214.50달러를 지키지 못하면 기대치가 과도하다는 신호다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
          "d3d53578-3ad1-487b-838f-8e4e8b59a65b",
        ],
        strength: "moderate",
        checkpoint: {
          en: "An earnings reaction that exceeds guidance, holds above $220.65 on above-average volume, and sustains the move for several sessions would falsify the wait-for-confirmation stance.",
          ko: "실적 발표 후 가이던스를 웃돌고 평균 이상 거래량으로 220.65달러 위를 유지하며 수 거래일 상승이 지속되면 확인 대기 관점은 무효화된다.",
        },
        roleOwner: "market",
        decisionDimension: "catalyst",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
          "insightsentry:provider_earnings.next_eps_forecast:94",
        ],
        evidenceArtifactIds: [
          "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
          "d3d53578-3ad1-487b-838f-8e4e8b59a65b",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "090cbb1d-b08d-4230-84b3-cf82e4c74e3e",
        claim: {
          en: "NVIDIA’s medium-term structure is mixed: price at $214.72 sits near $214.50 support, below the 1-hour 20/50-hour averages and the 4-hour 20-period average, while remaining above the 4-hour 50-period and daily 20/50-period averages; the August 26 earnings release is the next decisive catalyst. A sustained break below $211.45–$212.87 would weaken the constructive medium-term case, while a move above $227.92 would restore broader upside confirmation.",
          ko: "엔비디아의 중기 구조는 혼조세다. 주가는 $214.72로 $214.50 지지선 부근에 있으며 1시간 20·50기간 이동평균과 4시간 20기간 이동평균을 밑돌지만, 4시간 50기간 및 일간 20·50기간 이동평균은 웃돌고 있다. 8월 26일 실적 발표가 다음 핵심 촉매다. $211.45~$212.87 아래에서 지속 하락하면 중기 강세 논리가 약화되고, $227.92 상향 돌파는 broader 상승 확인 신호가 된다.",
        },
        verdict: "entailed",
        sourceCount: 2,
        sourceRefs: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
        ],
        strength: "strong",
        checkpoint: {
          en: "This timing assessment is falsified if NVDA closes above $227.92 with expanding volume and improving 4-hour momentum, or if it closes below $211.45 and fails to reclaim that level after earnings.",
          ko: "엔비디아가 거래량 증가와 4시간 모멘텀 개선을 동반해 $227.92 위에서 마감하거나, 실적 발표 후 $211.45 아래에서 마감하고 해당 수준을 회복하지 못하면 이 타이밍 판단은 무효화된다.",
        },
        roleOwner: "market_news",
        decisionDimension: "timing",
        decisiveMetricIds: ["insightsentry:provider_quote.last_price:1"],
        evidenceArtifactIds: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "83b15a03-f7cb-44b1-8efd-27a6199bad69",
        claim: {
          en: "Momentum and volume do not yet confirm a durable rebound: 1-hour RSI is 32.92 with negative MACD, while 4-hour RSI is 43.64, MACD is below its signal, and volume is only 0.57x its 20-period average; the recent close also fell 0.98% to $214.72. Confirmation would require recovery through $220.65–$227.92 on stronger volume, especially after the August 26 earnings event.",
          ko: "모멘텀과 거래량은 아직 지속적인 반등을 확인하지 않는다. 1시간 RSI는 32.92, MACD는 음수이고, 4시간 RSI는 43.64이며 MACD가 시그널 아래에 있고 거래량은 20기간 평균의 0.57배에 불과하다. 최근 종가는 0.98% 하락한 $214.72였다. 확인 신호는 8월 26일 실적 발표 이후 특히 거래량 증가와 함께 $220.65~$227.92를 회복하는 것이다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
        ],
        strength: "moderate",
        checkpoint: {
          en: "This momentum caution is falsified if 4-hour RSI rises above 50, MACD crosses above its signal, and volume exceeds its 20-period average while price holds above $220.65.",
          ko: "4시간 RSI가 50을 넘고 MACD가 시그널을 상향 돌파하며 거래량이 20기간 평균을 웃도는 동시에 주가가 $220.65 위를 유지하면 이 모멘텀 경계 판단은 무효화된다.",
        },
        roleOwner: "market_news",
        decisionDimension: "timing",
        decisiveMetricIds: [
          "insightsentry:provider_quote.last_price:1",
          "insightsentry:provider_quote.change_percent:2",
        ],
        evidenceArtifactIds: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "2093ee05-1a4f-4363-8e36-9c6a93572708",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "e1585c60-4e0e-4c1e-84ae-f5e3377a3adf",
        claim: {
          en: "The highest-impact downside is counterparty and infrastructure concentration: NVIDIA guaranteed up to $105 billion of residual lease value tied to OpenAI’s 4.25GW Ohio campus, so OpenAI default or project underperformance could transmit into large contingent payments, asset-reletting losses, and valuation compression despite NVIDIA’s net cash buffer; a new entry should wait for lease conditions, OpenAI payment performance, and disclosed exposure to become clearer.",
          ko: "가장 큰 하방 위험은 거래상대방 및 인프라 집중이다. NVIDIA는 OpenAI의 오하이오 4.25GW 캠퍼스와 연계된 최대 1,050억 달러의 잔존 임대가치를 보증했으므로, OpenAI의 채무불이행이나 프로젝트 부진은 순현금 완충에도 불구하고 대규모 우발지급, 재임대 손실, 밸류에이션 압박으로 전이될 수 있다. 신규 진입은 임대 조건, OpenAI 지급 이행, 관련 노출이 명확해질 때까지 기다리는 것이 합리적이다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "238374c7-411c-4542-822e-fa7732272be5",
          "53f3d25b-bc86-41cd-9ae2-ce8222c12867",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The risk thesis weakens if the upcoming 10-Q shows the guarantees are substantially reduced or collateralized, OpenAI maintains payments and credit quality, and the Ohio campus reaches ready-for-service milestones without material NVIDIA cash outflows.",
          ko: "다음 10-Q에서 보증 규모가 크게 축소되거나 담보화되고, OpenAI가 지급 및 신용등급을 유지하며, 오하이오 캠퍼스가 NVIDIA의 유의미한 현금 유출 없이 ready-for-service 조건을 충족하면 이 위험 가설은 약화된다.",
        },
        roleOwner: "risk",
        decisionDimension: "downside_path",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.net_debt_fq.value:17",
          "insightsentry:provider_fundamental.cash_n_short_term_invest_fq.value:6",
          "insightsentry:provider_fundamental.market_cap_basic.value:38",
        ],
        evidenceArtifactIds: [
          "238374c7-411c-4542-822e-fa7732272be5",
          "53f3d25b-bc86-41cd-9ae2-ce8222c12867",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "3e2bc131-f2b7-44af-8b42-7498c3a0ba4d",
        claim: {
          en: "The earliest measurable warning signal is the August 26 earnings release: a miss or weaker forward revenue outlook against the approximately $92.1 billion next-quarter forecast would indicate that AI infrastructure demand is not absorbing the company’s capacity and contingent commitments; investors should track revenue guidance, accounts receivable, inventory, and gross margin together.",
          ko: "가장 이른 측정 가능 경고 신호는 8월 26일 실적 발표다. 약 921억 달러의 다음 분기 매출 전망을 하회하거나 전망이 약화되면 AI 인프라 수요가 회사의 생산능력과 우발적 약정을 흡수하지 못한다는 신호가 될 수 있다. 매출 가이던스, 매출채권, 재고, 총마진을 함께 확인해야 한다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "d3d53578-3ad1-487b-838f-8e4e8b59a65b",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The warning signal is disproven if August 26 revenue guidance exceeds $92.1 billion, gross margin remains near current levels, and receivables and inventory grow no faster than revenue over the next two reporting periods.",
          ko: "8월 26일 매출 가이던스가 921억 달러를 상회하고, 총마진이 현재 수준에 가깝게 유지되며, 향후 두 번의 보고기간 동안 매출채권과 재고 증가율이 매출 증가율을 넘지 않으면 이 경고 신호는 반증된다.",
        },
        roleOwner: "risk",
        decisionDimension: "leading_indicator",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.revenue_forecast_next_fq.value:24",
          "insightsentry:provider_fundamental.accounts_receivables_net_fq.value:36",
          "insightsentry:provider_fundamental.total_inventory_fq.value:48",
        ],
        evidenceArtifactIds: [
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "d3d53578-3ad1-487b-838f-8e4e8b59a65b",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "41da6711-15a7-4257-8490-1fd0f3d88b3e",
        claim: {
          en: "Valuation magnifies any operating disappointment: at $214.72 per share, NVIDIA trades at roughly 32.9 times trailing earnings versus a qualified peer median of 12.7 times, so a demand or margin reset can reduce both earnings and the multiple; the recovery condition is sustained revenue growth with gross margin near 70% or higher and no increase in contingent-liability disclosures.",
          ko: "밸류에이션은 영업 실망을 확대한다. 주당 214.72달러에서 NVIDIA의 최근 12개월 이익 배수는 약 32.9배로, 적격 peer 중앙값 12.7배보다 높다. 따라서 수요나 마진이 재설정되면 이익과 배수가 동시에 하락할 수 있다. 회복 조건은 매출 성장 지속, 70% 이상에 가까운 총마진, 우발부채 공시 증가 없음이다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The valuation downside path weakens if the next two reporting periods deliver revenue above guidance, NTM EPS remains at or above $10.06, gross margin stays at least 70%, and the market continues valuing the shares above 30 times forward earnings.",
          ko: "향후 두 보고기간 동안 매출이 가이던스를 상회하고, NTM EPS가 10.06달러 이상을 유지하며, 총마진이 70% 이상이고, 시장이 주식을 선행 이익 30배 이상으로 계속 평가하면 이 밸류에이션 하방 경로는 약화된다.",
        },
        roleOwner: "risk",
        decisionDimension: "downside_path",
        decisiveMetricIds: [
          "insightsentry:provider_quote.last_price:1",
          "insightsentry:provider_fundamental.earnings_per_share_diluted_ttm.value:11",
          "insightsentry:provider_fundamental.gross_margin_ttm.value:16",
        ],
        evidenceArtifactIds: [
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "1b6c8a66-c282-4ba5-8a66-c8addbb32333",
        claim: {
          en: "NVIDIA has substantial liquidity and contractual recovery rights that can absorb a policy or customer shock, but its new Portsmouth commitments create a contingent downside path: an OpenAI default could leave NVIDIA exposed to up to $105 billion of residual-value guarantees before reimbursement or asset recovery. For a new entry, require the upcoming 10-Q to quantify the guarantees and monitor OpenAI credit quality, lease readiness, and replacement-value coverage.",
          ko: "NVIDIA는 상당한 유동성과 계약상 회수권을 보유해 정책 또는 고객 충격을 흡수할 수 있지만, Portsmouth 약정은 새로운 하방 경로를 만든다. OpenAI가 채무불이행하면 상환 또는 자산 회수 전 NVIDIA가 최대 1,050억 달러의 잔존가치 보증에 노출될 수 있다. 신규 진입자는 다음 10-Q의 보증 규모, OpenAI 신용도, 임대 개시 조건 및 대체가치 보전 여부를 확인해야 한다.",
        },
        verdict: "partial",
        sourceCount: 2,
        sourceRefs: [
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "238374c7-411c-4542-822e-fa7732272be5",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The next 10-Q shows no material increase in guarantee exposure, OpenAI obtains satisfactory credit quality, and lease-level replacement values cover obligations without NVIDIA cash outflow.",
          ko: "다음 10-Q에서 보증 노출이 중요하게 증가하지 않고 OpenAI의 신용도가 만족 기준을 충족하며, 임대별 대체가치가 NVIDIA의 현금 유출 없이 의무를 충당하면 이 주장은 약화된다.",
        },
        roleOwner: "risk_policy",
        decisionDimension: "mitigant",
        decisiveMetricIds: [],
        evidenceArtifactIds: [
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "238374c7-411c-4542-822e-fa7732272be5",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "18f913d6-2377-4cea-8bc3-9301ee85f50b",
        claim: {
          en: "The earliest policy warning signal is a formal expansion of U.S. export controls from physical-chip shipments to overseas cloud access; that would transmit through lost China-linked compute demand and a higher discount rate. NVIDIA already assumes no China data-center compute revenue in its near-term outlook, so the next decisive confirmation is whether regulators impose cloud-access restrictions or NVIDIA discloses incremental customer-screening costs.",
          ko: "가장 이른 정책 경고 신호는 미국 수출통제가 실물 칩 선적에서 해외 클라우드 접근으로 확대되는 것이다. 이는 중국 관련 컴퓨팅 수요 감소와 할인율 상승으로 전이된다. NVIDIA는 이미 단기 전망에서 중국 데이터센터 컴퓨팅 매출을 제외하고 있으므로, 다음 확인 지표는 규제당국의 클라우드 접근 제한 또는 NVIDIA가 공시하는 추가 고객심사 비용이다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "a892fbb7-15d8-4f23-b1bc-79c66e93336c",
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "53f3d25b-bc86-41cd-9ae2-ce8222c12867",
        ],
        strength: "moderate",
        checkpoint: {
          en: "Within the next two reporting periods, no cloud-access rule is adopted, China-exposed revenue remains immaterial, and customer-screening costs do not increase materially.",
          ko: "향후 두 번의 실적 발표 동안 클라우드 접근 규제가 도입되지 않고 중국 노출 매출이 중요하지 않으며 고객심사 비용도 유의미하게 증가하지 않으면 이 경로는 약화된다.",
        },
        roleOwner: "risk_policy",
        decisionDimension: "leading_indicator",
        decisiveMetricIds: [
          "insightsentry:provider_earnings.next_eps_forecast:94",
        ],
        evidenceArtifactIds: [
          "a892fbb7-15d8-4f23-b1bc-79c66e93336c",
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "53f3d25b-bc86-41cd-9ae2-ce8222c12867",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "e753f502-22a7-469d-88be-ffb404d51243",
        claim: {
          en: "NVIDIA’s recovery capacity is strengthened by ecosystem expansion and executive commercial continuity: the company appointed a Microsoft veteran to lead worldwide field operations while pursuing large AI-campus commitments. Recovery from a policy or macro shock would be more credible if the next two to four reports preserve demand, margin, and cash generation while management converts capacity into diversified tenants and end markets.",
          ko: "NVIDIA는 생태계 확장과 영업 리더십 연속성으로 정책·거시 충격 이후 회복 역량을 높였다. Microsoft 출신 임원을 전세계 영업 책임자로 임명했고 대형 AI 캠퍼스 약정을 추진 중이다. 향후 2~4개 분기에서 수요·마진·현금창출을 유지하고 다양한 임차인과 최종시장으로 용량을 전환하면 회복 논리가 강화된다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "31e71ecf-dc5c-45d9-aa6d-be9ad40ac8c6",
        ],
        strength: "moderate",
        checkpoint: {
          en: "Over the next two to four reports, revenue or EPS misses recur, operating margins contract materially, or new capacity remains concentrated in OpenAI-related commitments without diversified paying tenants.",
          ko: "향후 2~4개 분기에서 매출 또는 EPS 미스가 반복되고 영업마진이 크게 하락하거나 신규 용량이 다양한 유료 임차인 없이 OpenAI 관련 약정에 집중되면 회복 조건은 충족되지 않는다.",
        },
        roleOwner: "risk_policy",
        decisionDimension: "mitigant",
        decisiveMetricIds: [
          "insightsentry:provider_earnings.eps_actual:93",
          "insightsentry:provider_earnings.next_eps_forecast:94",
        ],
        evidenceArtifactIds: [
          "4a321099-ee5b-4347-a404-15204a6e88f5",
          "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
          "31e71ecf-dc5c-45d9-aa6d-be9ad40ac8c6",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "b3d5dc44-48ec-4b70-848f-d4e238e84829",
        claim: {
          en: "NVIDIA’s valuation is demanding but not detached from operating momentum: the price implies roughly 21x NTM EPS while NTM revenue is about 75% above TTM revenue and the latest quarterly operating margin was 65.6%. For a medium-horizon entry, the next two to four reports must validate continued high growth without material margin compression.",
          ko: "NVIDIA의 밸류에이션은 높지만 실적 모멘텀과 완전히 동떨어져 있지는 않다. 주가는 NTM EPS 기준 약 21배를 반영하며, NTM 매출은 TTM 대비 약 75% 높고 최근 분기 영업이익률은 65.6%였다. 중기 신규 진입에서는 향후 2~4개 분기 동안 높은 성장 지속과 의미 있는 마진 하락 부재를 확인해야 한다.",
        },
        verdict: "partial",
        sourceCount: 3,
        sourceRefs: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        strength: "moderate",
        checkpoint: {
          en: "The thesis weakens if the next two reported quarters show revenue growth below 30% year over year or operating margin below 60% while NTM EPS estimates fail to rise.",
          ko: "향후 두 개 분기에서 매출 성장률이 전년 대비 30% 아래로 떨어지거나 영업이익률이 60% 아래로 하락하고 NTM EPS 추정치도 상승하지 않으면 이 주장은 약화된다.",
        },
        roleOwner: "valuation",
        decisionDimension: "embedded_expectations",
        decisiveMetricIds: [
          "insightsentry:provider_quote.last_price:1",
          "insightsentry:provider_fundamental.eps_estimate_ntm.value:12",
          "insightsentry:provider_fundamental.revenue_estimate_ntm.value:23",
        ],
        evidenceArtifactIds: [
          "9aa52720-3781-4d46-8b61-238500ec73c3",
          "5b489b3f-ccfa-4065-ace9-f947c5717bac",
          "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        ],
        counterevidenceArtifactIds: [],
      },
      {
        id: "b7a23d8b-c9c5-4007-8fb9-6d29d5a1775b",
        claim: {
          en: "Relative valuation leaves limited margin of safety: NVIDIA trades at 32.9x TTM earnings versus the qualified peer median of 12.7x, a 158.5% premium. That premium can be justified only by sustained superior growth and margins; absent upward earnings revisions, waiting for a better valuation cushion is warranted for a new entry.",
          ko: "상대 밸류에이션상 안전마진은 제한적이다. NVIDIA는 TTM 이익의 32.9배로 거래되어 적격 peer median 12.7배 대비 158.5% 프리미엄이다. 이 프리미엄은 지속적인 성장·마진 우위로만 정당화될 수 있으므로, 이익 추정치 상향이 없으면 신규 진입자는 더 나은 밸류에이션 여유를 기다릴 근거가 있다.",
        },
        verdict: "entailed",
        sourceCount: 2,
        sourceRefs: [
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
          "12dc855b-3d25-4d75-9568-d24471af8b4e",
        ],
        strength: "strong",
        checkpoint: {
          en: "The relative-valuation objection weakens if NVIDIA sustains at least 30% revenue growth, operating margin above 60%, and repeated upward revisions to NTM EPS across the next two to four reporting periods.",
          ko: "향후 2~4개 분기 동안 매출 성장률 30% 이상, 영업이익률 60% 초과, NTM EPS의 반복적인 상향 조정이 확인되면 상대 밸류에이션 우려는 약화된다.",
        },
        roleOwner: "valuation",
        decisionDimension: "embedded_expectations",
        decisiveMetricIds: [
          "insightsentry:provider_fundamental.earnings_per_share_diluted_ttm.value:11",
          "insightsentry:provider_fundamental.market_cap_basic.value:38",
        ],
        evidenceArtifactIds: [
          "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
          "12dc855b-3d25-4d75-9568-d24471af8b4e",
        ],
        counterevidenceArtifactIds: [],
      },
    ],
    evidenceIndex: [
      {
        id: "11e0ccf9-fb0d-48a9-abd6-fa9f684c3e23",
        publisher: "InsightSentry via RapidAPI",
        title: "insightsentry:calendar",
        sourceClass: "insightsentry_rapidapi",
        url: "https://insightsentry.com/docs",
        observedAt: "2026-08-22T09:50:15.874Z",
      },
      {
        id: "d3b33079-fc88-4631-89f4-ae8a455d2a9b",
        publisher: "InsightSentry via RapidAPI",
        title: "insightsentry:peers",
        sourceClass: "insightsentry_rapidapi",
        url: "https://insightsentry.com/docs",
        observedAt: "2026-08-22T09:50:15.874Z",
      },
      {
        id: "12dc855b-3d25-4d75-9568-d24471af8b4e",
        publisher: "InsightSentry via RapidAPI",
        title: "insightsentry:quote",
        sourceClass: "insightsentry_rapidapi",
        url: "https://insightsentry.com/docs",
        observedAt: "2026-08-22T09:50:15.874Z",
      },
      {
        id: "5b489b3f-ccfa-4065-ace9-f947c5717bac",
        publisher: "U.S. Securities and Exchange Commission",
        title: "filing:0001045810-26-000021",
        sourceClass: "sec_primary_filing",
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm",
        observedAt: "2026-02-25T21:42:19.000Z",
      },
      {
        id: "85e7102b-36a7-44dd-8a4b-19d9f17f7d58",
        publisher: "U.S. Securities and Exchange Commission",
        title: "filing:0001045810-26-000052",
        sourceClass: "sec_primary_filing",
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000052/nvda-20260426.htm",
        observedAt: "2026-05-20T20:35:52.000Z",
      },
      {
        id: "09bbad1e-2de3-46bf-8956-deb869e87c49",
        publisher: "U.S. Securities and Exchange Commission",
        title: "filing:0001045810-26-000060",
        sourceClass: "sec_primary_filing",
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000060/nvda-20260628.htm",
        observedAt: "2026-07-02T13:23:16.000Z",
      },
      {
        id: "97822eb4-085c-487d-be5d-bf0354684206",
        publisher: "U.S. Securities and Exchange Commission",
        title: "filing:0001045810-26-000069",
        sourceClass: "sec_primary_filing",
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000069/nvda-20260817.htm",
        observedAt: "2026-08-17T12:41:33.000Z",
      },
      {
        id: "4bd08389-c9f2-4eae-88e8-1da4b8bea3ea",
        publisher: "InsightSentry via RapidAPI",
        title: "insightsentry:news:company",
        sourceClass: "insightsentry_rapidapi",
        url: "https://insightsentry.com/docs",
        observedAt: "2026-08-22T09:50:15.874Z",
      },
      {
        id: "9aa52720-3781-4d46-8b61-238500ec73c3",
        publisher: "U.S. Securities and Exchange Commission",
        title: "facts:current",
        sourceClass: "sec_company_facts",
        url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json",
        observedAt: "2026-02-25T21:42:19.000Z",
      },
      {
        id: "2e0ca83a-c3e0-4a02-9ba6-2be04f82a548",
        publisher: "U.S. Securities and Exchange Commission",
        title: "filing:0001197647-26-000005",
        sourceClass: "sec_primary_filing",
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000119764726000005/wk-form4_1783371701.xml",
        observedAt: "2026-07-06T21:01:46.000Z",
      },
      {
        id: "9dca57b0-e4a8-42b6-bdd9-c3737c835298",
        publisher: "U.S. Securities and Exchange Commission",
        title: "filing:0001197647-26-000007",
        sourceClass: "sec_primary_filing",
        url: "https://www.sec.gov/Archives/edgar/data/1045810/000119764726000007/wk-form4_1786135642.xml",
        observedAt: "2026-08-07T20:47:24.000Z",
      },
      {
        id: "d3d53578-3ad1-487b-838f-8e4e8b59a65b",
        publisher: "U.S. Bureau of Labor Statistics",
        title: "macro:cpi",
        sourceClass: "bls_allowlist",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        observedAt: "2026-08-22T09:50:07.429Z",
      },
      {
        id: "2093ee05-1a4f-4363-8e36-9c6a93572708",
        publisher: "InsightSentry via RapidAPI",
        title: "insightsentry:technical",
        sourceClass: "insightsentry_rapidapi",
        url: "https://insightsentry.com/docs",
        observedAt: "2026-08-22T09:50:15.874Z",
      },
      {
        id: "0d93a3fc-9b45-48a2-b48e-ceedb5146290",
        publisher: "U.S. Bureau of Labor Statistics",
        title: "macro:average-hourly-earnings",
        sourceClass: "bls_allowlist",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        observedAt: "2026-08-22T09:50:07.429Z",
      },
      {
        id: "238374c7-411c-4542-822e-fa7732272be5",
        publisher: "U.S. Department of the Treasury",
        title: "macro:treasury",
        sourceClass: "treasury_yield",
        url: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv",
        observedAt: "2026-08-22T09:50:07.429Z",
      },
      {
        id: "53f3d25b-bc86-41cd-9ae2-ce8222c12867",
        publisher: "U.S. Bureau of Labor Statistics",
        title: "macro:unemployment",
        sourceClass: "bls_allowlist",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        observedAt: "2026-08-22T09:50:07.429Z",
      },
      {
        id: "09c1f1b4-3e86-481d-8400-cac0fde0c51b",
        publisher: "U.S. Bureau of Labor Statistics",
        title: "macro:producer-prices",
        sourceClass: "bls_allowlist",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        observedAt: "2026-08-22T09:50:07.429Z",
      },
      {
        id: "a892fbb7-15d8-4f23-b1bc-79c66e93336c",
        publisher: "U.S. Bureau of Labor Statistics",
        title: "macro:nonfarm-payrolls",
        sourceClass: "bls_allowlist",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        observedAt: "2026-08-22T09:50:07.429Z",
      },
      {
        id: "31e71ecf-dc5c-45d9-aa6d-be9ad40ac8c6",
        publisher: "InsightSentry via RapidAPI",
        title: "insightsentry:news:risk",
        sourceClass: "insightsentry_rapidapi",
        url: "https://insightsentry.com/docs",
        observedAt: "2026-08-22T09:50:15.874Z",
      },
      {
        id: "023b768e-9cb7-4127-99bd-d441a49635d7",
        publisher: "market_news",
        title: "memo:market_news",
        sourceClass: "memo",
      },
      {
        id: "58aab424-2ac7-45c0-8f1d-17e54dc6072e",
        publisher: "financial_quality",
        title: "memo:financial_quality",
        sourceClass: "memo",
      },
      {
        id: "4ee636ed-0359-4605-bc07-2d054ee1704a",
        publisher: "market",
        title: "memo:market",
        sourceClass: "memo",
      },
      {
        id: "3a57620f-3881-46bf-adc2-11c5e224bad4",
        publisher: "benchmark",
        title: "memo:benchmark",
        sourceClass: "memo",
      },
      {
        id: "1eecc0cd-15b8-4b2f-8665-7e447641e9c4",
        publisher: "company_competition",
        title: "memo:company_competition",
        sourceClass: "memo",
      },
      {
        id: "71d1236e-9ead-42e5-be77-61d736c81faf",
        publisher: "market",
        title: "challenge:market",
        sourceClass: "blind_challenge",
      },
      {
        id: "c2cdd6a2-79f3-4404-b314-ad41a62c6f4f",
        publisher: "financial",
        title: "memo:financial",
        sourceClass: "memo",
      },
      {
        id: "63625205-6c17-4de4-969f-eae94bf42ac6",
        publisher: "risk",
        title: "challenge:risk",
        sourceClass: "blind_challenge",
      },
    ],
    coverage: [
      {
        label: "insightsentry calendar",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "",
      },
      {
        label: "insightsentry peers",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "",
      },
      {
        label: "insightsentry quote",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "2026-08-21–2026-08-21",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "insightsentry news company",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "",
      },
      {
        label: "insightsentry request ledger",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "sec filing",
        provider: "U.S. Securities and Exchange Commission",
        status: "available",
        period: "",
      },
      {
        label: "macro",
        provider: "U.S. Bureau of Labor Statistics",
        status: "available",
        period: "",
      },
      {
        label: "market bars",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "2022-08-26–2026-08-21",
      },
      {
        label: "macro",
        provider: "U.S. Bureau of Labor Statistics",
        status: "available",
        period: "",
      },
      {
        label: "treasury",
        provider: "U.S. Department of the Treasury",
        status: "available",
        period: "",
      },
      {
        label: "macro",
        provider: "U.S. Bureau of Labor Statistics",
        status: "available",
        period: "",
      },
      {
        label: "macro",
        provider: "U.S. Bureau of Labor Statistics",
        status: "available",
        period: "",
      },
      {
        label: "macro",
        provider: "U.S. Bureau of Labor Statistics",
        status: "available",
        period: "",
      },
      {
        label: "insightsentry news risk",
        provider: "InsightSentry via RapidAPI",
        status: "available",
        period: "",
      },
      {
        label: "department consolidation",
        provider: "market",
        status: "available",
        period: "",
      },
      {
        label: "department consolidation",
        provider: "company",
        status: "available",
        period: "",
      },
      {
        label: "department consolidation",
        provider: "financial",
        status: "available",
        period: "",
      },
      {
        label: "department consolidation",
        provider: "risk",
        status: "available",
        period: "",
      },
      {
        label: "owner response ballot",
        provider: "market",
        status: "available",
        period: "",
      },
      {
        label: "owner response ballot",
        provider: "company",
        status: "available",
        period: "",
      },
      {
        label: "owner response ballot",
        provider: "financial",
        status: "available",
        period: "",
      },
      {
        label: "owner response ballot",
        provider: "risk",
        status: "available",
        period: "",
      },
      {
        label: "memo",
        provider: "market_news",
        status: "available",
        period: "",
      },
      {
        label: "memo",
        provider: "financial_quality",
        status: "available",
        period: "",
      },
      {
        label: "memo",
        provider: "market",
        status: "available",
        period: "",
      },
      {
        label: "memo",
        provider: "benchmark",
        status: "available",
        period: "",
      },
      {
        label: "memo",
        provider: "company_competition",
        status: "available",
        period: "",
      },
      {
        label: "blind challenge",
        provider: "market",
        status: "available",
        period: "",
      },
      {
        label: "memo",
        provider: "financial",
        status: "available",
        period: "",
      },
      {
        label: "blind challenge",
        provider: "risk",
        status: "available",
        period: "",
      },
      {
        label: "structural audit",
        provider: "SERN deterministic structural audit",
        status: "available",
        period: "",
      },
    ],
    teamViews: [
      {
        departmentId: "market",
        representativeId: "market",
        teamName: {
          en: "Market team · Maya",
          ko: "시장 팀 · Maya",
        },
        position: {
          en: "NVIDIA’s price regime is conflicted: daily trend remains above its 20-, 50-, and 200-day averages, but hourly momentum is bearish and price sits near $214.50 support. For a new entry, wait for a close above $220.65 with volume confirmation; a break below $212.87 would weaken the market view.",
          ko: "엔비디아의 가격 국면은 혼조다. 일간 가격은 20·50·200일 이동평균 위에 있지만 시간봉 모멘텀은 약세이며 약 214.50달러 지지선에 있다. 신규 진입은 거래량 동반 220.65달러 상회 확인을 기다리고, 212.87달러 하회는 시장 견해를 약화시키는 신호다.",
        },
        vote: "support_with_reservations",
        rationale: {
          en: "Support, with reservations that the earnings-calendar timing is not point-in-time safe and post-earnings price-volume confirmation is unavailable. The recommendation should therefore remain conditional rather than definitive.",
          ko: "실적 캘린더 시점이 point-in-time 안전하지 않고 실적 후 가격·거래량 확인이 없다는 유보 조건하에 지지한다. 따라서 권고는 확정적 판단이 아니라 조건부 판단으로 유지해야 한다.",
        },
      },
      {
        departmentId: "company",
        representativeId: "company",
        teamName: {
          en: "Company team · Ethan",
          ko: "기업 팀 · Ethan",
        },
        position: {
          en: "NVIDIA’s growth engine is increasingly full-stack AI infrastructure: Compute & Networking generated roughly $193.5 billion of FY2025 revenue, while the Portsmouth agreement secured approximately 4.25 gigawatts of future OpenAI AI-factory capacity, with optional support for another 3.8 gigawatts. This supports the growth case only if capacity becomes operational and customer deployment converts into recognized demand over the next several reporting periods.",
          ko: "NVIDIA의 성장 엔진은 풀스택 AI 인프라로 이동하고 있습니다. Compute & Networking은 FY2025 매출 약 1,935억 달러를 창출했고, Portsmouth 계약은 OpenAI의 약 4.25GW AI 팩토리 용량과 추가 3.8GW 선택권을 확보했습니다. 다만 향후 몇 개 분기 동안 실제 가동과 고객 배치가 매출로 전환되어야 성장 가설이 유지됩니다.",
        },
        vote: "support_with_reservations",
        rationale: {
          en: "Support with reservations: NVIDIA has substantial execution capacity and a credible full-stack growth engine, but announced gigawatts do not yet establish near-term monetization. The valuation case requires evidence that deployments become revenue-producing while margins, cash conversion, customer concentration, and guarantee exposure remain controlled.",
          ko: "유보적 지지: NVIDIA는 상당한 실행 역량과 신뢰할 수 있는 풀스택 성장 엔진을 보유하고 있지만, 발표된 GW만으로는 단기 수익화를 입증할 수 없다. 밸류에이션 논리는 마진·현금전환·고객 집중도·보증 노출이 통제되는 가운데 배포가 매출 창출로 전환된다는 증거를 필요로 한다.",
        },
      },
      {
        departmentId: "financial",
        representativeId: "financial",
        teamName: {
          en: "Financial team · Noah",
          ko: "재무 팀 · Noah",
        },
        position: {
          en: "NVIDIA’s margin structure currently supports premium economics: operating margin rose from 54.1% in FY2024 to 60.4% in FY2026 and reached 65.6% in the latest quarter, although the medium-term valuation case requires this durability to persist.",
          ko: "NVIDIA의 마진 구조는 현재 프리미엄 경제성을 뒷받침한다. 영업이익률은 FY2024 54.1%에서 FY2026 60.4%로 상승했고 최근 분기 65.6%에 도달했지만, 밸류에이션 정당화에는 이러한 지속성이 필요하다.",
        },
        vote: "support_with_reservations",
        rationale: {
          en: "The current margin profile supports premium economics, but the valuation case should remain conditional on confirmation from upcoming earnings and filings that growth, margins, cash conversion, working capital, and guarantee exposure remain manageable.",
          ko: "현재 마진 구조는 프리미엄 경제성을 뒷받침하지만, 밸류에이션 논리는 향후 실적 및 공시에서 성장률·마진·현금전환·운전자본과 보증 노출이 관리 가능한 수준임을 확인하는 조건부 판단이어야 한다.",
        },
      },
      {
        departmentId: "risk",
        representativeId: "risk",
        teamName: {
          en: "Risk team · Liam",
          ko: "리스크 팀 · Liam",
        },
        position: {
          en: "Risk’s decision is to wait for clearer disclosure before a new entry: the highest-impact path is the up to $105 billion residual-value guarantee tied to OpenAI infrastructure, while valuation at 32.9 times trailing earnings amplifies any demand or margin reset. The view reverses if the next 10-Q quantifies well-collateralized exposure and subsequent results show guidance delivery without worsening working-capital or margin signals.",
          ko: "리스크팀의 판단은 신규 진입 전에 더 명확한 공시를 기다리는 것이다. 가장 큰 하방 경로는 OpenAI 인프라와 연계된 최대 1,050억 달러 잔존가치 보증이며, 최근 이익 32.9배 밸류에이션은 수요나 마진 재설정의 충격을 확대한다. 다음 10-Q가 충분히 담보화된 노출을 확인하고 이후 실적에서 운전자본 또는 마진 신호 악화 없이 가이던스를 달성하면 판단은 바뀐다.",
        },
        vote: "support_with_reservations",
        rationale: {
          en: "Support subject to qualifying the exposure as contingent and unquantified until the lease exhibits disclose minimum values, collateral, reimbursement mechanics, and accounting treatment. A new entry should also monitor OpenAI payment performance, lease readiness, replacement-value coverage, revenue guidance, receivables, inventory, and gross margin.",
          ko: "해당 노출은 임대별 최소가치, 담보, 보전 방식 및 회계처리가 공시될 때까지 조건부이고 규모가 확정되지 않았다는 점을 명시하는 조건으로 지지한다. 신규 진입자는 OpenAI 지급 이행, 임대 개시 준비도, 대체가치 보전, 매출 가이던스, 매출채권, 재고 및 총마진도 함께 모니터링해야 한다.",
        },
      },
    ],
    posture: "neutral",
    postureLabel: {
      en: "",
      ko: "",
    },
    limitationNote: {
      en: "",
      ko: "",
    },
    evidenceScore: {
      passed: 390,
      denominator: 390,
    },
    sourceCount: 27,
    claimCount: 26,
    asOf: {
      en: "2026-08-22T09:58:10.552Z",
      ko: "2026-08-22T09:58:10.552Z",
    },
    freshness: {
      en: "",
      ko: "",
    },
    condition: {
      en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it.",
      ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다.",
    },
    expectation: {
      en: "NVIDIA’s valuation is demanding but not detached from operating momentum: the price implies roughly 21x NTM EPS while NTM revenue is about 75% above TTM revenue and the latest quarterly operating margin was 65.6%. For a medium-horizon entry, the next two to four reports must validate continued high growth without material margin compression.",
      ko: "NVIDIA의 밸류에이션은 높지만 실적 모멘텀과 완전히 동떨어져 있지는 않다. 주가는 NTM EPS 기준 약 21배를 반영하며, NTM 매출은 TTM 대비 약 75% 높고 최근 분기 영업이익률은 65.6%였다. 중기 신규 진입에서는 향후 2~4개 분기 동안 높은 성장 지속과 의미 있는 마진 하락 부재를 확인해야 한다.",
    },
    valuation: {
      en: "NVIDIA’s valuation is demanding but not detached from operating momentum: the price implies roughly 21x NTM EPS while NTM revenue is about 75% above TTM revenue and the latest quarterly operating margin was 65.6%. For a medium-horizon entry, the next two to four reports must validate continued high growth without material margin compression.",
      ko: "NVIDIA의 밸류에이션은 높지만 실적 모멘텀과 완전히 동떨어져 있지는 않다. 주가는 NTM EPS 기준 약 21배를 반영하며, NTM 매출은 TTM 대비 약 75% 높고 최근 분기 영업이익률은 65.6%였다. 중기 신규 진입에서는 향후 2~4개 분기 동안 높은 성장 지속과 의미 있는 마진 하락 부재를 확인해야 한다.",
    },
    nextEvent: {
      en: "The decisive near-term catalyst is NVIDIA’s August 26 earnings release. A bullish market confirmation requires upside to the $92.06 billion next-quarter revenue forecast and constructive China commentary, followed by a break above $220.65; failure to hold $214.50 after the release would signal that expectations remain too high.",
      ko: "가장 중요한 단기 촉매는 8월 26일 실적 발표다. 강세 확인에는 920.6억 달러의 다음 분기 매출 전망 상회와 긍정적인 중국 관련 발언, 그리고 220.65달러 돌파가 필요하다. 발표 후 214.50달러를 지키지 못하면 기대치가 과도하다는 신호다.",
    },
    thesis: {
      en: "NVIDIA’s relative setup is mixed: short-term momentum is bearish, while the qualified peer group shows extreme dispersion rather than a clean sector-wide signal. A sustained break below $212.87 would weaken the relative case; recovery above $222.28 with stronger volume would improve it.",
      ko: "엔비디아의 상대적 흐름은 혼조세다. 단기 모멘텀은 약세이고, 적격 peer군의 성과 분산도 커서 명확한 업종 공통 신호가 없다. 212.87달러 하회가 지속되면 상대적 투자 논리가 약화되고, 거래량을 동반한 222.28달러 회복은 개선 신호다.",
    },
    changeCondition: {
      en: "",
      ko: "",
    },
    positives: [
      {
        en: "NVIDIA’s growth engine is increasingly full-stack AI infrastructure: Compute & Networking generated roughly $193.5 billion of FY2025 revenue, while the Portsmouth agreement secured approximately 4.25 gigawatts of future OpenAI AI-factory capacity, with optional support for another 3.8 gigawatts. This supports the growth case only if capacity becomes operational and customer deployment converts into recognized demand over the next several reporting periods.",
        ko: "NVIDIA의 성장 엔진은 풀스택 AI 인프라로 이동하고 있습니다. Compute & Networking은 FY2025 매출 약 1,935억 달러를 창출했고, Portsmouth 계약은 OpenAI의 약 4.25GW AI 팩토리 용량과 추가 3.8GW 선택권을 확보했습니다. 다만 향후 몇 개 분기 동안 실제 가동과 고객 배치가 매출로 전환되어야 성장 가설이 유지됩니다.",
      },
      {
        en: "Management is reinforcing commercial execution and ecosystem reach: NVIDIA appointed a former Microsoft worldwide-sales executive to lead field operations, while reported TTM free cash flow of about $119.1 billion and cash plus short-term investments of about $80.6 billion provide capacity to fund platform expansion. For a new entry, this supports waiting for execution confirmation rather than paying solely for the narrative.",
        ko: "경영진은 상업적 실행력과 생태계 확장을 강화하고 있습니다. NVIDIA는 전 Microsoft 글로벌 영업 임원을 필드 운영 책임자로 영입했고, 약 1,191억 달러의 TTM 잉여현금흐름과 약 806억 달러의 현금·단기투자자산이 플랫폼 확장 재원을 제공합니다. 신규 진입자는 서사만으로 추격하기보다 실행 확인을 기다리는 편이 타당합니다.",
      },
      {
        en: "NVIDIA’s moat is a full-stack ecosystem: CUDA, integrated GPUs, networking, and AI-factory software reduce switching friction and make deployment-scale substitution difficult; for a new entry, wait for the next two to four reports to confirm that major customer deployments continue adopting the stack without margin compression.",
        ko: "NVIDIA의 해자는 CUDA, 통합 GPU·네트워킹·AI 팩토리 소프트웨어로 구성된 풀스택 생태계이며, 전환 마찰을 낮추고 대규모 배포에서 대체를 어렵게 만든다. 신규 진입자는 향후 2~4개 보고서에서 주요 고객의 스택 채택이 마진 훼손 없이 지속되는지 확인해야 한다.",
      },
      {
        en: "Competitive erosion is credible through hyperscaler silicon, AMD and other accelerators, and customer-funded infrastructure: NVIDIA’s $105 billion capped residual-value guarantees for an OpenAI campus show that ecosystem expansion can also create counterparty and utilization dependence; monitor whether committed capacity becomes revenue-generating rather than merely guaranteed.",
        ko: "경쟁 침식은 하이퍼스케일러 자체 실리콘, AMD 등 경쟁 가속기, 고객 자금 의존 인프라를 통해 현실화될 수 있다. OpenAI 캠퍼스에 대한 NVIDIA의 최대 1,050억 달러 잔존가치 보증은 생태계 확장이 거래상대방과 가동률 의존도도 높일 수 있음을 보여준다. 약정 용량이 단순 보증을 넘어 실제 매출로 전환되는지 확인해야 한다.",
      },
      {
        en: "NVIDIA has secured a concrete production deployment path: OpenAI is contracted as tenant for approximately 4.25GW of IT load at the Portsmouth campus to deploy NVIDIA’s full-stack DSX AI factory platform, with service conditions expected from 2028. For a new entry, wait for construction and tenant-payment milestones to convert announced capacity into demonstrated utilization.",
        ko: "NVIDIA는 OpenAI를 임차인으로 확보하고 약 4.25GW IT 부하 규모의 Portsmouth 캠퍼스에서 NVIDIA의 풀스택 DSX AI 팩토리 플랫폼을 배치하는 구체적인 생산 배포 경로를 확보했다. 다만 서비스 개시 조건은 2028년부터 예상되므로, 신규 진입자는 건설 및 임차인 지급 마일스톤을 확인해 발표된 용량이 실제 사용으로 전환되는지 기다려야 한다.",
      },
      {
        en: "Current economics show that AI adoption is already monetizing at exceptional scale: NVIDIA reports $253.5 billion of TTM revenue, $119.1 billion of TTM free cash flow, and 74.1% TTM gross margin. This supports valuation tolerance only if the next two to four reports sustain revenue expansion without a sharp margin or cash-conversion reversal.",
        ko: "현재 경제성은 AI 채택이 이미 예외적인 규모로 수익화되고 있음을 보여준다. NVIDIA의 TTM 매출은 2,535억 달러, TTM 잉여현금흐름은 1,190.8억 달러, TTM 매출총이익률은 74.1%다. 향후 2~4개 분기 동안 매출 증가가 지속되고 마진이나 현금전환이 급격히 악화되지 않는 경우에만 높은 밸류에이션을 용인할 수 있다.",
      },
      {
        en: "NVIDIA’s margin structure currently supports premium economics: operating margin rose from 54.1% in FY2024 to 60.4% in FY2026 and reached 65.6% in the latest quarter, although the medium-term valuation case requires this durability to persist.",
        ko: "NVIDIA의 마진 구조는 현재 프리미엄 경제성을 뒷받침한다. 영업이익률은 FY2024 54.1%에서 FY2026 60.4%로 상승했고 최근 분기 65.6%에 도달했지만, 밸류에이션 정당화에는 이러한 지속성이 필요하다.",
      },
      {
        en: "Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
        ko: "재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
      },
      {
        en: "NVIDIA’s reported earnings continue to convert into substantial cash, but conversion has weakened: FY2026 operating cash flow was 85.6% of net income and Q1 FY2027 was 86.3%, so valuation support depends on sustaining cash generation rather than accounting earnings alone.",
        ko: "NVIDIA의 보고 이익은 여전히 상당한 현금으로 전환되지만 전환율은 약화됐다. FY2026 영업현금흐름은 순이익의 85.6%, FY2027 1분기는 86.3%였으므로 밸류에이션은 회계이익보다 지속적인 현금창출에 달려 있다.",
      },
      {
        en: "The earliest measurable warning signal is the August 26 earnings release: a miss or weaker forward revenue outlook against the approximately $92.1 billion next-quarter forecast would indicate that AI infrastructure demand is not absorbing the company’s capacity and contingent commitments; investors should track revenue guidance, accounts receivable, inventory, and gross margin together.",
        ko: "가장 이른 측정 가능 경고 신호는 8월 26일 실적 발표다. 약 921억 달러의 다음 분기 매출 전망을 하회하거나 전망이 약화되면 AI 인프라 수요가 회사의 생산능력과 우발적 약정을 흡수하지 못한다는 신호가 될 수 있다. 매출 가이던스, 매출채권, 재고, 총마진을 함께 확인해야 한다.",
      },
      {
        en: "NVIDIA has substantial liquidity and contractual recovery rights that can absorb a policy or customer shock, but its new Portsmouth commitments create a contingent downside path: an OpenAI default could leave NVIDIA exposed to up to $105 billion of residual-value guarantees before reimbursement or asset recovery. For a new entry, require the upcoming 10-Q to quantify the guarantees and monitor OpenAI credit quality, lease readiness, and replacement-value coverage.",
        ko: "NVIDIA는 상당한 유동성과 계약상 회수권을 보유해 정책 또는 고객 충격을 흡수할 수 있지만, Portsmouth 약정은 새로운 하방 경로를 만든다. OpenAI가 채무불이행하면 상환 또는 자산 회수 전 NVIDIA가 최대 1,050억 달러의 잔존가치 보증에 노출될 수 있다. 신규 진입자는 다음 10-Q의 보증 규모, OpenAI 신용도, 임대 개시 조건 및 대체가치 보전 여부를 확인해야 한다.",
      },
      {
        en: "NVIDIA’s recovery capacity is strengthened by ecosystem expansion and executive commercial continuity: the company appointed a Microsoft veteran to lead worldwide field operations while pursuing large AI-campus commitments. Recovery from a policy or macro shock would be more credible if the next two to four reports preserve demand, margin, and cash generation while management converts capacity into diversified tenants and end markets.",
        ko: "NVIDIA는 생태계 확장과 영업 리더십 연속성으로 정책·거시 충격 이후 회복 역량을 높였다. Microsoft 출신 임원을 전세계 영업 책임자로 임명했고 대형 AI 캠퍼스 약정을 추진 중이다. 향후 2~4개 분기에서 수요·마진·현금창출을 유지하고 다양한 임차인과 최종시장으로 용량을 전환하면 회복 논리가 강화된다.",
      },
      {
        en: "NVIDIA’s valuation is demanding but not detached from operating momentum: the price implies roughly 21x NTM EPS while NTM revenue is about 75% above TTM revenue and the latest quarterly operating margin was 65.6%. For a medium-horizon entry, the next two to four reports must validate continued high growth without material margin compression.",
        ko: "NVIDIA의 밸류에이션은 높지만 실적 모멘텀과 완전히 동떨어져 있지는 않다. 주가는 NTM EPS 기준 약 21배를 반영하며, NTM 매출은 TTM 대비 약 75% 높고 최근 분기 영업이익률은 65.6%였다. 중기 신규 진입에서는 향후 2~4개 분기 동안 높은 성장 지속과 의미 있는 마진 하락 부재를 확인해야 한다.",
      },
    ],
    concerns: [
      {
        en: "Reinvestment is currently highly cash-generative rather than capital-intensive: the latest quarter produced $50.3B of operating cash flow and $48.6B of free cash flow, but NVIDIA’s $105B capped residual-value guarantees create a material future capital-allocation exposure.",
        ko: "재투자는 현재 자본집약적이라기보다 현금창출적이다. 최근 분기 영업현금흐름은 503억 달러, 잉여현금흐름은 486억 달러였지만, NVIDIA의 1,050억 달러 한도 잔존가치 보증은 향후 자본배분에 중요한 노출을 만든다.",
      },
      {
        en: "NVIDIA’s operating quality can support a premium, but its valuation leaves less room for relative underperformance: the qualified peer median P/E is 12.7x versus NVIDIA at 32.9x, a 158.5% premium. For a medium-horizon new entry, waiting for earnings confirmation is better supported than assuming further multiple expansion.",
        ko: "엔비디아의 높은 운영 품질은 프리미엄을 정당화할 수 있지만 상대적 부진을 흡수할 여지는 작다. 적격 peer 중앙 P/E는 12.7배인데 엔비디아는 32.9배로 158.5% 프리미엄이다. 중기 신규 진입에서는 추가 멀티플 확장보다 실적 확인을 기다리는 쪽이 더 타당하다.",
      },
      {
        en: "The macro backdrop is a valuation headwind rather than a demand collapse: the 10-year Treasury yield was 4.74%, core CPI continued rising through June, and wages increased to $37.64 per hour. Higher discount rates and sticky service costs leave less tolerance for NVIDIA’s premium multiple.",
        ko: "거시 환경은 수요 붕괴보다 밸류에이션 역풍에 가깝다. 10년물 국채금리는 4.74%였고 근원 CPI는 6월까지 상승했으며 시간당 임금은 37.64달러로 올랐다. 높은 할인율과 끈적한 비용은 엔비디아의 프리미엄 멀티플 허용도를 낮춘다.",
      },
      {
        en: "Momentum and volume do not yet confirm a durable rebound: 1-hour RSI is 32.92 with negative MACD, while 4-hour RSI is 43.64, MACD is below its signal, and volume is only 0.57x its 20-period average; the recent close also fell 0.98% to $214.72. Confirmation would require recovery through $220.65–$227.92 on stronger volume, especially after the August 26 earnings event.",
        ko: "모멘텀과 거래량은 아직 지속적인 반등을 확인하지 않는다. 1시간 RSI는 32.92, MACD는 음수이고, 4시간 RSI는 43.64이며 MACD가 시그널 아래에 있고 거래량은 20기간 평균의 0.57배에 불과하다. 최근 종가는 0.98% 하락한 $214.72였다. 확인 신호는 8월 26일 실적 발표 이후 특히 거래량 증가와 함께 $220.65~$227.92를 회복하는 것이다.",
      },
      {
        en: "The highest-impact downside is counterparty and infrastructure concentration: NVIDIA guaranteed up to $105 billion of residual lease value tied to OpenAI’s 4.25GW Ohio campus, so OpenAI default or project underperformance could transmit into large contingent payments, asset-reletting losses, and valuation compression despite NVIDIA’s net cash buffer; a new entry should wait for lease conditions, OpenAI payment performance, and disclosed exposure to become clearer.",
        ko: "가장 큰 하방 위험은 거래상대방 및 인프라 집중이다. NVIDIA는 OpenAI의 오하이오 4.25GW 캠퍼스와 연계된 최대 1,050억 달러의 잔존 임대가치를 보증했으므로, OpenAI의 채무불이행이나 프로젝트 부진은 순현금 완충에도 불구하고 대규모 우발지급, 재임대 손실, 밸류에이션 압박으로 전이될 수 있다. 신규 진입은 임대 조건, OpenAI 지급 이행, 관련 노출이 명확해질 때까지 기다리는 것이 합리적이다.",
      },
      {
        en: "Valuation magnifies any operating disappointment: at $214.72 per share, NVIDIA trades at roughly 32.9 times trailing earnings versus a qualified peer median of 12.7 times, so a demand or margin reset can reduce both earnings and the multiple; the recovery condition is sustained revenue growth with gross margin near 70% or higher and no increase in contingent-liability disclosures.",
        ko: "밸류에이션은 영업 실망을 확대한다. 주당 214.72달러에서 NVIDIA의 최근 12개월 이익 배수는 약 32.9배로, 적격 peer 중앙값 12.7배보다 높다. 따라서 수요나 마진이 재설정되면 이익과 배수가 동시에 하락할 수 있다. 회복 조건은 매출 성장 지속, 70% 이상에 가까운 총마진, 우발부채 공시 증가 없음이다.",
      },
      {
        en: "The earliest policy warning signal is a formal expansion of U.S. export controls from physical-chip shipments to overseas cloud access; that would transmit through lost China-linked compute demand and a higher discount rate. NVIDIA already assumes no China data-center compute revenue in its near-term outlook, so the next decisive confirmation is whether regulators impose cloud-access restrictions or NVIDIA discloses incremental customer-screening costs.",
        ko: "가장 이른 정책 경고 신호는 미국 수출통제가 실물 칩 선적에서 해외 클라우드 접근으로 확대되는 것이다. 이는 중국 관련 컴퓨팅 수요 감소와 할인율 상승으로 전이된다. NVIDIA는 이미 단기 전망에서 중국 데이터센터 컴퓨팅 매출을 제외하고 있으므로, 다음 확인 지표는 규제당국의 클라우드 접근 제한 또는 NVIDIA가 공시하는 추가 고객심사 비용이다.",
      },
      {
        en: "Relative valuation leaves limited margin of safety: NVIDIA trades at 32.9x TTM earnings versus the qualified peer median of 12.7x, a 158.5% premium. That premium can be justified only by sustained superior growth and margins; absent upward earnings revisions, waiting for a better valuation cushion is warranted for a new entry.",
        ko: "상대 밸류에이션상 안전마진은 제한적이다. NVIDIA는 TTM 이익의 32.9배로 거래되어 적격 peer median 12.7배 대비 158.5% 프리미엄이다. 이 프리미엄은 지속적인 성장·마진 우위로만 정당화될 수 있으므로, 이익 추정치 상향이 없으면 신규 진입자는 더 나은 밸류에이션 여유를 기다릴 근거가 있다.",
      },
    ],
    analysis: [
      {
        title: {
          en: "Supported analysis",
          ko: "근거 기반 분석",
        },
        summary: {
          en: "What is established is a credible full-stack AI growth engine, exceptional margins and cash generation, and meaningful capacity to fund expansion.",
          ko: "확인된 사실은 신뢰할 수 있는 풀스택 AI 성장 엔진, 탁월한 마진과 현금창출력, 그리고 확장에 필요한 재원이다.",
        },
        detail: {
          en: "The teams dispute whether those strengths already offset execution risk, valuation concentration, and the uncertain monetization of announced infrastructure commitments. The deciding checkpoint is whether the next two to four reports show deployment becoming revenue-producing while margins, cash conversion, working capital, and guarantee exposure remain controlled.",
          ko: "다만 이러한 강점이 실행 위험, 높은 밸류에이션, 발표된 인프라 약정의 불확실한 수익화를 이미 상쇄하는지는 부서 간 이견이 있다. 향후 2~4개 보고서에서 배포가 매출로 전환되고 마진·현금전환·운전자본·보증 노출이 통제되는지가 판단을 가를 기준이다.",
        },
      },
      {
        title: {
          en: "Valuation and comparison",
          ko: "밸류에이션과 기업 비교",
        },
        summary: {
          en: "The modeled forward-earnings sensitivity spans $229.40 to $407.49 using forward EPS of $10.06 and multiples from 22.8x to 40.5x; this is a sensitivity framework, not guaranteed fair value.",
          ko: "선행 이익가치 민감도는 선행 EPS $10.06에 22.8~40.5배를 적용해 $229.40~$407.49로 산출되며, 이는 보장된 적정가가 아닌 민감도 범위다.",
        },
        detail: {
          en: "The base case implies $317.94 at 31.6x, while the observed valuation remains demanding relative to the qualified peer median. The premium therefore requires sustained growth and margin delivery, with disappointment capable of compressing both earnings and the multiple.",
          ko: "기준 시나리오는 31.6배 적용 시 $317.94를 제시하지만, 현재 밸류에이션은 적격 peer 중앙값보다 높다. 따라서 프리미엄은 지속적인 성장과 마진 달성을 요구하며, 실망 시 이익과 멀티플이 함께 낮아질 수 있다.",
        },
      },
      {
        title: {
          en: "Operational scenarios",
          ko: "운영 시나리오",
        },
        summary: {
          en: "In the upside path, AI-factory commitments become deployed systems, software adoption persists, and revenue growth supports premium multiples.",
          ko: "상방 경로에서는 AI 팩토리 약정이 실제 시스템으로 배포되고 소프트웨어 채택이 지속되며 매출 성장이 프리미엄 멀티플을 지지한다.",
        },
        detail: {
          en: "In the base path, strong cash generation continues but investors require repeated evidence that capacity and customer deployments convert into recognized demand. In the downside path, delayed utilization, competing silicon, margin pressure, or guarantee-related cash exposure would reduce the earnings power supporting the valuation.",
          ko: "기준 경로에서는 현금창출력이 강하게 유지되지만, 용량과 고객 배포가 인식 매출로 전환된다는 반복적인 증거가 필요하다. 하방 경로에서는 가동 지연, 경쟁 실리콘, 마진 압박 또는 보증 관련 현금 노출이 밸류에이션을 지지하는 이익가치를 낮춘다.",
        },
      },
      {
        title: {
          en: "Change conditions",
          ko: "변경 조건",
        },
        summary: {
          en: "The case strengthens if the next two to four reports show sustained revenue growth, resilient margins and cash conversion, and increasing deployed capacity and software adoption.",
          ko: "향후 2~4개 보고서에서 매출 성장, 마진과 현금전환의 안정성, 배포 용량과 소프트웨어 채택 증가가 확인되면 투자 논리는 강화된다.",
        },
        detail: {
          en: "It weakens if operating margin falls below 55% for two consecutive reported quarters or if gross-margin compression exceeds five percentage points year over year. Recheck these conditions at the next earnings release and subsequent filings, alongside utilization and guarantee disclosures.",
          ko: "영업이익률이 두 분기 연속 55% 아래로 떨어지거나 매출총이익률 하락폭이 전년 대비 5%포인트를 넘으면 약화된다. 다음 실적 발표와 후속 공시에서 가동률 및 보증 공시와 함께 이 조건들을 재점검해야 한다.",
        },
      },
    ],
    scenarios: [],
    appendix: [
      {
        title: {
          en: "Evidence register",
          ko: "근거 목록",
        },
        items: [
          {
            en: "insightsentry:calendar",
            ko: "insightsentry:calendar",
          },
          {
            en: "insightsentry:peers",
            ko: "insightsentry:peers",
          },
          {
            en: "insightsentry:quote",
            ko: "insightsentry:quote",
          },
          {
            en: "filing:0001045810-26-000021",
            ko: "filing:0001045810-26-000021",
          },
          {
            en: "filing:0001045810-26-000052",
            ko: "filing:0001045810-26-000052",
          },
          {
            en: "filing:0001045810-26-000060",
            ko: "filing:0001045810-26-000060",
          },
          {
            en: "filing:0001045810-26-000069",
            ko: "filing:0001045810-26-000069",
          },
          {
            en: "insightsentry:news:company",
            ko: "insightsentry:news:company",
          },
          {
            en: "facts:current",
            ko: "facts:current",
          },
          {
            en: "filing:0001197647-26-000005",
            ko: "filing:0001197647-26-000005",
          },
          {
            en: "filing:0001197647-26-000007",
            ko: "filing:0001197647-26-000007",
          },
          {
            en: "macro:cpi",
            ko: "macro:cpi",
          },
          {
            en: "insightsentry:technical",
            ko: "insightsentry:technical",
          },
          {
            en: "macro:average-hourly-earnings",
            ko: "macro:average-hourly-earnings",
          },
          {
            en: "macro:treasury",
            ko: "macro:treasury",
          },
          {
            en: "macro:unemployment",
            ko: "macro:unemployment",
          },
          {
            en: "macro:producer-prices",
            ko: "macro:producer-prices",
          },
          {
            en: "macro:nonfarm-payrolls",
            ko: "macro:nonfarm-payrolls",
          },
          {
            en: "insightsentry:news:risk",
            ko: "insightsentry:news:risk",
          },
          {
            en: "memo:market_news",
            ko: "memo:market_news",
          },
          {
            en: "memo:financial_quality",
            ko: "memo:financial_quality",
          },
          {
            en: "memo:market",
            ko: "memo:market",
          },
          {
            en: "memo:benchmark",
            ko: "memo:benchmark",
          },
          {
            en: "memo:company_competition",
            ko: "memo:company_competition",
          },
          {
            en: "challenge:market",
            ko: "challenge:market",
          },
          {
            en: "memo:financial",
            ko: "memo:financial",
          },
          {
            en: "challenge:risk",
            ko: "challenge:risk",
          },
        ],
      },
      {
        title: {
          en: "Data coverage",
          ko: "데이터 범위",
        },
        items: [
          {
            en: "InsightSentry via RapidAPI · insightsentry_calendar · available",
            ko: "InsightSentry via RapidAPI · insightsentry_calendar · available",
          },
          {
            en: "InsightSentry via RapidAPI · insightsentry_peers · available",
            ko: "InsightSentry via RapidAPI · insightsentry_peers · available",
          },
          {
            en: "InsightSentry via RapidAPI · insightsentry_quote · available",
            ko: "InsightSentry via RapidAPI · insightsentry_quote · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "InsightSentry via RapidAPI · insightsentry_news_company · available",
            ko: "InsightSentry via RapidAPI · insightsentry_news_company · available",
          },
          {
            en: "InsightSentry via RapidAPI · insightsentry_request_ledger · available",
            ko: "InsightSentry via RapidAPI · insightsentry_request_ledger · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "U.S. Securities and Exchange Commission · sec_filing · available",
            ko: "U.S. Securities and Exchange Commission · sec_filing · available",
          },
          {
            en: "U.S. Bureau of Labor Statistics · macro · available",
            ko: "U.S. Bureau of Labor Statistics · macro · available",
          },
          {
            en: "InsightSentry via RapidAPI · market_bars · available",
            ko: "InsightSentry via RapidAPI · market_bars · available",
          },
          {
            en: "U.S. Bureau of Labor Statistics · macro · available",
            ko: "U.S. Bureau of Labor Statistics · macro · available",
          },
          {
            en: "U.S. Department of the Treasury · treasury · available",
            ko: "U.S. Department of the Treasury · treasury · available",
          },
          {
            en: "U.S. Bureau of Labor Statistics · macro · available",
            ko: "U.S. Bureau of Labor Statistics · macro · available",
          },
          {
            en: "U.S. Bureau of Labor Statistics · macro · available",
            ko: "U.S. Bureau of Labor Statistics · macro · available",
          },
          {
            en: "U.S. Bureau of Labor Statistics · macro · available",
            ko: "U.S. Bureau of Labor Statistics · macro · available",
          },
          {
            en: "InsightSentry via RapidAPI · insightsentry_news_risk · available",
            ko: "InsightSentry via RapidAPI · insightsentry_news_risk · available",
          },
          {
            en: "market · department_consolidation · available",
            ko: "market · department_consolidation · available",
          },
          {
            en: "company · department_consolidation · available",
            ko: "company · department_consolidation · available",
          },
          {
            en: "financial · department_consolidation · available",
            ko: "financial · department_consolidation · available",
          },
          {
            en: "risk · department_consolidation · available",
            ko: "risk · department_consolidation · available",
          },
          {
            en: "market · owner_response_ballot · available",
            ko: "market · owner_response_ballot · available",
          },
          {
            en: "company · owner_response_ballot · available",
            ko: "company · owner_response_ballot · available",
          },
          {
            en: "financial · owner_response_ballot · available",
            ko: "financial · owner_response_ballot · available",
          },
          {
            en: "risk · owner_response_ballot · available",
            ko: "risk · owner_response_ballot · available",
          },
          {
            en: "market_news · memo · available",
            ko: "market_news · memo · available",
          },
          {
            en: "financial_quality · memo · available",
            ko: "financial_quality · memo · available",
          },
          {
            en: "market · memo · available",
            ko: "market · memo · available",
          },
          {
            en: "benchmark · memo · available",
            ko: "benchmark · memo · available",
          },
          {
            en: "company_competition · memo · available",
            ko: "company_competition · memo · available",
          },
          {
            en: "market · blind_challenge · available",
            ko: "market · blind_challenge · available",
          },
          {
            en: "financial · memo · available",
            ko: "financial · memo · available",
          },
          {
            en: "risk · blind_challenge · available",
            ko: "risk · blind_challenge · available",
          },
          {
            en: "SERN deterministic structural audit · structural_audit · available",
            ko: "SERN deterministic structural audit · structural_audit · available",
          },
        ],
      },
    ],
    versions: [
      {
        version: "v1.0",
        date: "2026-08-22",
        label: {
          en: "Published research file",
          ko: "발행된 리서치 파일",
        },
      },
    ],
  },
  version: 1,
  publishedAt: "2026-08-22T09:58:10.552Z",
};
