import type { UsStockAnalysisCopy } from "./usStockAnalysis";

export const usStockAnalysisZhTw = {
  metadata: {
    title: "美股 AI 分析 | Stocksembly 團隊研究",
    description:
      "11 位 AI 專家交叉檢視 SEC 文件、財報、市場資料、估值與風險，提供同時呈現證據與反方論點的美股研究。",
  },
  hero: {
    eyebrow: "美股 AI 團隊研究",
    title: "由研究委員會協作完成的美股分析",
    description:
      "Stocksembly 將同一個投資問題交由市場、企業、財務與風險團隊的 11 個 AI 專業角色調查，並將證據、質疑與查核結果彙整為一份研究報告。",
    primaryAction: "開始美股分析",
    secondaryAction: "瀏覽公開研究",
    proof: [
      "SEC 文件、財報與市場資料",
      "同時呈現證據與反方論點",
      "研究報告發布 30 天後公開",
    ],
  },
  analysis: {
    eyebrow: "研究範圍",
    title: "不只查詢股票代號，更要檢驗投資問題",
    description:
      "輸入股票代號與問題，依您選擇的投資期間和分析深度，檢視企業品質、估值隱含的預期、即將出現的催化因素與下行風險。",
    cards: [
      {
        title: "業務與競爭",
        description:
          "將商業模式、產品、客戶、競爭情勢與執行能力，連結至申報文件及企業資料中的證據。",
      },
      {
        title: "獲利與財務品質",
        description:
          "分別檢視營收、利潤、現金轉換與再投資負擔，說明這些數字為何重要。",
      },
      {
        title: "估值與比較對象",
        description:
          "檢視符合資格的比較對象與市場預期，並在缺乏可靠比較證據時揭露限制。",
      },
      {
        title: "催化因素與風險",
        description:
          "追蹤財報、新聞、政策影響與下行路徑，列出可能改變判斷的可觀察條件。",
      },
    ],
  },
  committee: {
    eyebrow: "11 個專業角色 · 4 個團隊",
    title: "以不同職責檢視同一份證據",
    description:
      "代理之間意見一致並不等於證明。各團隊負責不同的研究範圍，完整委員會研究還會加入跨團隊質疑與投票。",
    teams: [
      {
        title: "市場團隊",
        description: "市場狀態、新聞、價格背景、基準與利率敏感度",
      },
      {
        title: "企業團隊",
        description: "商業模式、產品、客戶、競爭與執行風險",
      },
      {
        title: "財務團隊",
        description: "已公布業績、現金轉換、財務品質與估值",
      },
      { title: "風險團隊", description: "下行情境、政策影響、警訊與緩解因素" },
    ],
  },
  process: {
    eyebrow: "研究流程",
    title: "從投資問題到報告發布",
    steps: [
      {
        number: "01",
        title: "設定問題與選項",
        description:
          "選擇投資期間、分析深度、反方論證強度、決策目的與比較股票代號。",
      },
      {
        number: "02",
        title: "蒐集證據並依角色分析",
        description:
          "將可取得的申報文件、財務、市場與新聞證據封存為固定時點的快照，再分派給專業角色。",
      },
      {
        number: "03",
        title: "質疑主張並查核證據",
        description:
          "以盲評方式質疑各部門立場，再透過結構與語意查核，檢驗主張和來源是否一致。",
      },
      {
        number: "04",
        title: "主席彙整與發布審查",
        description:
          "最終報告包含關鍵證據、最有力的反方論點、推翻判斷的條件、信心水準與限制。",
      },
    ],
    methodologyAction: "閱讀完整研究方法",
  },
  standards: {
    eyebrow: "以證據為核心的設計",
    title: "保留形成結論的紀錄",
    description:
      "Stocksembly 的分析不是交易指示，也不保證報酬。每份報告都是特定時點的 AI 輔助研究，重要事實應與原始來源核對。",
    points: [
      "重要主張保留來源識別碼與證據截止時點。",
      "缺漏、過時、無法取得或受使用權限制的資料，均列入限制說明。",
      "缺乏支持的數字、立即買賣指示或保證報酬的措辭，會阻止報告發布。",
      "符合公開資格的報告，在滿 30 天後無須登入即可閱讀。",
    ],
    editorialAction: "閱讀編輯方針",
  },
  questions: {
    eyebrow: "常見問題",
    title: "開始 AI 股票分析之前",
    items: [
      {
        title: "可以分析哪些股票？",
        description:
          "以股票代號或公司名稱搜尋目前支援的美國上市公司，並從具體的投資問題開始研究。",
      },
      {
        title: "可以免費閱讀研究嗎？",
        description:
          "新報告可能優先提供給訂閱者。符合公開資格規則的報告，在滿 30 天後開放所有人閱讀。",
      },
      {
        title: "Stocksembly 會提供買進建議或目標價嗎？",
        description:
          "不會。本服務提供資訊與教育用途的研究，不提供個人化投資建議、交易指示或目標價。",
      },
    ],
  },
  closing: {
    title: "有值得檢驗的美股投資問題嗎？",
    description:
      "輸入股票代號與投資問題，然後選擇完整委員會或一個專業研究團隊。",
    action: "開始團隊研究",
  },
} as const satisfies UsStockAnalysisCopy;
