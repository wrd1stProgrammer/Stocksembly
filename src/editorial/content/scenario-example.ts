import type { AppLocale } from "../../lib/i18n";
import type { EditorialEntryCopy } from "../types";

type ScenarioExample = Readonly<{
  heading: string;
  setup: string;
  caption: string;
  headers: readonly string[];
  labels: readonly [string, string, string, string, string, string, string];
  calculation: string;
  interpretation: string;
  reviewHeading: string;
  review: string;
  limits: string;
  sources: string;
  filingSource: string;
  statementSource: string;
}>;

export const scenarioExamples: Readonly<Record<AppLocale, ScenarioExample>> = {
  en: {
    heading: "Worked example: from sales assumptions to operating profit",
    setup:
      "Consider a fictional business with annual revenue of $100 million. Forecast the next full year, not the next quarter. All amounts in the table are USD millions; these are teaching assumptions, not company guidance or a recommendation. Hold the revenue recognition policy constant. Customer volume changes first, then average price changes on that volume. Operating costs below exclude cost of sales, which is already captured in gross margin.",
    caption: "Fictional one-year operating scenarios (USD millions)",
    headers: ["Driver / result", "Bear", "Base", "Bull"],
    labels: [
      "Customer volume growth",
      "Average price change",
      "Revenue",
      "Gross margin",
      "Gross profit",
      "Operating costs",
      "Operating profit",
    ],
    calculation:
      "Revenue = 100 × (1 + volume growth) × (1 + price change). The base case is 100 × 1.12 × 1.03 = 115.36, not 115: growth compounds to 15.36%. Gross profit = revenue × gross margin; operating profit = gross profit − operating costs. Thus the base case produces 115.36 × 50% − 40 = 17.68. Every column uses exactly the same formulas.",
    interpretation:
      "The bear case links customer losses and discounting to lower gross margin while operating costs remain sticky. The bull case assumes better demand and product mix, but also higher staffing and selling costs. At base-case revenue, one percentage point of gross margin changes operating profit by 1.1536 million if other assumptions stay fixed. This sensitivity isolates one input; a scenario changes a coherent group of inputs. Neither output is free cash flow or equity value.",
    reviewHeading: "Make the example usable after the next earnings release",
    review:
      "Before applying it to a real company, collect the revenue policy and segment disclosures, management discussion, cash-flow statement and risk factors from its filings. Put the filing date, page or section, units and your own assumption beside each model input. After earnings, compare volume, price or mix, margin and costs with the same-period assumptions. If the company does not disclose volume and price separately, mark the split as an estimate rather than manufacturing precision. Explain the deviation before changing the forecast.",
    limits:
      "This deliberately stops at operating profit: interest, tax, capital spending, working capital, debt and dilution are not modeled. A profitable scenario can still require financing. Add those schedules before estimating cash flow or per-share value, and test a downside worse than the bear case. Do not interpret three scenarios as a confidence interval, assign 25/50/25 probabilities without evidence, or treat their midpoint as a price target. The SEC links below explain source documents; they do not endorse this fictional model or its assumptions.",
    sources: "Primary-source reading",
    filingSource:
      "SEC: How to Read a 10-K (business, risks and management discussion)",
    statementSource:
      "SEC: Beginners’ Guide to Financial Statements (profit versus cash flow)",
  },
  ko: {
    heading: "계산 예제: 매출 가정에서 영업이익까지",
    setup:
      "연간 매출이 1억 달러인 가상 기업의 다음 회계연도 전체를 분석합니다. 표의 금액 단위는 백만 미국 달러이며, 실제 기업의 가이던스나 투자 추천이 아닌 교육용 가정입니다. 매출 인식 기준은 동일하게 유지합니다. 고객 수량 변화 후 그 수량에 평균 가격 변화를 적용합니다. 아래 영업비용에는 매출총이익률에 이미 반영한 매출원가가 포함되지 않습니다.",
    caption: "가상 기업의 1년 영업 시나리오 비교 (백만 미국 달러)",
    headers: ["가정·결과", "약세 Bear", "기준 Base", "강세 Bull"],
    labels: [
      "고객 수량 증가율",
      "평균 가격 변화율",
      "매출",
      "매출총이익률",
      "매출총이익",
      "영업비용",
      "영업이익",
    ],
    calculation:
      "매출 = 100 × (1 + 수량 증가율) × (1 + 가격 변화율)입니다. 기준 시나리오는 100 × 1.12 × 1.03 = 115.36으로, 115가 아닙니다. 두 변화가 곱해져 성장률은 15.36%가 됩니다. 매출총이익 = 매출 × 매출총이익률, 영업이익 = 매출총이익 − 영업비용이므로 기준 영업이익은 115.36 × 50% − 40 = 17.68입니다. 세 열 모두 같은 공식을 사용합니다.",
    interpretation:
      "약세에서는 고객 이탈과 할인으로 수익성이 떨어져도 비용을 즉시 줄이지 못한다고 봅니다. 강세에서는 수요와 제품 구성이 개선되는 대신 인건비·판매비도 증가합니다. 기준 매출에서 다른 조건이 같다면 매출총이익률 1%포인트 변화는 영업이익을 1.1536백만 달러 바꿉니다. 이것은 한 변수만 바꾸는 민감도 분석이고, 시나리오는 서로 연결된 여러 가정을 함께 바꿉니다. 두 결과 모두 잉여현금흐름이나 주식가치는 아닙니다.",
    reviewHeading: "다음 실적 발표에서 무엇을 확인할까",
    review:
      "실제 기업에 적용하기 전 공시의 매출 인식 정책·부문별 매출·경영진 설명·현금흐름표·위험 요인을 모으세요. 각 입력값 옆에 공시 날짜, 페이지나 항목, 단위, 본인의 추정치를 기록합니다. 실적 발표 후에는 동일 기간의 수량·가격 또는 제품 구성·이익률·비용을 가정과 비교합니다. 수량과 가격을 따로 공시하지 않으면 그 분해는 추정이라고 명시해야 합니다. 숫자를 다시 맞추기 전에 왜 차이가 생겼는지 설명하세요.",
    limits:
      "이 예제는 영업이익까지만 계산합니다. 이자·세금·설비투자·운전자본·부채·희석은 생략했으므로 흑자여도 자금 조달이 필요할 수 있습니다. 현금흐름이나 주당 가치를 계산하기 전 해당 항목을 추가하고, 약세보다 더 나쁜 상황도 점검하세요. 세 경우는 통계적 신뢰구간이 아니며 근거 없이 확률을 25/50/25로 정하거나 중간값을 목표주가로 사용하면 안 됩니다. 아래 SEC 자료는 공시를 읽는 방법을 설명하며, 이 가상 모델이나 가정을 보증하지 않습니다.",
    sources: "공식 원문 자료",
    filingSource: "SEC: 10-K 읽는 법 — 사업·위험·경영진 설명 (영문)",
    statementSource: "SEC: 재무제표 입문 — 이익과 현금흐름의 차이 (영문)",
  },
  ja: {
    heading: "計算例：売上の仮定から営業利益まで",
    setup:
      "年間売上高が1億米ドルの架空企業について、翌会計年度の1年間を予測します。表の金額は百万米ドル単位です。実在企業の見通しや投資推奨ではなく、学習用の仮定です。収益認識方針を統一し、顧客数量の変化後に平均価格の変化を適用します。表の営業費用は、粗利益率に反映済みの売上原価を含みません。",
    caption: "架空企業の1年間の営業シナリオ（百万米ドル）",
    headers: ["仮定・結果", "弱気 Bear", "基本 Base", "強気 Bull"],
    labels: [
      "顧客数量の増加率",
      "平均価格の変化率",
      "売上高",
      "粗利益率",
      "粗利益",
      "営業費用",
      "営業利益",
    ],
    calculation:
      "売上高 = 100 × (1 + 数量増加率) × (1 + 価格変化率)。基本ケースは100 × 1.12 × 1.03 = 115.36で、115ではありません。成長率は複利で15.36%になります。粗利益 = 売上高 × 粗利益率、営業利益 = 粗利益 − 営業費用なので、基本ケースは115.36 × 50% − 40 = 17.68です。全ケースに同じ計算式を使います。",
    interpretation:
      "弱気では顧客減少と値引きで粗利益率が低下しても費用をすぐに減らせないと仮定します。強気では需要と製品構成の改善に加え、人員・販売費用も増加します。基本ケースの売上高で他の条件を固定すると、粗利益率1ポイントの変化は営業利益を1.1536百万ドル変えます。これは単一変数の感応度分析であり、連動する複数の仮定を変えるシナリオ分析とは異なります。いずれもフリーキャッシュフローや株式価値ではありません。",
    reviewHeading: "次の決算でモデルを検証する",
    review:
      "実際の企業では、開示資料の収益認識方針、セグメント情報、経営者の説明、キャッシュフロー計算書、リスク要因を確認します。各入力値に資料の日付・ページや項目・単位・自分の推定を記録してください。決算後は同じ期間の数量、価格や構成、利益率、費用を比較します。数量と価格が別々に開示されていなければ、その分解は推定と表示します。予測を更新する前に差異の理由を説明しましょう。",
    limits:
      "この例は営業利益までで、利息、税金、設備投資、運転資本、負債、希薄化を扱いません。黒字でも資金調達が必要な場合があります。現金収支や1株価値の計算にはこれらを追加し、弱気ケースより悪い状況も検討してください。3ケースは信頼区間ではなく、根拠のない25/50/25の確率や中央値を目標株価に使うべきではありません。下記SEC資料は開示資料の読み方の参考で、この架空モデルを保証するものではありません。",
    sources: "一次資料",
    filingSource: "SEC：10-Kの読み方（事業・リスク・経営者の説明、英語）",
    statementSource: "SEC：財務諸表入門（利益とキャッシュフロー、英語）",
  },
  "zh-TW": {
    heading: "計算範例：從營收假設推導營業利益",
    setup:
      "假設一家虛構公司的年營收為1億美元，預估下一完整會計年度。表中金額單位為百萬美元，僅供教學，並非實際公司的財測或投資建議。各情境採相同收入認列政策，先計算客戶數量變化，再套用平均價格變化。表中的營業費用不含已反映於毛利率的銷貨成本。",
    caption: "虛構公司的一年營運情境（百萬美元）",
    headers: ["假設／結果", "空頭 Bear", "基本 Base", "多頭 Bull"],
    labels: [
      "客戶數量成長率",
      "平均價格變化率",
      "營收",
      "毛利率",
      "毛利",
      "營業費用",
      "營業利益",
    ],
    calculation:
      "營收 = 100 × (1 + 數量成長率) × (1 + 價格變化率)。基本情境為100 × 1.12 × 1.03 = 115.36，而非115；兩項變化相乘後成長率為15.36%。毛利 = 營收 × 毛利率，營業利益 = 毛利 − 營業費用，因此基本情境為115.36 × 50% − 40 = 17.68。三欄使用完全相同的公式。",
    interpretation:
      "空頭情境假設客戶流失與折扣壓低毛利率，但費用無法立即縮減。多頭情境則假設需求與產品組合改善，同時增加人事和銷售費用。固定基本情境營收及其他條件時，毛利率變動1個百分點，營業利益會變動1.1536百萬美元。這是單一變數的敏感度分析；情境分析則同時改變一組相互關聯的假設。兩者都不等於自由現金流或股權價值。",
    reviewHeading: "下次財報公布後如何檢驗",
    review:
      "套用到真實公司前，先查閱申報文件的收入認列、部門資料、管理層討論、現金流量表與風險因素。每項輸入值旁都記錄文件日期、頁碼或章節、單位及自己的估計。財報後以相同期間比較數量、價格或產品組合、利潤率及費用。若公司未分別揭露數量與價格，應標示該拆分為估計，不應假装精確。先解釋差異，再修改預測。",
    limits:
      "本例僅到營業利益，未納入利息、稅、資本支出、營運資金、負債與稀釋。即使獲利也可能需要融資。在估算現金流或每股價值前，必須補上這些項目，並測試比空頭更差的情境。三種結果不是統計信賴區間；不可任意給予25/50/25的機率或將中間值視為目標價。以下SEC資料說明如何閱讀財報，並不背書本虛構模型或假設。",
    sources: "官方原始資料",
    filingSource: "SEC：如何閱讀10-K（業務、風險與管理層討論，英文）",
    statementSource: "SEC：財務報表入門（利潤與現金流的差異，英文）",
  },
  es: {
    heading: "Ejemplo: de las ventas al beneficio operativo",
    setup:
      "Una empresa ficticia factura 100 millones de dólares al año. Proyectamos el siguiente ejercicio completo. Las cifras de la tabla están en millones de USD: son supuestos didácticos, no previsiones empresariales ni una recomendación. Mantenemos el criterio de reconocimiento de ingresos y aplicamos el precio al volumen resultante. Los gastos operativos excluyen el coste de ventas, ya reflejado en el margen bruto.",
    caption: "Escenarios operativos ficticios a un año (millones de USD)",
    headers: ["Variable / resultado", "Bajista", "Base", "Alcista"],
    labels: [
      "Crecimiento del volumen",
      "Variación del precio medio",
      "Ingresos",
      "Margen bruto",
      "Beneficio bruto",
      "Gastos operativos",
      "Beneficio operativo",
    ],
    calculation:
      "Ingresos = 100 × (1 + crecimiento del volumen) × (1 + variación del precio). El caso base da 100 × 1,12 × 1,03 = 115,36, no 115: el crecimiento compuesto es del 15,36%. Beneficio bruto = ingresos × margen bruto; beneficio operativo = beneficio bruto − gastos operativos. En el caso base: 115,36 × 50% − 40 = 17,68. Todas las columnas usan las mismas fórmulas; la tabla conserva el punto decimal para facilitar su reproducción.",
    interpretation:
      "El caso bajista combina pérdida de clientes y descuentos con costes rígidos. El alcista supone mejor demanda y mezcla de productos, pero también más gasto comercial y de personal. Con los ingresos base y lo demás constante, un punto porcentual de margen bruto cambia el beneficio operativo en 1,1536 millones. Esa sensibilidad modifica una variable; un escenario combina supuestos coherentes. Ninguno equivale a flujo de caja libre ni a valor de las acciones.",
    reviewHeading: "Qué revisar tras los próximos resultados",
    review:
      "Para una empresa real, consulte las políticas de ingresos, segmentos, comentarios de la dirección, flujos de caja y riesgos en sus documentos oficiales. Anote fecha, página o sección, unidades y estimación propia junto a cada entrada. Compare después volumen, precio o mezcla, margen y gastos del mismo periodo. Si no se publica el desglose de volumen y precio, identifíquelo como estimación. Explique la desviación antes de cambiar la previsión.",
    limits:
      "El ejemplo termina en beneficio operativo: omite intereses, impuestos, inversión, capital circulante, deuda y dilución. Una empresa rentable aún puede necesitar financiación. Añada esas partidas antes de valorar el efectivo o cada acción y pruebe un resultado peor que el bajista. Tres escenarios no son un intervalo de confianza; no asigne probabilidades 25/50/25 sin evidencia ni use su centro como precio objetivo. Las fuentes SEC explican los documentos, pero no avalan este modelo ficticio.",
    sources: "Fuentes primarias",
    filingSource:
      "SEC: Cómo leer un 10-K — negocio, riesgos y dirección (en inglés)",
    statementSource:
      "SEC: Guía de estados financieros — beneficio y efectivo (en inglés)",
  },
  "pt-BR": {
    heading: "Exemplo: da receita ao lucro operacional",
    setup:
      "Uma empresa fictícia tem receita anual de US$ 100 milhões. Projetamos o próximo exercício completo. Os valores da tabela estão em milhões de dólares: são hipóteses didáticas, não guidance nem recomendação. Mantemos a política de reconhecimento da receita e aplicamos a mudança de preço ao volume resultante. As despesas operacionais excluem o custo das vendas, já refletido na margem bruta.",
    caption: "Cenários operacionais fictícios de um ano (milhões de USD)",
    headers: ["Variável / resultado", "Pessimista", "Base", "Otimista"],
    labels: [
      "Crescimento do volume",
      "Variação do preço médio",
      "Receita",
      "Margem bruta",
      "Lucro bruto",
      "Despesas operacionais",
      "Lucro operacional",
    ],
    calculation:
      "Receita = 100 × (1 + crescimento do volume) × (1 + variação do preço). Na base, 100 × 1,12 × 1,03 = 115,36, não 115: o crescimento composto é 15,36%. Lucro bruto = receita × margem bruta; lucro operacional = lucro bruto − despesas operacionais. Portanto, 115,36 × 50% − 40 = 17,68. Todas as colunas usam as mesmas fórmulas; a tabela mantém o ponto decimal para facilitar a reprodução.",
    interpretation:
      "O cenário pessimista combina perda de clientes, descontos e custos que demoram a cair. O otimista pressupõe demanda e mix melhores, mas também mais despesas com pessoal e vendas. Mantendo a receita base e as demais premissas, um ponto percentual de margem bruta altera o lucro operacional em 1,1536 milhão. Sensibilidade muda uma variável; um cenário muda um conjunto coerente. Nenhum dos resultados representa fluxo de caixa livre ou valor das ações.",
    reviewHeading: "Como revisar após o próximo balanço",
    review:
      "Para uma empresa real, consulte política de receita, segmentos, comentários da administração, fluxo de caixa e riscos nos documentos oficiais. Registre data, página ou seção, unidade e estimativa própria ao lado de cada entrada. Compare volume, preço ou mix, margem e custos para o mesmo período. Se a empresa não separar volume e preço, sinalize que a divisão é estimada. Explique os desvios antes de atualizar as projeções.",
    limits:
      "O exemplo termina no lucro operacional e omite juros, impostos, investimento, capital de giro, dívida e diluição. Mesmo uma empresa lucrativa pode precisar de financiamento. Acrescente essas contas antes de estimar caixa ou valor por ação e teste uma situação pior que a pessimista. Três cenários não formam um intervalo de confiança; não atribua probabilidades 25/50/25 sem evidências nem use o centro como preço-alvo. As fontes da SEC explicam os documentos e não endossam este modelo fictício.",
    sources: "Fontes primárias",
    filingSource:
      "SEC: Como ler um 10-K — negócio, riscos e administração (em inglês)",
    statementSource:
      "SEC: Guia de demonstrações financeiras — lucro e caixa (em inglês)",
  },
  de: {
    heading: "Rechenbeispiel: vom Umsatz zum operativen Ergebnis",
    setup:
      "Ein fiktives Unternehmen erzielt jährlich 100 Millionen US-Dollar Umsatz. Wir prognostizieren das nächste volle Geschäftsjahr. Die Tabelle verwendet Millionen USD; es handelt sich um Lernannahmen, nicht um Unternehmensprognosen oder eine Empfehlung. Die Umsatzrealisierung bleibt unverändert. Die Preisänderung wirkt auf die bereits veränderte Kundenmenge. Die operativen Aufwendungen enthalten nicht die in der Bruttomarge berücksichtigten Umsatzkosten.",
    caption: "Fiktive operative Einjahresszenarien (Millionen USD)",
    headers: ["Annahme / Ergebnis", "Bear", "Base", "Bull"],
    labels: [
      "Mengenwachstum",
      "Änderung des Durchschnittspreises",
      "Umsatz",
      "Bruttomarge",
      "Bruttogewinn",
      "Operative Aufwendungen",
      "Operatives Ergebnis",
    ],
    calculation:
      "Umsatz = 100 × (1 + Mengenwachstum) × (1 + Preisänderung). Im Base-Case sind das 100 × 1,12 × 1,03 = 115,36 statt 115: das zusammengesetzte Wachstum beträgt 15,36%. Bruttogewinn = Umsatz × Bruttomarge; operatives Ergebnis = Bruttogewinn − operative Aufwendungen. Damit ergibt sich 115,36 × 50% − 40 = 17,68. Alle Spalten nutzen dieselben Formeln; die Tabelle verwendet zur Reproduzierbarkeit Dezimalpunkte.",
    interpretation:
      "Der Bear-Case verbindet Kundenverluste und Rabatte mit kurzfristig starren Kosten. Der Bull-Case nimmt bessere Nachfrage und Produktmischung an, aber auch höhere Personal- und Vertriebskosten. Bei konstantem Base-Umsatz verändert ein Prozentpunkt Bruttomarge das operative Ergebnis um 1,1536 Millionen. Eine Sensitivität isoliert eine Variable; ein Szenario verändert mehrere zusammenhängende Annahmen. Beides ist weder freier Cashflow noch Eigenkapitalwert.",
    reviewHeading: "Die nächste Ergebnisveröffentlichung als Test",
    review:
      "Bei realen Unternehmen prüfen Sie Umsatzregeln, Segmente, Managementbericht, Kapitalflussrechnung und Risiken in den Originalunterlagen. Notieren Sie Datum, Seite oder Abschnitt, Einheit und eigene Schätzung für jeden Input. Vergleichen Sie nach der Veröffentlichung Menge, Preis oder Mix, Marge und Kosten desselben Zeitraums. Werden Menge und Preis nicht getrennt veröffentlicht, kennzeichnen Sie die Aufteilung als Schätzung. Erklären Sie Abweichungen, bevor Sie die Prognose ändern.",
    limits:
      "Das Beispiel endet beim operativen Ergebnis. Zinsen, Steuern, Investitionen, Betriebskapital, Schulden und Verwässerung fehlen. Trotz Gewinn kann Finanzierung nötig sein. Ergänzen Sie diese Positionen vor Cashflow- oder Aktienbewertungen und testen Sie einen schlechteren Fall als den Bear-Case. Drei Szenarien sind kein Konfidenzintervall; unbelegte 25/50/25-Wahrscheinlichkeiten oder der Mittelwert als Kursziel sind nicht gerechtfertigt. Die SEC-Quellen erläutern Dokumente und bestätigen nicht dieses fiktive Modell.",
    sources: "Primärquellen",
    filingSource:
      "SEC: Einen 10-K lesen — Geschäft, Risiken und Management (Englisch)",
    statementSource:
      "SEC: Einführung in Finanzberichte — Gewinn und Cashflow (Englisch)",
  },
  fr: {
    heading: "Exemple : du chiffre d’affaires au résultat opérationnel",
    setup:
      "Une entreprise fictive réalise 100 millions de dollars de chiffre d’affaires annuel. Nous projetons l’exercice suivant complet. Le tableau est en millions USD : ce sont des hypothèses pédagogiques, pas des prévisions d’entreprise ni une recommandation. La méthode de reconnaissance du revenu reste identique. La variation de prix s’applique au volume déjà modifié. Les charges opérationnelles excluent le coût des ventes, déjà pris dans la marge brute.",
    caption: "Scénarios opérationnels fictifs sur un an (millions USD)",
    headers: ["Hypothèse / résultat", "Baissier", "Central", "Haussier"],
    labels: [
      "Croissance du volume",
      "Variation du prix moyen",
      "Chiffre d’affaires",
      "Marge brute",
      "Profit brut",
      "Charges opérationnelles",
      "Résultat opérationnel",
    ],
    calculation:
      "Chiffre d’affaires = 100 × (1 + croissance du volume) × (1 + variation du prix). Le cas central donne 100 × 1,12 × 1,03 = 115,36, et non 115 : la croissance composée atteint 15,36 %. Profit brut = chiffre d’affaires × marge brute ; résultat opérationnel = profit brut − charges opérationnelles. Donc 115,36 × 50 % − 40 = 17,68. Les trois colonnes suivent les mêmes formules ; le tableau garde le point décimal pour faciliter la reproduction.",
    interpretation:
      "Le cas baissier relie départs de clients et remises à des coûts rigides. Le cas haussier suppose une demande et un mix favorables, mais aussi des frais commerciaux et de personnel supplémentaires. À chiffre d’affaires central constant, un point de marge brute modifie le résultat opérationnel de 1,1536 million. Cette sensibilité isole une variable ; un scénario change plusieurs hypothèses cohérentes. Aucun de ces résultats n’est un flux de trésorerie disponible ni une valeur des actions.",
    reviewHeading: "Vérifier le modèle lors des prochains résultats",
    review:
      "Pour une entreprise réelle, consultez reconnaissance du revenu, segments, commentaires de la direction, tableau des flux et risques dans les documents officiels. Notez date, page ou section, unité et estimation personnelle pour chaque entrée. Comparez volume, prix ou mix, marge et charges sur une période identique. Si volume et prix ne sont pas publiés séparément, signalez que leur ventilation est estimée. Expliquez l’écart avant de modifier la prévision.",
    limits:
      "L’exemple s’arrête au résultat opérationnel : intérêts, impôts, investissements, besoin en fonds de roulement, dette et dilution sont absents. Même rentable, une entreprise peut devoir se financer. Ajoutez ces éléments avant d’évaluer la trésorerie ou chaque action, et testez une issue pire que le cas baissier. Trois scénarios ne constituent pas un intervalle de confiance ; n’imposez pas de probabilités 25/50/25 sans preuve ni une moyenne comme objectif de cours. Les sources SEC expliquent les documents sans cautionner ce modèle fictif.",
    sources: "Sources primaires",
    filingSource:
      "SEC : lire un 10-K — activité, risques et direction (en anglais)",
    statementSource:
      "SEC : initiation aux états financiers — bénéfice et trésorerie (en anglais)",
  },
};

