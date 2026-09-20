import type { StockResearchHubCopy } from "./stockResearchHubCopy";

export const stockHubInternationalCopy = {
  ja: {
    eyebrow: "米国株リサーチアーカイブ",
    title: (company, symbol) => `${company}（${symbol}）米国株分析`,
    description: (company, symbol) =>
      `${company}（${symbol}）を企業・財務・市場・リスクの観点から調査したStocksemblyの公開リサーチです。AI専門チームの調査を独立した議長が統合します。`,
    reportCount: (count) => `公開リサーチ ${count}件`,
    disclosureTitle: "公開基準",
    disclosure:
      "発行後30日を経過し、無料閲覧と検索掲載の対象になったリサーチのみを掲載しています。最新の会員限定リサーチの題名や内容は含みません。",
    archiveEyebrow: "公開リサーチ",
    archiveTitle: "根拠を確認できる分析記録",
    archiveDescription:
      "調査の問いと範囲を確認し、原文のリサーチで根拠・限界・最終判断をお読みください。原文の言語は各記事に表示しています。",
    scope: {
      committee: "全チーム総合リサーチ",
      market: "市場分析チーム",
      company: "企業分析チーム",
      financial: "財務分析チーム",
      risk: "リスク分析チーム",
    },
    limitationStatus: "限界の説明あり",
    completeStatus: "分析完了",
    readReport: "リサーチ全文を読む",
    closingTitle: "同じ手順で別の米国株も調査しましょう。",
    closingDescription:
      "期間・視点・深さ・比較企業を指定して、全チームまたは専門チームのリサーチを開始できます。",
    startResearch: "新しいリサーチを開始",
    browseArchive: "リサーチルームを見る",
    originalLanguage: "原文の言語",
    guidesTitle: "リサーチを読むための分析ガイド",
  },
  "zh-TW": {
    eyebrow: "美股研究資料庫",
    title: (company, symbol) => `${company}（${symbol}）美股分析`,
    description: (company, symbol) =>
      `閱讀 Stocksembly 從企業、財務、市場與風險角度分析 ${company}（${symbol}）的公開研究。AI 專業團隊的調查由獨立主席整合。`,
    reportCount: (count) => `${count} 篇公開研究`,
    disclosureTitle: "公開標準",
    disclosure:
      "本頁只收錄發表滿30天、符合免費閱讀與搜尋收錄條件的研究，不包含最新會員專屬研究的標題或內容。",
    archiveEyebrow: "公開研究",
    archiveTitle: "可查核的分析紀錄",
    archiveDescription:
      "先查看研究問題與範圍，再閱讀原文中的證據、限制與最終判斷。每篇研究均標示原文語言。",
    scope: {
      committee: "全團隊綜合研究",
      market: "市場分析團隊",
      company: "企業分析團隊",
      financial: "財務分析團隊",
      risk: "風險分析團隊",
    },
    limitationStatus: "附有限制說明",
    completeStatus: "分析完成",
    readReport: "閱讀完整研究",
    closingTitle: "用相同流程研究其他美股。",
    closingDescription:
      "設定期間、觀點、深度及比較企業，即可啟動全團隊或專業團隊研究。",
    startResearch: "開始新研究",
    browseArchive: "瀏覽研究室",
    originalLanguage: "原文語言",
    guidesTitle: "閱讀研究的分析指南",
  },
  es: {
    eyebrow: "Archivo de análisis de acciones de EE. UU.",
    title: (company, symbol) => `Análisis de ${company} (${symbol})`,
    description: (company, symbol) =>
      `Explora los informes públicos de Stocksembly sobre ${company} (${symbol}): empresa, finanzas, mercado y riesgos. Una presidencia independiente sintetiza el trabajo de los equipos de IA especializados.`,
    reportCount: (count) => `${count} informes públicos`,
    disclosureTitle: "Criterio de publicación",
    disclosure:
      "Solo se muestran informes con más de 30 días desde su publicación y habilitados para lectura gratuita e indexación. No se incluyen títulos ni contenido de informes recientes exclusivos para miembros.",
    archiveEyebrow: "Informes públicos",
    archiveTitle: "Un registro de análisis verificable",
    archiveDescription:
      "Consulta la pregunta y el alcance, y abre el informe original para revisar pruebas, limitaciones y conclusiones. Cada informe indica su idioma original.",
    scope: {
      committee: "Análisis de todos los equipos",
      market: "Equipo de mercado",
      company: "Equipo de empresa",
      financial: "Equipo financiero",
      risk: "Equipo de riesgos",
    },
    limitationStatus: "Incluye limitaciones",
    completeStatus: "Análisis completo",
    readReport: "Leer el informe completo",
    closingTitle: "Investiga otra acción estadounidense con el mismo proceso.",
    closingDescription:
      "Elige el horizonte, la perspectiva, la profundidad y las empresas comparables para iniciar una investigación completa o especializada.",
    startResearch: "Iniciar investigación",
    browseArchive: "Ver sala de investigación",
    originalLanguage: "Idioma original",
    guidesTitle: "Guías para interpretar los informes",
  },
  "pt-BR": {
    eyebrow: "Arquivo de análises de ações dos EUA",
    title: (company, symbol) => `Análise de ${company} (${symbol})`,
    description: (company, symbol) =>
      `Explore as análises públicas da Stocksembly sobre ${company} (${symbol}), com perspectivas de empresa, finanças, mercado e risco. Uma presidência independente sintetiza o trabalho das equipes especializadas de IA.`,
    reportCount: (count) => `${count} relatórios públicos`,
    disclosureTitle: "Critério de publicação",
    disclosure:
      "Esta página inclui apenas relatórios publicados há pelo menos 30 dias e elegíveis para leitura gratuita e indexação. Títulos e conteúdos recentes exclusivos para assinantes não são exibidos.",
    archiveEyebrow: "Relatórios públicos",
    archiveTitle: "Um registro de análise verificável",
    archiveDescription:
      "Confira a pergunta e o escopo, depois leia as evidências, limitações e conclusões no relatório original. O idioma original é indicado em cada relatório.",
    scope: {
      committee: "Análise de todas as equipes",
      market: "Equipe de mercado",
      company: "Equipe de empresas",
      financial: "Equipe financeira",
      risk: "Equipe de riscos",
    },
    limitationStatus: "Inclui limitações",
    completeStatus: "Análise concluída",
    readReport: "Ler relatório completo",
    closingTitle: "Pesquise outra ação dos EUA com o mesmo processo.",
    closingDescription:
      "Defina horizonte, perspectiva, profundidade e empresas comparáveis para iniciar uma pesquisa completa ou especializada.",
    startResearch: "Iniciar pesquisa",
    browseArchive: "Ver sala de pesquisa",
    originalLanguage: "Idioma original",
    guidesTitle: "Guias para interpretar as pesquisas",
  },
  de: {
    eyebrow: "Archiv für US-Aktienanalysen",
    title: (company, symbol) => `${company} (${symbol}) Aktienanalyse`,
    description: (company, symbol) =>
      `Entdecken Sie öffentliche Stocksembly-Analysen zu ${company} (${symbol}) aus Unternehmens-, Finanz-, Markt- und Risikoperspektive. Ein unabhängiger Vorsitz führt die Arbeit spezialisierter KI-Teams zusammen.`,
    reportCount: (count) => `${count} öffentliche Berichte`,
    disclosureTitle: "Veröffentlichungsstandard",
    disclosure:
      "Hier erscheinen nur mindestens 30 Tage alte Berichte, die für kostenloses Lesen und die Suchindexierung freigegeben sind. Titel und Inhalte aktueller Mitgliederberichte bleiben ausgeschlossen.",
    archiveEyebrow: "Öffentliche Analysen",
    archiveTitle: "Nachvollziehbare Analyseergebnisse",
    archiveDescription:
      "Prüfen Sie Fragestellung und Umfang und lesen Sie Belege, Grenzen und Schlussfolgerungen im Originalbericht. Die Originalsprache ist jeweils angegeben.",
    scope: {
      committee: "Analyse aller Teams",
      market: "Marktteam",
      company: "Unternehmensteam",
      financial: "Finanzteam",
      risk: "Risikoteam",
    },
    limitationStatus: "Mit Einschränkungen",
    completeStatus: "Analyse abgeschlossen",
    readReport: "Vollständigen Bericht lesen",
    closingTitle: "Untersuchen Sie weitere US-Aktien nach demselben Verfahren.",
    closingDescription:
      "Wählen Sie Zeitraum, Perspektive, Tiefe und Vergleichsunternehmen für eine umfassende oder spezialisierte Analyse.",
    startResearch: "Neue Analyse starten",
    browseArchive: "Analyseraum öffnen",
    originalLanguage: "Originalsprache",
    guidesTitle: "Leitfäden zum Lesen der Analysen",
  },
  fr: {
    eyebrow: "Archives d’analyses d’actions américaines",
    title: (company, symbol) => `Analyse de ${company} (${symbol})`,
    description: (company, symbol) =>
      `Découvrez les recherches publiques de Stocksembly sur ${company} (${symbol}), sous les angles de l’entreprise, des finances, du marché et des risques. Une présidence indépendante synthétise le travail des équipes d’IA spécialisées.`,
    reportCount: (count) => `${count} rapports publics`,
    disclosureTitle: "Critère de publication",
    disclosure:
      "Seuls les rapports publiés depuis au moins 30 jours et admissibles à la lecture gratuite et à l’indexation sont présentés. Les titres et contenus récents réservés aux membres ne sont pas inclus.",
    archiveEyebrow: "Recherches publiques",
    archiveTitle: "Des analyses dont les preuves sont consultables",
    archiveDescription:
      "Consultez la question et le périmètre, puis lisez les preuves, limites et conclusions dans le rapport original. Sa langue d’origine est indiquée.",
    scope: {
      committee: "Analyse de toutes les équipes",
      market: "Équipe marché",
      company: "Équipe entreprise",
      financial: "Équipe financière",
      risk: "Équipe risques",
    },
    limitationStatus: "Limites signalées",
    completeStatus: "Analyse terminée",
    readReport: "Lire le rapport complet",
    closingTitle:
      "Étudiez d’autres actions américaines avec le même processus.",
    closingDescription:
      "Choisissez l’horizon, la perspective, la profondeur et les entreprises comparables pour lancer une recherche complète ou spécialisée.",
    startResearch: "Lancer une recherche",
    browseArchive: "Voir la salle de recherche",
    originalLanguage: "Langue d’origine",
    guidesTitle: "Guides pour lire les recherches",
  },
} satisfies Record<
  "ja" | "zh-TW" | "es" | "pt-BR" | "de" | "fr",
  StockResearchHubCopy
>;
