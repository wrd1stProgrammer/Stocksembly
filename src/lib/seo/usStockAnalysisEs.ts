import type { UsStockAnalysisCopy } from "./usStockAnalysis";

export const usStockAnalysisEs = {
  metadata: {
    title: "Análisis de acciones de EE. UU. con IA | Stocksembly",
    description:
      "Once especialistas de IA revisan documentos de la SEC, resultados, datos de mercado, valoración y riesgos, incluida la tesis contraria.",
  },
  hero: {
    eyebrow: "Investigación en equipo con IA sobre acciones de EE. UU.",
    title: "Análisis de acciones de EE. UU. con un comité de investigación",
    description:
      "Stocksembly asigna una misma pregunta de inversión a once roles especializados de IA, distribuidos en equipos de mercado, empresa, finanzas y riesgos. Sus pruebas, objeciones y auditorías se sintetizan en un único informe de investigación.",
    primaryAction: "Iniciar análisis de acciones de EE. UU.",
    secondaryAction: "Explorar investigaciones públicas",
    proof: [
      "Documentos de la SEC, resultados y datos de mercado",
      "Pruebas y argumentos en contra, juntos",
      "Investigaciones públicas a los 30 días de su publicación",
    ],
  },
  analysis: {
    eyebrow: "Alcance de la investigación",
    title:
      "Vaya más allá de buscar un símbolo bursátil y ponga a prueba una pregunta de inversión",
    description:
      "Introduzca un símbolo bursátil y una pregunta para examinar la calidad del negocio, las expectativas implícitas en la valoración, los próximos catalizadores y el riesgo a la baja, según el horizonte y la profundidad elegidos.",
    cards: [
      {
        title: "Negocio y competencia",
        description:
          "Vincule el modelo de negocio, los productos, los clientes, la competencia y la ejecución con documentos regulatorios y pruebas de la empresa.",
      },
      {
        title: "Resultados y calidad financiera",
        description:
          "Distinga ingresos, beneficios, conversión en efectivo y carga de reinversión, y comprenda por qué importan esas cifras.",
      },
      {
        title: "Valoración y comparables",
        description:
          "Revise comparaciones cuya idoneidad se ha comprobado y las expectativas del mercado, con una indicación explícita cuando no haya pruebas fiables para comparar.",
      },
      {
        title: "Catalizadores y riesgos",
        description:
          "Siga los resultados, las noticias, la exposición a políticas y los posibles escenarios bajistas, con condiciones observables que podrían cambiar la perspectiva.",
      },
    ],
  },
  committee: {
    eyebrow: "11 roles especializados · 4 equipos",
    title: "Las mismas pruebas, revisadas desde responsabilidades distintas",
    description:
      "El acuerdo entre agentes no se considera una prueba. Cada equipo se ocupa de un ámbito distinto de investigación, y los análisis del comité completo añaden objeciones entre equipos y votaciones.",
    teams: [
      {
        title: "Equipo de mercado",
        description:
          "Régimen de mercado, noticias, contexto de precios, referencias y sensibilidad a las tasas de interés",
      },
      {
        title: "Equipo de empresa",
        description:
          "Modelo de negocio, productos, clientes, competencia y riesgo de ejecución",
      },
      {
        title: "Equipo financiero",
        description:
          "Resultados publicados, conversión en efectivo, calidad financiera y valoración",
      },
      {
        title: "Equipo de riesgos",
        description:
          "Escenarios bajistas, exposición a políticas, señales de alerta y factores mitigantes",
      },
    ],
  },
  process: {
    eyebrow: "Proceso de investigación",
    title: "De la pregunta del inversor al informe publicado",
    steps: [
      {
        number: "01",
        title: "Defina la pregunta y las opciones",
        description:
          "Elija el horizonte, la profundidad del análisis, la intensidad de los argumentos en contra, el propósito de la decisión y los símbolos bursátiles de comparación.",
      },
      {
        number: "02",
        title: "Recopile pruebas y analice por rol",
        description:
          "Las pruebas disponibles en documentos regulatorios, finanzas, mercados y noticias se fijan en una instantánea fechada y se asignan a roles especializados.",
      },
      {
        number: "03",
        title: "Cuestione las afirmaciones y audite las pruebas",
        description:
          "Las posiciones de cada departamento se cuestionan a ciegas; después, auditorías estructurales y semánticas verifican la correspondencia entre afirmaciones y fuentes.",
      },
      {
        number: "04",
        title: "Síntesis de la presidencia y control de publicación",
        description:
          "El informe final incluye las pruebas decisivas, el argumento contrario más sólido, las condiciones que refutarían la tesis, el nivel de confianza y las limitaciones.",
      },
    ],
    methodologyAction: "Leer la metodología completa",
  },
  standards: {
    eyebrow: "Diseñado en torno a las pruebas",
    title: "Conserve el registro que sustenta la conclusión",
    description:
      "El análisis de Stocksembly no es una instrucción de compraventa ni una promesa de rentabilidad. Cada informe es una investigación asistida por IA con una fecha de referencia; los hechos relevantes deben contrastarse con las fuentes originales.",
    points: [
      "Las afirmaciones relevantes conservan los identificadores de las fuentes y la fecha de corte de las pruebas.",
      "Los datos faltantes, desactualizados, no disponibles o sujetos a restricciones de derechos se reflejan en las limitaciones.",
      "Las cifras sin respaldo y las expresiones que instan a comprar o vender de inmediato o garantizan rentabilidad bloquean la publicación.",
      "Los informes que cumplen los requisitos pueden leerse sin iniciar sesión una vez transcurridos 30 días completos.",
    ],
    editorialAction: "Leer la política editorial",
  },
  questions: {
    eyebrow: "Preguntas frecuentes",
    title: "Antes de iniciar el análisis de acciones con IA",
    items: [
      {
        title: "¿Qué acciones puedo analizar?",
        description:
          "Busque empresas admitidas que cotizan en EE. UU. por su símbolo bursátil o nombre y comience con una pregunta de inversión concreta.",
      },
      {
        title: "¿Puedo leer investigaciones gratis?",
        description:
          "Los informes nuevos pueden estar disponibles primero para suscriptores. Los que cumplen las reglas de acceso público se abren a todos después de 30 días completos.",
      },
      {
        title:
          "¿Stocksembly ofrece recomendaciones de compra o precios objetivo?",
        description:
          "No. El servicio ofrece investigación con fines informativos y educativos, no asesoramiento individualizado, instrucciones de compraventa ni precios objetivo.",
      },
    ],
  },
  closing: {
    title:
      "¿Tiene una pregunta sobre acciones de EE. UU. que merece ponerse a prueba?",
    description:
      "Introduzca un símbolo bursátil y una pregunta de inversión; después, elija el comité completo o un equipo especializado de investigación.",
    action: "Iniciar investigación en equipo",
  },
} as const satisfies UsStockAnalysisCopy;
