import type { UsStockAnalysisCopy } from "./usStockAnalysis";

export const usStockAnalysisDe = {
  metadata: {
    title: "KI-Analyse für US-Aktien | Stocksembly",
    description:
      "Elf KI-Fachrollen prüfen SEC-Berichte, Quartalszahlen, Marktdaten, Bewertung und Risiken – einschließlich der Gegenposition.",
  },
  hero: {
    eyebrow: "KI-Teamrecherche zu US-Aktien",
    title: "US-Aktienanalyse durch ein Recherchekomitee",
    description:
      "Stocksembly weist eine Anlagefrage elf spezialisierten KI-Rollen in den Teams für Markt, Unternehmen, Finanzen und Risiken zu. Ihre Belege, Einwände und Prüfungen werden in einem Recherchebericht zusammengeführt.",
    primaryAction: "US-Aktienanalyse starten",
    secondaryAction: "Öffentliche Recherchen ansehen",
    proof: [
      "SEC-Unterlagen, Geschäftsergebnisse und Marktdaten",
      "Belege und Gegenargumente gemeinsam",
      "Berichte werden 30 Tage nach Veröffentlichung frei zugänglich",
    ],
  },
  analysis: {
    eyebrow: "Rechercheumfang",
    title: "Über die Tickersuche hinaus: eine Anlagefrage prüfen",
    description:
      "Geben Sie ein Tickersymbol und eine Frage ein, um Geschäftsqualität, eingepreiste Erwartungen, bevorstehende Kurstreiber und Abwärtsrisiken für den gewählten Anlagehorizont und die gewünschte Analysetiefe zu untersuchen.",
    cards: [
      {
        title: "Geschäft und Wettbewerb",
        description:
          "Geschäftsmodell, Produkte, Kunden, Wettbewerb und Umsetzung werden mit regulatorischen Unterlagen und Unternehmensbelegen verknüpft.",
      },
      {
        title: "Ergebnisse und Finanzqualität",
        description:
          "Umsatz, Gewinn, Umwandlung in liquide Mittel und Reinvestitionsbedarf werden getrennt betrachtet und die Bedeutung der Zahlen erläutert.",
      },
      {
        title: "Bewertung und Vergleichsunternehmen",
        description:
          "Auf Eignung geprüfte Vergleiche und Markterwartungen werden untersucht. Fehlen verlässliche Vergleichsbelege, wird dies offengelegt.",
      },
      {
        title: "Kurstreiber und Risiken",
        description:
          "Ergebnisse, Nachrichten, politische Einflüsse und mögliche Abwärtsverläufe werden mit beobachtbaren Bedingungen erfasst, die die Einschätzung ändern könnten.",
      },
    ],
  },
  committee: {
    eyebrow: "11 Fachrollen · 4 Teams",
    title:
      "Dieselben Belege, geprüft aus unterschiedlichen Verantwortungsbereichen",
    description:
      "Einigkeit zwischen Agenten gilt nicht als Beweis. Jedes Team verantwortet einen eigenen Recherchebereich. Bei Analysen des gesamten Komitees kommen teamübergreifende Einwände und Abstimmungen hinzu.",
    teams: [
      {
        title: "Marktteam",
        description:
          "Marktphase, Nachrichten, Kurskontext, Vergleichsmaßstäbe und Zinssensitivität",
      },
      {
        title: "Unternehmensteam",
        description:
          "Geschäftsmodell, Produkte, Kunden, Wettbewerb und Umsetzungsrisiken",
      },
      {
        title: "Finanzteam",
        description:
          "Veröffentlichte Ergebnisse, Umwandlung in liquide Mittel, Finanzqualität und Bewertung",
      },
      {
        title: "Risikoteam",
        description:
          "Abwärtsszenarien, politische Einflüsse, Warnsignale und risikomindernde Faktoren",
      },
    ],
  },
  process: {
    eyebrow: "Rechercheprozess",
    title: "Von der Anlegerfrage zum veröffentlichten Bericht",
    steps: [
      {
        number: "01",
        title: "Frage und Optionen festlegen",
        description:
          "Wählen Sie Anlagehorizont, Analysetiefe, Intensität der Gegenargumente, Entscheidungszweck und Tickersymbole für den Vergleich.",
      },
      {
        number: "02",
        title: "Belege sammeln und nach Rollen analysieren",
        description:
          "Verfügbare Belege aus regulatorischen Unterlagen, Finanzdaten, Marktdaten und Nachrichten werden als datierte Momentaufnahme fixiert und Fachrollen zugewiesen.",
      },
      {
        number: "03",
        title: "Aussagen hinterfragen und Belege prüfen",
        description:
          "Die Positionen der Fachbereiche werden im Blindverfahren hinterfragt. Anschließend prüfen strukturelle und semantische Audits die Übereinstimmung zwischen Aussagen und Quellen.",
      },
      {
        number: "04",
        title: "Zusammenführung durch den Vorsitz und Freigabeprüfung",
        description:
          "Der Abschlussbericht enthält die entscheidenden Belege, die stärkste Gegenposition, Bedingungen zur Widerlegung der These, den Grad der Sicherheit und Einschränkungen.",
      },
    ],
    methodologyAction: "Vollständige Methodik lesen",
  },
  standards: {
    eyebrow: "Auf Belege ausgerichtet",
    title: "Die Grundlage der Schlussfolgerung dokumentieren",
    description:
      "Die Analyse von Stocksembly ist keine Handelsanweisung und kein Renditeversprechen. Jeder Bericht ist eine datierte, KI-gestützte Recherche. Wesentliche Fakten sollten anhand der Originalquellen überprüft werden.",
    points: [
      "Wesentliche Aussagen behalten Quellenkennungen und einen Stichtag für die Belege.",
      "Fehlende, veraltete, nicht verfügbare oder rechtlich eingeschränkt nutzbare Daten werden als Einschränkungen ausgewiesen.",
      "Unbelegte Zahlen sowie Aufforderungen zum sofortigen Kauf oder Verkauf oder Renditegarantien verhindern die Veröffentlichung.",
      "Berichte, die die Voraussetzungen erfüllen, sind nach 30 vollen Tagen ohne Anmeldung lesbar.",
    ],
    editorialAction: "Redaktionelle Richtlinien lesen",
  },
  questions: {
    eyebrow: "Häufige Fragen",
    title: "Bevor Sie die KI-Aktienanalyse starten",
    items: [
      {
        title: "Welche Aktien kann ich analysieren?",
        description:
          "Suchen Sie unterstützte, in den USA börsennotierte Unternehmen nach Tickersymbol oder Unternehmensname und beginnen Sie mit einer konkreten Anlagefrage.",
      },
      {
        title: "Kann ich Recherchen kostenlos lesen?",
        description:
          "Neue Berichte können zunächst Abonnenten zur Verfügung stehen. Berichte, die die Regeln für den öffentlichen Zugang erfüllen, sind nach 30 vollen Tagen für alle zugänglich.",
      },
      {
        title: "Gibt Stocksembly Kaufempfehlungen oder Kursziele aus?",
        description:
          "Nein. Der Dienst bietet Recherche zu Informations- und Bildungszwecken, keine individuelle Beratung, Handelsanweisungen oder Kursziele.",
      },
    ],
  },
  closing: {
    title: "Haben Sie eine Frage zu US-Aktien, die Sie prüfen möchten?",
    description:
      "Geben Sie ein Tickersymbol und eine Anlagefrage ein. Wählen Sie anschließend das gesamte Komitee oder ein spezialisiertes Rechercheteam.",
    action: "Teamrecherche starten",
  },
} as const satisfies UsStockAnalysisCopy;
