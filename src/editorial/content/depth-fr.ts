import type { EditorialDepthContent } from "../types";

export const frEditorialDepth = {
  "how-to-read-a-10-k": [
    {
      heading: "Exemple : relier les chiffres en une piste de recherche",
      paragraphs: [
        "Imaginons une société d'abonnement dont le chiffre d'affaires passe de 100 à 125 M$, tandis que les créances montent de 18 à 30 M$. Le compte de résultat montre une accélération, mais le flux de trésorerie pose la vraie question : les clients paient-ils plus tard, ou des contrats plus souples ont-ils été poussés en fin d'année ? Clients, obligations de performance, retards et passifs contractuels distinguent demande durable et calendrier.",
        "Reliez ensuite le flux opérationnel aux investissements et notez séparément rémunération en actions et titres dilués. La trésorerie peut progresser pendant que l'économie par action se dégrade ; le développement capitalisé peut repousser des coûts présentés comme levier opérationnel. Il faut rendre visibles le coût économique et son calendrier, pas rejeter tout ajustement.",
        "Procédez en trois lectures : cartographiez activité et segments, réconciliez résultat, trésorerie et bilan, puis confrontez le discours aux risques et annexes. Un meilleur critère que le nombre de pages est de savoir quelle prochaine preuve confirmerait ou invaliderait la thèse.",
      ],
      bullets: [
        "Vérifiez que les Items 1, 7, 8 et 1A racontent la même activité.",
        "Rassemblez trois ans de revenus, flux opérationnel, capex et actions diluées.",
        "Marquez séparément les changements de règles, segments et risques.",
        "Associez chaque question ouverte au document ou événement qui peut y répondre.",
      ],
    },
  ],
  "earnings-quality-and-cash-conversion": [
    {
      heading: "Un exemple simple de normalisation",
      paragraphs: [
        "Avec 20 M$ de résultat net, 15 M$ de flux opérationnel et 8 M$ de capex, la conversion affichée est de 75% et le FCF de 7 M$. Si le flux inclut une sortie de 6 M$ liée aux créances et réintègre 5 M$ de rémunération en actions, il faut séparer l'investissement temporaire de croissance du coût récurrent nécessaire au résultat.",
        "Une libération de stocks de 9 M$ l'année suivante peut faire bondir la conversion. Ne l'extrapolez pas comme amélioration permanente : présentez le chiffre publié et un chiffre normalisé avec un fonds de roulement durable. Dans les modèles prépayés, la trésorerie précède le résultat et une conversion élevée ne signifie pas une action bon marché.",
        "Une conclusion exploitable donne une fourchette normalisée et ses moteurs. Indiquez quel changement de délais, rotation, capitalisation, maintenance ou dilution imposerait de la réviser.",
      ],
      bullets: [
        "Comparez flux opérationnel/résultat et FCF/résultat opérationnel sur un cycle.",
        "Classez le fonds de roulement entre croissance, saisonnalité et pression externe.",
        "Suivez pendant trois ans les ajustements dits exceptionnels.",
        "Réservez le coût futur si la trésorerie vient d'un sous-investissement.",
      ],
    },
  ],
  "how-to-choose-comparable-companies": [
    {
      heading: "Testez les comparables avec une grille",
      paragraphs: [
        "Prenons un éditeur qui croît de 20%, affiche 15% de marge opérationnelle et 80% de revenus récurrents. Un acteur mature à 8% de croissance et 35% de marge partage le secteur, mais ancre mal les attentes de croissance. Un autre à croissance similaire mais avec stocks et usines a une économie de trésorerie différente. Croissance, marge, récurrence et intensité capitalistique sont plus utiles qu'une étiquette.",
        "Attribuez 0 à 2 points sans transformer la moyenne en valorisation automatique. La grille révèle pourquoi une prime ou décote se justifie. Séparez trois à cinq pairs centraux des références utiles pour une seule dimension afin qu'un extrême ne domine pas la conclusion.",
        "Expliquez enfin pourquoi la société mérite de traiter au-dessus ou sous la médiane. Croissance supérieure, piste plus longue ou moindre concentration sont testables. Sans raison, une prime peut n'être que popularité ; une décote peut cacher dette, dilution ou cyclicité.",
      ],
      bullets: [
        "Comparez clients, unité de facturation, durée contractuelle et distribution.",
        "Alignez croissance et marges sur la même période et les mêmes ajustements.",
        "Préférez médiane et quartiles à une moyenne simple.",
        "Notez une raison d'inclusion et une différence limitante par pair.",
      ],
    },
  ],
  "bull-base-bear-scenario-analysis": [
    {
      heading: "Construisez des scénarios sans contradiction interne",
      paragraphs: [
        "Pour 100 M$ de revenus, le cas central peut associer 12% de clients en plus et 3% de prix pour environ 15% de croissance. Le cas haussier ne doit pas seulement saisir 25% : il explique comment nouveau canal, attrition moindre et meilleur mix coexistent. Le cas baissier relie acquisition plus faible ou remises aux revenus et à la marge brute, plutôt que d'invoquer une récession vague.",
        "Modifier les revenus en figeant dépenses, fonds de roulement et actions crée une incohérence. Une croissance rapide peut demander embauches ou stocks avant encaissement ; le financement externe peut diluer la valeur par action. Utilisez les mêmes formules et définitions dans tous les cas.",
        "N'attribuez des probabilités qu'avec des preuves. Sinon, définissez quelle donnée de clients, rétention, prix ou marge ferait sortir du cas central. Le modèle traite alors les preuves au lieu de décorer un objectif de cours.",
      ],
      bullets: [
        "Gardez le même horizon et la même méthode de valorisation.",
        "Reliez revenus, marge, réinvestissement, trésorerie et dilution.",
        "Donnez à chaque hypothèse preuve, signal et condition d'invalidation.",
        "Après les résultats, corrigez l'hypothèse avant l'objectif de cours.",
      ],
    },
  ],
  "counterarguments-in-ai-stock-research": [
    {
      heading: "Transformez l'objection en test réel",
      paragraphs: [
        "Si la thèse affirme que le mix ajoutera trois points de marge brute, le contradicteur ne s'arrête pas à « la concurrence est forte ». Il sépare prix, mix et coûts, puis cherche les données distinguant les explications : prix concurrents, attrition, remises ou infrastructure.",
        "Plusieurs agents lisant les mêmes documents ne sont pas une confirmation indépendante. Confiez à l'un les dépôts primaires, à l'autre concurrents et secteur, au troisième définitions comptables et taux de base. Conservez les jugements initiaux avant synthèse pour voir l'accord créé par le contexte partagé.",
        "Le dossier final garde les affirmations affaiblies, questions ouvertes et observation qui renverserait la décision. Cela réduit le risque de prendre une prose fluide pour un fait et transforme la prochaine publication en test prévu.",
      ],
      bullets: [
        "Consignez source, date et définition comptable de chaque affirmation matérielle.",
        "Exigez la même précision et les mêmes preuves de la contre-thèse.",
        "Distinguez absence d'information et preuve contraire.",
        "Conservez les objections rejetées avec le motif de décision.",
      ],
    },
  ],
  "free-cash-flow": [
    {
      heading: "Calcul pratique et ajustements de l'investisseur",
      paragraphs: [
        "50 M$ de flux opérationnel moins 18 M$ de capex donnent 32 M$ de FCF. Avec une valeur d'entreprise de 480 M$, le rendement est 6,7%. Il n'est pertinent que si 18 M$ entretiennent les actifs et qu'une libération temporaire du fonds de roulement ne gonfle pas le flux.",
        "Si 7 M$ de remplacement normal ont été différés, le FCF normalisé peut approcher 25 M$. Si une part identifiable finance une croissance optionnelle, le FCF actuel peut sous-estimer l'économie future. Sans preuve pour séparer maintenance et croissance, utilisez une fourchette.",
        "Examinez aussi rémunération en actions, principal des loyers et acquisitions récurrentes. Il n'existe pas de définition légale unique du FCF : publiez les ajustements et gardez la même définition entre sociétés.",
      ],
      bullets: [
        "Commencez par flux opérationnel moins capex.",
        "Utilisez trois à cinq ans de fonds de roulement pour repérer les effets temporaires.",
        "Incluez tout le capex si la séparation n'est pas démontrable.",
        "Comparez croissance du FCF total et par action pour détecter la dilution.",
      ],
    },
  ],
  "ev-to-ebitda": [
    {
      heading: "Calcul du multiple et ruptures de comparaison",
      paragraphs: [
        "Avec 800 M$ de capitalisation, 200 M$ de dette et 100 M$ de trésorerie, la valeur d'entreprise simplifiée est 900 M$. Pour 100 M$ d'EBITDA, EV/EBITDA vaut 9x. Convertibles, minoritaires, retraites ou loyers peuvent exiger d'autres ajustements cohérents entre numérateur et dénominateur.",
        "Deux sociétés à 9x diffèrent si l'une dépense 10% de l'EBITDA en maintenance et l'autre 45%. La trésorerie laissée aux actionnaires n'est pas comparable. Ne mélangez pas non plus valeur actuelle et EBITDA passé pour l'une, futur pour l'autre.",
        "Une conclusion utile explique pourquoi 9x constitue une prime ou décote justifiée face à un groupe et une période précis. Si l'EBITDA est négatif ou instable, revenus, FCF ou actifs sont souvent plus honnêtes.",
      ],
      bullets: [
        "Alignez dette, trésorerie et loyers avec la définition de l'EBITDA.",
        "Ne mélangez pas dénominateurs futurs et historiques.",
        "Comparez séparément capex et besoin en fonds de roulement.",
        "Réintégrez en charges les ajustements « uniques » récurrents.",
      ],
    },
  ],
  "earnings-guidance": [
    {
      heading: "Lisez l'attente cachée dans la fourchette",
      paragraphs: [
        "Une guidance annuelle de 118–122 M$ a un milieu de 120 M$. Si neuf mois totalisent 87 M$, il faut environ 33 M$ au quatrième trimestre. La comparaison avec l'an passé, la saisonnalité et le carnet est plus utile qu'une impression de prudence.",
        "La largeur de 4 M$ informe aussi. Séparez change, calendrier des contrats ou autorisation réglementaire d'une visibilité moindre de la demande. Une hausse peut rester sous le consensus, et plus de revenus avec moins de marge peut provoquer la réaction opposée.",
        "Suivez la précision de la direction sur plusieurs trimestres. Une équipe qui commence bas et relève n'obtient pas la même confiance qu'une autre qui change les définitions ou manque ses plages. Séparez comportement de prévision et changement réel.",
      ],
      bullets: [
        "Calculez le milieu et la performance requise sur la période restante.",
        "Comparez ancienne guidance, consensus et résultat réel.",
        "Normalisez change, acquisitions et changements de définition.",
        "Notez indicateurs avancés et direction des erreurs historiques.",
      ],
    },
  ],
  "share-dilution": [
    {
      heading: "Quand croissance totale et par action divergent",
      paragraphs: [
        "Si le bénéfice passe de 10 à 11 M$, soit +10%, mais les actions diluées de 10 à 10,5 millions, le BPA passe de 1,00 à environ 1,05 dollar : seulement +4,8%. La société progresse, mais l'économie de chaque action existante croît moins de moitié autant.",
        "Les rachats n'annulent pas automatiquement la dilution. Acheter six millions d'actions tout en en émettant cinq millions en rémunération ne réduit le total que d'un million. Comparez actions diluées initiales et finales, émissions et trésorerie dépensée, pas l'annonce.",
        "Options et convertibles peuvent ne pas apparaître entièrement dans les actions de base. Lisez les notes de BPA dilué, rémunération, conversion et acquisitions, puis modélisez les actions sur le même horizon opérationnel.",
      ],
      bullets: [
        "Comparez croissance des revenus et profits avec leurs versions par action.",
        "Distinguez actions de base, moyennes diluées et de clôture.",
        "Jugez les rachats par variation nette et prix moyen.",
        "Incluez attributions non acquises, options et convertibles.",
      ],
    },
  ],
  "margin-of-safety": [
    {
      heading: "Utilisez une fourchette de valeur, pas une cible unique",
      paragraphs: [
        "Supposons une valeur prudente de 80 $, centrale de 95 $ et optimiste de 110 $. Un cours de 70 $ est 26% sous le central, mais seulement 12,5% sous le prudent. Avec une forte incertitude, la seconde comparaison peut compter davantage.",
        "Le coussin dépend de la fragilité de l'estimation et de la qualité. Revenus récurrents et trésorerie nette exigent une plage différente d'une exposition aux matières premières, au refinancement ou à un client. Augmenter le taux d'actualisation ne neutralise pas tous les risques structurels.",
        "Ne supposez pas que la valeur est restée stable parce que le cours a baissé. Dégradation des profits ou dilution peut réduire toute la plage. La marge de sécurité ne garantit pas d'avoir raison ; elle laisse de l'espace pour survivre à l'erreur.",
      ],
      bullets: [
        "Construisez des valeurs prudente, centrale et optimiste.",
        "Mesurez séparément la décote au scénario prudent.",
        "Revoyez dette, dilution et concentration hors modèle.",
        "Mettez à jour les hypothèses de valeur avant de réagir au cours.",
      ],
    },
  ],
} satisfies EditorialDepthContent;
