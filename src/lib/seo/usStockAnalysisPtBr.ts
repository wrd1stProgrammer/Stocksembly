import type { UsStockAnalysisCopy } from "./usStockAnalysis";

export const usStockAnalysisPtBr = {
  metadata: {
    title: "Análise de ações dos EUA com IA | Stocksembly",
    description:
      "Onze especialistas de IA analisam documentos da SEC, resultados, dados de mercado, valuation e riscos, incluindo a tese contrária.",
  },
  hero: {
    eyebrow: "Pesquisa em equipe com IA sobre ações dos EUA",
    title: "Análise de ações dos EUA feita por um comitê de pesquisa",
    description:
      "A Stocksembly atribui a mesma pergunta de investimento a onze funções especializadas de IA, distribuídas entre equipes de mercado, empresas, finanças e riscos. As evidências, contestações e auditorias são sintetizadas em um único relatório de pesquisa.",
    primaryAction: "Iniciar análise de ações dos EUA",
    secondaryAction: "Explorar pesquisas públicas",
    proof: [
      "Documentos da SEC, resultados e dados de mercado",
      "Evidências e contrapontos apresentados juntos",
      "Pesquisas abertas ao público 30 dias após a publicação",
    ],
  },
  analysis: {
    eyebrow: "Escopo da pesquisa",
    title:
      "Vá além da consulta de um ticker e teste uma pergunta de investimento",
    description:
      "Informe um ticker e uma pergunta para examinar a qualidade do negócio, as expectativas embutidas no valuation, os próximos catalisadores e os riscos de queda, conforme o horizonte e a profundidade escolhidos.",
    cards: [
      {
        title: "Negócio e concorrência",
        description:
          "Relacione o modelo de negócio, os produtos, os clientes, a concorrência e a execução aos documentos regulatórios e às evidências da empresa.",
      },
      {
        title: "Resultados e qualidade financeira",
        description:
          "Diferencie receita, lucro, conversão em caixa e necessidade de reinvestimento, entendendo por que esses números importam.",
      },
      {
        title: "Valuation e comparáveis",
        description:
          "Examine comparações cuja adequação foi verificada e as expectativas do mercado, com indicação explícita quando não houver evidências confiáveis para comparar.",
      },
      {
        title: "Catalisadores e riscos",
        description:
          "Acompanhe resultados, notícias, exposição a políticas e possíveis trajetórias de queda, com condições observáveis que poderiam mudar a avaliação.",
      },
    ],
  },
  committee: {
    eyebrow: "11 funções especializadas · 4 equipes",
    title: "As mesmas evidências, analisadas sob responsabilidades distintas",
    description:
      "A concordância entre agentes não é tratada como prova. Cada equipe responde por um escopo diferente de pesquisa, e as análises do comitê completo incluem contestações entre equipes e votações.",
    teams: [
      {
        title: "Equipe de mercado",
        description:
          "Regime de mercado, notícias, contexto de preços, referências e sensibilidade aos juros",
      },
      {
        title: "Equipe de empresas",
        description:
          "Modelo de negócio, produtos, clientes, concorrência e risco de execução",
      },
      {
        title: "Equipe financeira",
        description:
          "Resultados divulgados, conversão em caixa, qualidade financeira e valuation",
      },
      {
        title: "Equipe de riscos",
        description:
          "Cenários de queda, exposição a políticas, sinais de alerta e fatores mitigadores",
      },
    ],
  },
  process: {
    eyebrow: "Processo de pesquisa",
    title: "Da pergunta do investidor ao relatório publicado",
    steps: [
      {
        number: "01",
        title: "Defina a pergunta e as opções",
        description:
          "Escolha o horizonte, a profundidade da análise, a intensidade dos contrapontos, o objetivo da decisão e os tickers para comparação.",
      },
      {
        number: "02",
        title: "Reúna evidências e analise por função",
        description:
          "As evidências disponíveis em documentos regulatórios, finanças, mercados e notícias são fixadas em um retrato datado e encaminhadas às funções especializadas.",
      },
      {
        number: "03",
        title: "Conteste afirmações e audite evidências",
        description:
          "As posições dos departamentos são contestadas às cegas; em seguida, auditorias estruturais e semânticas verificam a correspondência entre afirmações e fontes.",
      },
      {
        number: "04",
        title: "Síntese da presidência e controle de publicação",
        description:
          "O relatório final apresenta as evidências decisivas, a tese contrária mais forte, as condições que invalidariam a tese, o grau de confiança e as limitações.",
      },
    ],
    methodologyAction: "Ler a metodologia completa",
  },
  standards: {
    eyebrow: "Concebido com base em evidências",
    title: "Preserve o registro que sustenta a conclusão",
    description:
      "A análise da Stocksembly não é uma instrução de negociação nem uma promessa de retorno. Cada relatório é uma pesquisa assistida por IA com data de referência, e os fatos relevantes devem ser conferidos nas fontes originais.",
    points: [
      "Afirmações relevantes mantêm os identificadores das fontes e a data de corte das evidências.",
      "Dados ausentes, desatualizados, indisponíveis ou com restrições de direitos são incluídos nas limitações.",
      "Números sem respaldo e expressões de compra ou venda imediata ou de retorno garantido impedem a publicação.",
      "Relatórios elegíveis ficam disponíveis para leitura sem login após 30 dias completos.",
    ],
    editorialAction: "Ler a política editorial",
  },
  questions: {
    eyebrow: "Perguntas frequentes",
    title: "Antes de iniciar a análise de ações com IA",
    items: [
      {
        title: "Quais ações posso analisar?",
        description:
          "Busque empresas compatíveis listadas nos EUA pelo ticker ou nome e comece com uma pergunta de investimento específica.",
      },
      {
        title: "Posso ler pesquisas gratuitamente?",
        description:
          "Relatórios novos podem ser disponibilizados primeiro aos assinantes. Aqueles que atendem às regras de acesso público ficam abertos a todos após 30 dias completos.",
      },
      {
        title: "A Stocksembly oferece recomendações de compra ou preços-alvo?",
        description:
          "Não. O serviço oferece pesquisa para fins informativos e educacionais, não aconselhamento individualizado, instruções de negociação ou preços-alvo.",
      },
    ],
  },
  closing: {
    title: "Tem uma pergunta sobre ações dos EUA que vale a pena testar?",
    description:
      "Informe um ticker e uma pergunta de investimento, depois escolha o comitê completo ou uma equipe especializada de pesquisa.",
    action: "Iniciar pesquisa em equipe",
  },
} as const satisfies UsStockAnalysisCopy;
