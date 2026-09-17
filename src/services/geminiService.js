// Gemini API client supporting Gemini 3.8 Flash, 3.7 Flash, 3.5 Flash-Lite

export const SUPPORTED_MODELS = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Recommended • Deep Literary Reasoning',
    description: 'Most intelligent Flash model, offering enhanced nuance, complex synthesis, and rich thematic analysis.'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    tag: 'Workhorse • Fast & Comprehensive',
    description: 'High-speed reasoning model tailored for long-horizon document comprehension and balanced pacing.'
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    tag: 'Ultra Fast • Cost-Efficient',
    description: 'Lightweight, rapid response model optimized for high throughput and concise synthesis.'
  }
];

export async function testGeminiConnection(apiKey, model = 'gemini-3.8-flash') {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key is empty. Please enter your Google Gemini API key.');
  }

  const cleanKey = apiKey.trim();
  const cleanModel = model.trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Respond with the exact word "CONNECTED" to confirm API accessibility.' }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 10
      }
    })
  });

  if (!response.ok) {
    let errorDetails = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.error && errJson.error.message) {
        errorDetails = errJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(`Gemini API Error: ${errorDetails}`);
  }

  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { success: true, message: `Successfully connected to ${cleanModel}!` };
}

export async function generateChapterSummary({
  apiKey,
  model = 'gemini-3.8-flash',
  systemInstructions,
  userPrompt,
  isMockMode = false,
  chapterLabel = 'Chapter',
  bookTitle = 'Book',
  sampleText = '',
  language = 'en',
  signal = null
}) {
  if (signal?.aborted) {
    throw new DOMException('Generation was cancelled', 'AbortError');
  }

  if (isMockMode || !apiKey || !apiKey.trim()) {
    // Wait with cancellation support
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1400);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Generation was cancelled', 'AbortError'));
        }, { once: true });
      }
    });
    return generateMockSummary(chapterLabel, bookTitle, sampleText, language);
  }

  const cleanKey = apiKey.trim();
  const cleanModel = model.trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstructions }]
    },
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 8192
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errMsg = errJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(`[${cleanModel}] ${errMsg}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate || !candidate.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned an empty or filtered response.');
  }

  return candidate.content.parts[0].text;
}

function generateMockSummary(chapterLabel, bookTitle, sampleText, language = 'en') {
  const words = sampleText.split(/\s+/).slice(0, 40).join(' ');

  if (language === 'fr') {
    return `### 1. Objectif Central & Thèse
La section *${chapterLabel}* de l'ouvrage *${bookTitle}* pose les enjeux thématiques décisifs et propulse la tension narrative. Elle fait passer les protagonistes d'une contemplation spéculative à une confrontation stratégique active.

### 2. Déroulement Chronologique
- **Exposition Initiale :** Le chapitre débute par un état des lieux minutieux, ancrant les personnages dans leur environnement physique et leurs dilemmes intérieurs.
- **Montée des Tensions :** Des variables imprévues et des points de discorde émergent, ébranlant les certitudes préalablement admises.
- **Le Pivot Décisif :** Un tournant majeur survient, imposant un choix irréversible qui dicte la dynamique de tout le dénouement.
- **Point Culminant & Conséquences :** Les retombées immédiates éclairent les faiblesses sous-jacentes et redistribuent les rapports de force.

### 3. Références Majeures & Contexte
- **Point d'Ancrage Initial :** *L'observation liminaire de la situation ("${words.slice(0, 70)}...")* — *Pourquoi cela compte :* Établit l'atmosphère pesante avant que l'affrontement principal ne se déclenche.
- **Point de Bascule Médian :** *L'instant de rupture idéologique et de prise de conscience* — *Pourquoi cela compte :* Constitue le pivot qui dissout les anciennes certitudes.
- **Ancrage Conclusif / Transition :** *La réflexion silencieuse au crépuscule* — *Pourquoi cela compte :* Laisse des énigmes cruciales en suspens, construisant une passerelle indispensable vers la suite.

### 4. Enseignements Clés, Sous-Texte & Présages
- **Sous-texte Thématique :** Les motifs environnementaux récurrents font écho à la désintégration morale des figures centrales.
- **Présage Narratif :** Le détail apparemment anodin des protocoles ignorés au départ réapparaîtra comme catalyseur critique.`;
  }

  if (language === 'zh' || language === 'zh-TW') {
    return `### 1. 核心目标与主旨
《${bookTitle}》的本章节【${chapterLabel}】奠定了全书极其关键的主题基调，推动了情节发展。它促使主要人物从沉思观望走向直接冲突与战略博弈。

### 2. 编年时序拆解
- **序幕与背景铺垫：** 章节开篇深入审视当下困境，将人物牢牢锚定在具体现实与内在心理张力之中。
- **冲突升级与变数：** 随着不可预知的变数与异见观点出现，原有的认知体系遭到深刻冲击。
- **关键转折点：** 突发危机促成不可逆转的重大决断，彻底重构了后续的行动逻辑。
- **高潮爆发与余波：** 决断带来的连锁反应迅速显现，暴露出深层隐患并打破了既有的力量均衡。

### 3. 核心定位锚点与语境阐释
- **前段场景锚点：** *开篇对于现状的细致观察 ("${words.slice(0, 60)}...")* —— *为何至关重要：* 定格了全局的压抑氛围，为主线矛盾的爆发筑牢地基。
- **中段转折锚点：** *核心观念裂变与顿悟时刻* —— *为何至关重要：* 成为打破既有同盟与信念的分水岭，加速了危机演进。
- **尾段终局锚点：** *暮色降临之际的沉思* —— *为何至关重要：* 悬置了未决谜题，为后续章节铺就了无可替代的桥梁。

### 4. 关键洞察、潜台词与深层伏笔
- **主题潜台词：** 循环出现的意象隐喻着核心人物内心的信仰动摇。
- **叙事伏笔：** 开局看似被忽视的微小异常，将在后续形成无可挽回的风暴。`;
  }

  if (language === 'es') {
    return `### 1. Objetivo Central y Tesis
La sección *${chapterLabel}* de *${bookTitle}* establece apuestas temáticas decisivas e impulsa la narrativa hacia adelante. Marca la transición de los protagonistas desde la contemplación abstracta hacia el conflicto activo y las decisiones irreversibles.

### 2. Desglose Cronológico
- **Configuración Inicial y Exposición:** El capítulo abre con un análisis del dilema presente, enraizando a los personajes en su entorno y psicología.
- **Conflicto Creciente:** Surgen variables imprevistas y fricciones que desafían las suposiciones iniciales.
- **Punto de Giro Decisivo:** Ocurre un momento de ruptura o revelación que fuerza una elección sin retorno.
- **Clímax y Repercusiones:** Las consecuencias inmediatas se desatan, dejando al descubierto vulnerabilidades latentes.

### 3. Puntos de Anclaje y Contexto
- **Anclaje Inicial:** *El examen de apertura de la situación ("${words.slice(0, 70)}...")* — *Por qué es crucial:* Establece el tono atmosférico antes de que estalle el conflicto principal.
- **Anclaje Central / Giro:** *El momento de quiebre ideológico* — *Por qué es crucial:* Funciona como el catalizador que acelera la crisis central.
- **Anclaje Final / Resolución:** *La reflexión silenciosa al concluir* — *Por qué es crucial:* Deja interrogantes urgentes sin resolver, trazando un puente directo hacia los siguientes capítulos.

### 4. Claves Críticas, Subtexto y Presagios
- **Subtexto Temático:** Los motivos recurrentes del entorno reflejan la fractura interna de los personajes.
- **Presagio Narrativo:** Aquel detalle aparentemente menor al comienzo resultará ser el detonante crucial más adelante.`;
  }

  return `### 1. Core Objective & Thesis
${chapterLabel} of *${bookTitle}* establishes crucial thematic stakes and shifts the narrative momentum forward. It serves to transition the primary protagonists from speculative contemplation into active conflict and strategic maneuvering.

### 2. Chronological Breakdown
- **Initial Setup & Exposition:** The chapter opens with an assessment of the current predicament, grounding the characters in their immediate physical and psychological reality.
- **Rising Action & Complication:** Tensions escalate as unexpected variables and dissenting viewpoints are introduced, challenging earlier assumptions.
- **The Decisive Turn:** A pivotal confrontation or realization occurs, forcing an irreversible choice that dictates the remaining progression of the chapter.
- **Climactic Peak & Aftermath:** The immediate repercussions of this decision unfold, illuminating latent vulnerabilities and shifting power balances.

### 3. Key Anchor References & Context
- **Early Section Anchor:** *The opening examination of the situation ("${words.slice(0, 75)}...")* — *Why this matters:* It anchors the baseline atmospheric tone and establishes the core friction before the main conflict begins.
- **Mid Section Anchor / Turning Point:** *The critical moment of realization and ideological rupture* — *Why this matters:* Serves as the turning point that fractures previous alliances and accelerates the central crisis.
- **End Section Anchor / Resolution:** *The quiet concluding reflection as night falls* — *Why this matters:* Leaves key dilemmas unresolved, setting up an urgent narrative bridge into subsequent developments.

### 4. Critical Takeaways, Subtext & Foreshadowing
- **Thematic Subtext:** Notice how recurring environmental motifs mirror the internal psychological disintegration of the central figures.
- **Strategic Foreshadowing:** The seemingly minor detail regarding neglected protocols early on will likely serve as a catastrophic turning point in subsequent chapters.
- **Actionable Takeaway:** When confronted with systemic uncertainty, partial actions often provoke the exact destabilization they were designed to avoid.`;
}
