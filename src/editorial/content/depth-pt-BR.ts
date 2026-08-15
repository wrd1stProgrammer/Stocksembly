import type { EditorialDepthContent } from "../types";

export const ptBrEditorialDepth = {
  "how-to-read-a-10-k": [
    {
      heading: "Exemplo: conecte os números em uma trilha de pesquisa",
      paragraphs: [
        "Suponha que uma empresa de assinaturas aumente a receita de US$100 milhões para US$125 milhões, enquanto contas a receber sobem de US$18 milhões para US$30 milhões. A demonstração de resultados mostra aceleração, mas o fluxo de caixa exige perguntar se os clientes demoraram mais para pagar ou se contratos mais flexíveis foram empurrados no fim do ano. Clientes, obrigações de desempenho, atrasos e passivos contratuais ajudam a separar demanda durável de efeito temporal.",
        "Depois ligue o fluxo operacional ao capex e registre separadamente remuneração em ações e ações diluídas. O caixa pode melhorar enquanto a economia por ação piora, e o desenvolvimento capitalizado pode adiar custos apresentados como alavancagem operacional. O objetivo não é rejeitar todo ajuste, mas tornar visíveis custo econômico e momento.",
        "Faça três leituras: mapeie negócio e segmentos, reconcilie lucro, caixa e balanço, e então desafie a explicação da gestão com riscos e notas. Um critério melhor que páginas lidas é conseguir dizer qual próxima evidência confirmaria ou quebraria a tese.",
      ],
      bullets: [
        "Verifique se os Items 1, 7, 8 e 1A contam uma história consistente.",
        "Reúna três anos de receita, fluxo operacional, capex e ações diluídas.",
        "Marque mudanças em políticas, segmentos e linguagem de risco.",
        "Associe cada pergunta aberta ao documento ou evento que pode respondê-la.",
      ],
    },
  ],
  "earnings-quality-and-cash-conversion": [
    {
      heading: "Exemplo simples de normalização",
      paragraphs: [
        "Com lucro líquido de US$20 milhões, fluxo operacional de US$15 milhões e capex de US$8 milhões, a conversão aparente é 75% e o FCF é US$7 milhões. Se o fluxo inclui saída de US$6 milhões em recebíveis e adiciona US$5 milhões de remuneração em ações, separe investimento temporário para crescer de custo recorrente para produzir o lucro.",
        "Uma liberação de estoque de US$9 milhões no ano seguinte pode fazer a conversão disparar. Não extrapole como melhoria permanente; mostre o valor reportado e outro normalizado com capital de giro sustentável. Em assinaturas pré-pagas, o caixa chega antes do lucro e conversão alta não significa ação barata.",
        "A conclusão útil apresenta uma faixa normalizada e seus motores. Diga qual mudança em prazos, giro, capitalização, manutenção ou diluição faria você revisar a faixa.",
      ],
      bullets: [
        "Compare fluxo operacional/lucro e FCF/lucro operacional ao longo do ciclo.",
        "Classifique capital de giro em crescimento, sazonalidade ou pressão a terceiros.",
        "Rastreie ajustes supostamente excepcionais por três anos.",
        "Reserve o custo futuro se o caixa melhorou por subinvestimento.",
      ],
    },
  ],
  "how-to-choose-comparable-companies": [
    {
      heading: "Teste os pares com uma matriz",
      paragraphs: [
        "Imagine uma empresa de software crescendo 20%, com margem operacional de 15% e 80% de receita recorrente. Uma madura crescendo 8% com margem de 35% compartilha o setor, mas é uma âncora fraca para crescimento. Outra com crescimento semelhante, porém estoque de hardware e fábricas, tem economia de caixa diferente. Crescimento, margem, recorrência e intensidade de capital informam mais que um rótulo.",
        "Dê notas de 0 a 2, mas não transforme a média em avaliação automática. A matriz mostra por que prêmio ou desconto pode ser justificado. Separe três a cinco pares centrais de referências usadas em uma única dimensão para que um extremo não controle o resultado.",
        "Escreva por que a empresa merece negociar acima ou abaixo da mediana. Crescimento maior, pista mais longa ou menor concentração são verificáveis. Sem motivo testável, prêmio pode ser popularidade; desconto pode esconder alavancagem, diluição ou ciclicidade.",
      ],
      bullets: [
        "Compare clientes, unidade de cobrança, contrato e canal de venda.",
        "Alinhe crescimento e margem ao mesmo período e ajustes.",
        "Prefira mediana e quartis a uma média simples.",
        "Registre uma razão de inclusão e uma diferença limitante por empresa.",
      ],
    },
  ],
  "bull-base-bear-scenario-analysis": [
    {
      heading: "Construa cenários sem contradição interna",
      paragraphs: [
        "Para uma empresa com US$100 milhões de receita, o caso base pode combinar 12% mais clientes e 3% de preço, chegando perto de 15% de crescimento. O otimista não deve apenas digitar 25%: explique como novo canal, menor churn e mix melhor coexistem. O pessimista deve ligar aquisição menor ou descontos a receita e margem bruta, não citar recessão genérica.",
        "Mudar receita e congelar despesas, capital de giro e ações cria incoerência. Crescimento rápido pode exigir contratação ou estoque antes da receita, e financiamento externo pode diluir valor por ação. Use as mesmas fórmulas e definições em todos os casos.",
        "Só atribua probabilidades com evidência. Caso contrário, defina qual dado de clientes, retenção, preço ou margem moveria o caso para fora da faixa base. O modelo vira ferramenta de evidência, não decoração de preço-alvo.",
      ],
      bullets: [
        "Use o mesmo horizonte e método de avaliação em todos os casos.",
        "Conecte receita, margem, reinvestimento, caixa e diluição.",
        "Dê a cada premissa evidência, sinal e condição de invalidação.",
        "Após resultados, atualize a premissa errada antes do preço-alvo.",
      ],
    },
  ],
  "counterarguments-in-ai-stock-research": [
    {
      heading: "Transforme a objeção em teste real",
      paragraphs: [
        "Se a tese diz que o mix elevará a margem bruta em três pontos, o crítico não deve parar em ‘há concorrência’. Separe preço, mix e custo e procure dados que distingam explicações: preço rival, churn, descontos ou infraestrutura.",
        "Vários agentes lendo os mesmos documentos não são confirmação independente. Dê a um os registros primários, a outro concorrentes e setor e a um terceiro definições contábeis e taxas-base. Preserve julgamentos iniciais antes da síntese para detectar concordância por contexto compartilhado.",
        "O arquivo final mantém alegações enfraquecidas, perguntas abertas e a observação que inverteria a decisão. Isso reduz o risco de tratar texto fluente como fato e transforma a próxima divulgação em teste planejado.",
      ],
      bullets: [
        "Registre fonte, data e definição contábil de cada alegação material.",
        "Exija da contra-tese a mesma precisão e evidência.",
        "Separe ausência de informação de evidência contrária.",
        "Guarde desafios rejeitados e o motivo da decisão.",
      ],
    },
  ],
  "free-cash-flow": [
    {
      heading: "Cálculo prático e ajustes do investidor",
      paragraphs: [
        "Fluxo operacional de US$50 milhões menos capex de US$18 milhões gera FCF de US$32 milhões. Com valor da firma de US$480 milhões, o rendimento é 6,7%. Só vale se US$18 milhões mantêm os ativos e o fluxo não foi inflado por liberação temporária de capital de giro.",
        "Se US$7 milhões de reposição normal foram adiados, o FCF normalizado pode ficar perto de US$25 milhões. Se parte do gasto financia crescimento opcional comprovável, o FCF atual pode subestimar a economia futura. Sem evidência para separar manutenção e crescimento, use uma faixa.",
        "Revise também remuneração em ações, principal de arrendamentos e aquisições recorrentes. Não existe uma única definição legal de FCF; divulgue os ajustes e mantenha a definição entre empresas.",
      ],
      bullets: [
        "Comece por fluxo operacional menos capex.",
        "Use três a cinco anos de capital de giro para achar efeitos temporários.",
        "Inclua todo capex se a separação não puder ser comprovada.",
        "Compare crescimento do FCF total e por ação para detectar diluição.",
      ],
    },
  ],
  "ev-to-ebitda": [
    {
      heading: "Cálculo do múltiplo e onde a comparação quebra",
      paragraphs: [
        "Com valor de mercado de US$800 milhões, dívida de US$200 milhões e caixa de US$100 milhões, o valor da firma simplificado é US$900 milhões. EBITDA de US$100 milhões produz 9x. Conversíveis, minoritários, pensões ou arrendamentos podem exigir ajustes coerentes entre numerador e denominador.",
        "Duas empresas a 9x diferem se uma gasta 10% do EBITDA em manutenção e outra 45%. O caixa aos proprietários não é igual. Também não misture valor atual com EBITDA histórico para uma e futuro para outra.",
        "Uma boa conclusão explica por que 9x é prêmio ou desconto razoável perante pares e período específicos. Se EBITDA for negativo ou instável, receita, FCF ou ativos podem ser mais honestos.",
      ],
      bullets: [
        "Alinhe dívida, caixa e arrendamentos à definição de EBITDA.",
        "Não misture denominadores futuros e passados.",
        "Compare capex e necessidade de capital de giro separadamente.",
        "Reponha em despesas os ajustes ‘únicos’ recorrentes.",
      ],
    },
  ],
  "earnings-guidance": [
    {
      heading: "Leia a expectativa escondida na faixa",
      paragraphs: [
        "Uma orientação anual de receita de US$118–122 milhões tem ponto médio de US$120 milhões. Se nove meses somam US$87 milhões, o quarto trimestre precisa de cerca de US$33 milhões. Compare com o ano anterior, sazonalidade e carteira em vez de chamar a orientação de conservadora por instinto.",
        "A largura de US$4 milhões também informa. Separe câmbio, prazo de contrato ou aprovação regulatória de menor visibilidade da demanda. Elevar a orientação ainda pode ficar abaixo do consenso, e mais receita com margem menor pode gerar reação oposta.",
        "Registre a precisão da gestão por vários trimestres. Uma equipe que começa baixa e sobe não merece a mesma confiança que outra que muda definições ou perde faixas. Separe comportamento de previsão de mudança real do negócio.",
      ],
      bullets: [
        "Calcule o ponto médio e o resultado necessário no período restante.",
        "Compare orientação anterior, consenso e resultado real.",
        "Normalize câmbio, aquisições e mudanças de definição.",
        "Registre indicadores antecedentes e direção do erro histórico.",
      ],
    },
  ],
  "share-dilution": [
    {
      heading: "Quando crescimento total e por ação divergem",
      paragraphs: [
        "Se o lucro cresce 10%, de US$10 para US$11 milhões, mas ações diluídas sobem de 10 para 10,5 milhões, o LPA cresce de US$1,00 para cerca de US$1,05: apenas 4,8%. A empresa melhora, mas a economia de cada ação existente cresce menos da metade.",
        "Recompras não resolvem diluição automaticamente. Comprar seis milhões de ações enquanto cinco milhões são emitidas em incentivos reduz apenas um milhão. Compare ações diluídas iniciais e finais, emissões e caixa gasto, não o anúncio.",
        "Opções e conversíveis podem não aparecer por completo nas ações básicas. Leia notas de LPA diluído, remuneração, conversão e aquisições e modele ações no mesmo horizonte operacional.",
      ],
      bullets: [
        "Compare crescimento de receita e lucro com versões por ação.",
        "Separe ações básicas, médias diluídas e de fim de período.",
        "Avalie recompras por mudança líquida e preço médio.",
        "Inclua prêmios não adquiridos, opções e conversíveis.",
      ],
    },
  ],
  "margin-of-safety": [
    {
      heading: "Use uma faixa de valor, não um único alvo",
      paragraphs: [
        "Suponha valor conservador de US$80, base de US$95 e otimista de US$110. Preço de US$70 está 26% abaixo do base, mas apenas 12,5% abaixo do conservador. Com incerteza material, a segunda comparação pode importar mais.",
        "A margem necessária depende da fragilidade da estimativa e da qualidade. Receita recorrente com caixa líquido exige faixa diferente de exposição a commodities, refinanciamento ou um cliente. Aumentar a taxa de desconto não elimina todo risco estrutural.",
        "Não suponha valor constante só porque o preço caiu. Dano nos lucros ou diluição pode reduzir toda a faixa. Margem de segurança não garante acerto; cria espaço para sobreviver ao erro.",
      ],
      bullets: [
        "Construa valores conservador, base e otimista.",
        "Meça separadamente o desconto ao valor conservador.",
        "Revise dívida, diluição e concentração fora do modelo.",
        "Atualize premissas de valor antes de reagir ao preço.",
      ],
    },
  ],
} satisfies EditorialDepthContent;