const scenarioValues = [
  ["−5%", "+12%", "+20%"],
  ["−2%", "+3%", "+5%"],
  ["93.10", "115.36", "126.00"],
  ["45%", "50%", "52%"],
  ["41.895", "57.68", "65.52"],
  ["39.00", "40.00", "43.00"],
  ["2.895", "17.68", "22.52"],
] as const;

export function scenarioExampleCopy(
  locale: AppLocale,
): Required<Pick<EditorialEntryCopy, "sections" | "sources">> {
  const copy = scenarioExamples[locale];
  return {
    sections: [
      {
        heading: copy.heading,
        paragraphs: [copy.setup, copy.calculation, copy.interpretation],
        table: {
          caption: copy.caption,
          headers: copy.headers,
          rows: [
            [copy.labels[0], ...scenarioValues[0]],
            [copy.labels[1], ...scenarioValues[1]],
            [copy.labels[2], ...scenarioValues[2]],
            [copy.labels[3], ...scenarioValues[3]],
            [copy.labels[4], ...scenarioValues[4]],
            [copy.labels[5], ...scenarioValues[5]],
            [copy.labels[6], ...scenarioValues[6]],
          ],
        },
      },
      { heading: copy.reviewHeading, paragraphs: [copy.review, copy.limits] },
    ],
    sources: {
      heading: copy.sources,
      items: [
        {
          label: copy.filingSource,
          href: "https://www.sec.gov/answers/reada10k.htm",
        },
        {
          label: copy.statementSource,
          href: "https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide",
        },
      ],
    },
  };
}
