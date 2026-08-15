import type { EditorialDepthContent } from "../types";

export const esEditorialDepth = {
  "how-to-read-a-10-k": [
    {
      heading: "Ejemplo: convertir las cifras en una pista de investigación",
      paragraphs: [
        "Supongamos que una empresa de suscripción eleva sus ingresos de 100 a 125 millones de dólares, mientras las cuentas por cobrar suben de 18 a 30 millones. La cuenta de resultados muestra una aceleración, pero el flujo de caja obliga a preguntar si los clientes tardan más en pagar o si la empresa cerró contratos con condiciones más laxas al final del año. Clientes, obligaciones de desempeño pendientes, morosidad y pasivos por contrato ayudan a separar demanda duradera de calendario contable.",
        "Después conecta el flujo operativo con el capex, la remuneración en acciones y las acciones diluidas. La caja puede mejorar mientras empeora la economía por acción, y capitalizar desarrollo puede aplazar costes que la dirección presenta como apalancamiento operativo. No se trata de rechazar todos los ajustes, sino de hacer visibles su coste económico y su momento.",
        "Haz tres pasadas: dibuja primero el negocio y sus segmentos, concilia después beneficio, caja y balance, y por último contrasta el relato de la dirección con riesgos y notas. Una mejor señal de finalización que el número de páginas es poder decir qué evidencia futura confirmaría o rompería la tesis.",
      ],
      bullets: [
        "Comprueba que los Items 1, 7, 8 y 1A cuentan una historia coherente.",
        "Reúne tres años de ingresos, flujo operativo, capex y acciones diluidas.",
        "Marca por separado cambios de políticas, segmentos y lenguaje de riesgos.",
        "Asocia cada pregunta abierta con el documento o evento que podría responderla.",
      ],
    },
  ],
  "earnings-quality-and-cash-conversion": [
    {
      heading: "Ejemplo sencillo de normalización",
      paragraphs: [
        "Con 20 millones de beneficio neto, 15 de flujo operativo y 8 de capex, la conversión aparente es 75% y el FCF es 7 millones. Si el flujo incluye una salida de 6 millones por cuentas por cobrar y suma 5 millones de remuneración en acciones, hay que distinguir la inversión temporal para crecer del coste recurrente necesario para producir ese beneficio.",
        "Una liberación de inventario de 9 millones al año siguiente puede disparar la conversión. No la extrapoles como mejora permanente del margen; muestra la cifra reportada junto a otra normalizada con capital circulante sostenible. En modelos de prepago ocurre lo contrario: la caja llega antes que el beneficio y una conversión alta no implica por sí sola una acción barata.",
        "La conclusión útil ofrece un rango normalizado y los factores que lo explican. Indica qué cambio en plazos de cobro, rotación, capitalización, inversión de mantenimiento o dilución obligaría a revisar el rango.",
      ],
      bullets: [
        "Compara flujo operativo/beneficio y FCF/beneficio operativo durante un ciclo.",
        "Clasifica el circulante entre crecimiento, estacionalidad y presión a terceros.",
        "Comprueba si los ajustes excepcionales se repiten durante tres años.",
        "Reserva el coste futuro si la caja mejoró por falta de inversión.",
      ],
    },
  ],
  "how-to-choose-comparable-companies": [
    {
      heading: "Prueba el grupo comparable con una matriz",
      paragraphs: [
        "Imagina una empresa de software que crece 20%, tiene margen operativo del 15% y 80% de ingresos recurrentes. Un competidor maduro que crece 8% con margen del 35% comparte sector, pero es una referencia débil para expectativas de crecimiento. Otro con crecimiento similar pero inventario y fábricas tiene una economía de caja distinta. Crecimiento, margen, recurrencia e intensidad de capital informan más que una etiqueta.",
        "Puntúa cada candidato de 0 a 2, pero no conviertas el promedio en valoración automática. La matriz sirve para mostrar por qué se justifica una prima o descuento. Separa tres a cinco comparables centrales de referencias usadas para una sola dimensión y evitarás que un extremo domine la conclusión.",
        "Escribe finalmente por qué la empresa merece cotizar por encima o debajo de la mediana. Mayor crecimiento, una pista más larga o menor concentración son razones verificables. Sin ellas, una prima puede ser popularidad y un descuento puede esconder deuda, dilución o ciclicidad.",
      ],
      bullets: [
        "Compara clientes, unidad de cobro, duración contractual y canal de venta.",
        "Alinea crecimiento y márgenes al mismo periodo y política de ajustes.",
        "Prefiere mediana y cuartiles a una media simple.",
        "Anota para cada empresa una razón de inclusión y una diferencia limitante.",
      ],
    },
  ],
  "bull-base-bear-scenario-analysis": [
    {
      heading: "Construye escenarios sin contradicciones internas",
      paragraphs: [
        "Para una empresa con 100 millones de ingresos, el caso base puede combinar 12% más clientes y 3% de precio para producir cerca de 15% de crecimiento. El caso alcista no debe limitarse a escribir 25%: ha de explicar cómo conviven un canal nuevo, menor abandono y mejor mezcla. El bajista debe conectar menor captación o más descuentos con ingresos y margen bruto, no invocar una recesión genérica.",
        "Cambiar ingresos y congelar gastos, capital circulante y acciones crea un modelo incoherente. Crecer más rápido puede exigir contratar o acumular inventario antes de cobrar; financiarlo externamente puede diluir el valor por acción. Usa las mismas fórmulas y definiciones en todos los casos.",
        "Asigna probabilidades solo cuando haya evidencia. Si no, define qué dato de altas netas, retención, precio o margen movería el caso fuera del rango base. El modelo se convierte así en una herramienta para procesar evidencia, no en decoración para un precio objetivo.",
      ],
      bullets: [
        "Usa el mismo horizonte y método de valoración en todos los casos.",
        "Conecta ingresos, margen, reinversión, caja y dilución.",
        "Añade a cada supuesto evidencia, señal y condición de invalidez.",
        "Tras resultados, actualiza primero el supuesto que falló.",
      ],
    },
  ],
  "counterarguments-in-ai-stock-research": [
    {
      heading: "Convierte la objeción en una prueba real",
      paragraphs: [
        "Si la tesis afirma que la mezcla elevará tres puntos el margen bruto, el crítico no debe quedarse en ‘hay competencia’. Debe separar precio, mezcla y coste, y buscar datos que distingan explicaciones: precios rivales, abandono, descuentos o gasto de infraestructura.",
        "Varios agentes leyendo los mismos documentos no son confirmación independiente. Asigna a uno los documentos primarios, a otro competidores e industria y a un tercero definiciones contables y tasas base. Conserva cada juicio inicial antes de sintetizar para detectar el acuerdo causado por contexto compartido.",
        "El archivo final debe mantener afirmaciones debilitadas, preguntas abiertas y la observación que invertiría la decisión. Así se reduce el riesgo de tratar prosa fluida como hecho y la siguiente publicación se convierte en una prueba prevista.",
      ],
      bullets: [
        "Registra fuente, fecha y definición contable de cada afirmación material.",
        "Exige a la contra-tesis la misma precisión y evidencia.",
        "Distingue información ausente de evidencia contraria.",
        "Conserva objeciones rechazadas y el motivo de la decisión.",
      ],
    },
  ],
  "free-cash-flow": [
    {
      heading: "Cálculo práctico y ajustes del inversor",
      paragraphs: [
        "Un flujo operativo de 50 millones menos 18 de capex da 32 millones de FCF. Con valor de empresa de 480 millones, la rentabilidad FCF es 6,7%. Solo es representativa si 18 millones mantienen los activos y el flujo operativo no está inflado por una liberación temporal de circulante.",
        "Si se aplazaron 7 millones de sustitución normal, el FCF normalizado puede acercarse a 25 millones. Si parte del gasto financia crecimiento opcional claramente separable, el FCF actual puede infravalorar la economía futura. Cuando no haya evidencia para separar mantenimiento y crecimiento, usa un rango.",
        "También revisa remuneración en acciones, principal de arrendamientos y adquisiciones recurrentes. No existe una única definición legal de FCF: publica los ajustes y mantén la misma definición entre empresas.",
      ],
      bullets: [
        "Empieza con flujo operativo menos capex.",
        "Usa tres a cinco años de circulante para detectar efectos temporales.",
        "Incluye todo el capex si no puedes probar la separación.",
        "Compara crecimiento del FCF total y por acción para detectar dilución.",
      ],
    },
  ],
  "ev-to-ebitda": [
    {
      heading: "Cálculo del múltiplo y puntos de ruptura",
      paragraphs: [
        "Con 800 millones de capitalización, 200 de deuda y 100 de caja, el valor de empresa simplificado es 900 millones. Si el EBITDA es 100 millones, EV/EBITDA es 9x. Convertibles, minoritarios, pensiones o arrendamientos pueden exigir ajustes adicionales coherentes entre numerador y denominador.",
        "Dos empresas a 9x no son iguales si una dedica 10% del EBITDA al capex de mantenimiento y otra 45%. La caja para propietarios difiere. Tampoco mezcles valor actual con EBITDA histórico para una empresa y EBITDA futuro para otra.",
        "Una conclusión útil explica por qué 9x es prima o descuento razonable frente a un grupo y periodo concretos. Si el EBITDA es negativo o inestable, ingresos, FCF o activos pueden ser marcos más honestos.",
      ],
      bullets: [
        "Alinea deuda, caja y arrendamientos con la definición de EBITDA.",
        "No mezcles denominadores futuros e históricos.",
        "Compara por separado capex y necesidad de circulante.",
        "Devuelve a gastos los ajustes ‘únicos’ que se repiten.",
      ],
    },
  ],
  "earnings-guidance": [
    {
      heading: "Lee la expectativa escondida en el rango",
      paragraphs: [
        "Una guía anual de ingresos de 118–122 millones tiene un punto medio de 120. Si nueve meses suman 87 millones, hacen falta unos 33 millones en el cuarto trimestre. Compararlo con el año anterior, estacionalidad y cartera es mejor que llamar a la guía conservadora por intuición.",
        "La amplitud de 4 millones también informa. Separa divisa, calendario contractual o aprobación regulatoria de una menor visibilidad de demanda. Una subida de guía puede seguir por debajo del consenso, y más ingresos con menor margen pueden provocar una reacción opuesta.",
        "Registra la precisión de la dirección durante varios trimestres. Un equipo que empieza bajo y sube repetidamente no merece la misma confianza que otro que cambia definiciones o incumple rangos. Separa conducta de previsión de cambios reales del negocio.",
      ],
      bullets: [
        "Calcula el punto medio y el resultado necesario en el periodo restante.",
        "Compara guía anterior, consenso y resultado real.",
        "Normaliza divisa, adquisiciones y cambios de definición.",
        "Registra indicadores adelantados y dirección del error histórico.",
      ],
    },
  ],
  "share-dilution": [
    {
      heading: "Cuando crecimiento total y por acción divergen",
      paragraphs: [
        "Si el beneficio sube 10%, de 10 a 11 millones, pero las acciones diluidas pasan de 10 a 10,5 millones, el BPA crece de 1,00 a cerca de 1,05: solo 4,8%. La empresa mejora, pero la economía representada por cada acción existente crece menos de la mitad.",
        "Las recompras no eliminan automáticamente la dilución. Comprar seis millones de acciones mientras se emiten cinco millones como incentivos reduce el total solo un millón. Compara acciones diluidas iniciales y finales, emisiones y caja gastada, no el anuncio.",
        "Opciones y convertibles pueden no aparecer por completo en las acciones básicas. Lee notas de BPA diluido, compensación, conversión y adquisiciones, y modela acciones durante el mismo horizonte que las operaciones.",
      ],
      bullets: [
        "Compara crecimiento de ingresos y beneficio con sus cifras por acción.",
        "Distingue acciones básicas, diluidas medias y de cierre.",
        "Evalúa recompras por cambio neto y precio medio pagado.",
        "Incluye premios no consolidados, opciones y convertibles.",
      ],
    },
  ],
  "margin-of-safety": [
    {
      heading: "Usa un rango de valor, no un único objetivo",
      paragraphs: [
        "Supón un valor conservador de 80 dólares, base de 95 y optimista de 110. Un precio de 70 está 26% por debajo del base, pero solo 12,5% por debajo del conservador. Con incertidumbre material, la segunda comparación puede importar más que el descuento atractivo.",
        "El colchón depende de la fragilidad de la estimación y de la calidad. Una empresa recurrente con caja neta necesita un rango distinto a otra expuesta a materias primas, refinanciación o un solo cliente. Subir la tasa de descuento no neutraliza todo riesgo estructural.",
        "No supongas que el valor no cambió porque cayó el precio. Daño en beneficios o dilución puede bajar todo el rango. El margen de seguridad no garantiza tener razón; deja espacio para sobrevivir al error.",
      ],
      bullets: [
        "Construye valores conservador, base y optimista.",
        "Mide por separado el descuento frente al valor conservador.",
        "Revisa deuda, dilución y concentración fuera del modelo.",
        "Actualiza supuestos de valor antes de reaccionar al precio.",
      ],
    },
  ],
} satisfies EditorialDepthContent;
