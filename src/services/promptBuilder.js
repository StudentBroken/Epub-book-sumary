// Prompt builder for literary summaries and chapter chunking with full zero-English localization

export const BREVITY_PRESETS = {
  compressed: {
    label: 'Ultra-Compressed (Executive)',
    targetWords: '~200 words',
    instructions: 'Be ultra-concise and compressed. Maximize informational density, eliminate fluff, and convey the essential core in 2-3 brief paragraphs.'
  },
  punchy: {
    label: 'Short & Punchy',
    targetWords: '~400 words',
    instructions: 'Keep the breakdown rapid, high-impact, and punchy. Focus strictly on pivotal developments, key decisions, and core takeaways.'
  },
  standard: {
    label: 'Standard / Balanced',
    targetWords: '~700 words',
    instructions: 'Provide a well-rounded balance of narrative pacing, conceptual depth, and analytical clarity.'
  },
  indepth: {
    label: 'In-Depth Literary Guide',
    targetWords: '~1,200 words',
    instructions: 'Provide an exhaustive, high-nuance literary walkthrough preserving all key arguments, character arcs, thematic developments, and subtle subtext.'
  },
  exhaustive: {
    label: 'Exhaustive & Granular',
    targetWords: '~1,800+ words',
    instructions: 'Provide a deeply granular, comprehensive chapter study. Break down every significant sequence, secondary insight, and philosophical/narrative implication.'
  }
};

export const FOCUS_PRESETS = [
  { id: 'all', label: 'Balanced Overall Analysis', prompt: '' },
  { id: 'character', label: 'Character Psychology & Arcs', prompt: 'Place special analytical focus on character psychology, motives, interpersonal dynamics, and internal conflicts.' },
  { id: 'philosophy', label: 'Philosophical & Thematic Underpinnings', prompt: 'Highlight the deeper philosophical theses, thematic symbolism, ideological disputes, and authorial commentary.' },
  { id: 'actionable', label: 'Actionable Insights & Principles', prompt: 'Emphasize actionable principles, frameworks, tactical lessons, and repeatable rules.' },
  { id: 'plot_mechanics', label: 'Plot Pacing & Foreshadowing Clues', prompt: 'Zero in on structural plot mechanics, cause-and-effect sequences, hidden clues, and potential foreshadowing.' },
  { id: 'historical', label: 'Historical & World-Building Context', prompt: 'Emphasize world-building details, historical context, environmental atmosphere, and societal rules.' }
];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ar', name: 'Arabic', native: 'العربية' }
];

export const LANGUAGE_SCHEMAS = {
  en: {
    name: 'English',
    native: 'English',
    h1: '1. Core Objective & Thesis',
    h2: '2. Chronological Breakdown',
    h3: '3. Key Anchor References & Context',
    h4: '4. Critical Takeaways, Subtext & Foreshadowing',
    anchorEarly: 'Early Section Anchor',
    anchorMid: 'Mid Section Anchor / Turning Point',
    anchorEnd: 'End Section Anchor / Resolution',
    h1Desc: 'A 2 to 3 sentence synthesis capturing what this section achieves narratively, conceptually, or argumentatively.',
    h2Desc: 'A detailed, bulleted walkthrough analyzing what happens from beginning to end.',
    h3Desc: 'Highlight 3 defining moments or references from across the section:',
    h4Desc: 'Bullet points detailing subtle subtext, unspoken dynamics, intellectual frameworks, or narrative foreshadowing.'
  },
  fr: {
    name: 'French',
    native: 'Français',
    h1: '1. Objectif Central & Thèse',
    h2: '2. Déroulement Chronologique',
    h3: '3. Références Majeures & Contexte',
    h4: '4. Enseignements Clés, Sous-Texte & Présages',
    anchorEarly: "Point d'ancrage initial",
    anchorMid: 'Point de bascule médian / Tournant',
    anchorEnd: 'Ancrage conclusif / Transition',
    h1Desc: "Une synthèse de 2 à 3 phrases expliquant ce que cette section accomplit sur le plan narratif, conceptuel ou argumentatif.",
    h2Desc: "Un déroulé chronologique détaillé, point par point, analysant les événements du début à la fin.",
    h3Desc: "Mettez en lumière 3 moments ou repères clés à travers la section :",
    h4Desc: "Points détaillant le sous-texte subtil, les non-dits, les cadres intellectuels ou les présages narratifs."
  },
  es: {
    name: 'Spanish',
    native: 'Español',
    h1: '1. Objetivo Central y Tesis',
    h2: '2. Desglose Cronológico',
    h3: '3. Puntos de Anclaje y Contexto',
    h4: '4. Claves Críticas, Subtexto y Presagios',
    anchorEarly: 'Punto de anclaje inicial',
    anchorMid: 'Punto de giro central / Inflexión',
    anchorEnd: 'Anclaje conclusivo / Transición',
    h1Desc: 'Una síntesis de 2 a 3 oraciones que capture lo que esta sección logra narrativa, conceptual o argumentativamente.',
    h2Desc: 'Un desglose cronológico detallado, punto por punto, analizando lo que ocurre de principio a fin.',
    h3Desc: 'Destaca 3 momentos o referencias clave a lo largo de la sección:',
    h4Desc: 'Puntos que detallan subtextos sutiles, dinámicas no expresadas o presagios narrativos.'
  },
  zh: {
    name: 'Chinese (Simplified)',
    native: '简体中文',
    h1: '1. 核心目标与主旨',
    h2: '2. 编年时序拆解',
    h3: '3. 关键定位锚点与语境阐释',
    h4: '4. 关键洞察、潜台词与深层伏笔',
    anchorEarly: '前段场景锚点',
    anchorMid: '中段转折锚点 / 关键契机',
    anchorEnd: '尾段终局锚点 / 承前启后',
    h1Desc: '用2到3句话概括本章节在叙事、概念或论证层面所达成的核心目标。',
    h2Desc: '详细的编年要点拆解，从头至尾分析发生的所有重要情节与冲突。',
    h3Desc: '提炼全节3个具有决定性意义的场景锚点与文本里程碑：',
    h4Desc: '深入剖析幽微潜台词、未言明的心理动机以及后续关键伏笔。'
  },
  'zh-TW': {
    name: 'Chinese (Traditional)',
    native: '繁體中文',
    h1: '1. 核心目標與主旨',
    h2: '2. 編年時序拆解',
    h3: '3. 關鍵定位錨點與語境闡釋',
    h4: '4. 關鍵洞察、潛台詞與深層伏筆',
    anchorEarly: '前段場景錨點',
    anchorMid: '中段轉折錨點 / 關鍵契機',
    anchorEnd: '尾段終局錨點 / 承前啟後',
    h1Desc: '用2到3句話概括本章節在敘事、概念或論證層面所達成的核心目標。',
    h2Desc: '詳細的編年要點拆解，從頭至尾分析發生的所有重要情節與衝突。',
    h3Desc: '提煉全節3個具有決定性意義的場景錨點與文本里程碑：',
    h4Desc: '深入剖析幽微潛台詞、未言明的心理動機以及後續關鍵伏筆。'
  },
  de: {
    name: 'German',
    native: 'Deutsch',
    h1: '1. Kernziel & Hauptthese',
    h2: '2. Chronologische Ablaufanalyse',
    h3: '3. Zentrale Ankerpunkte & Kontext',
    h4: '4. Wichtige Erkenntnisse, Subtext & Vorahnungen',
    anchorEarly: 'Eröffnungs-Ankerpunkt',
    anchorMid: 'Zentraler Wendepunkt',
    anchorEnd: 'Abschließender Übergang',
    h1Desc: 'Eine 2 bis 3 Sätze lange Synthese des narrativen und argumentativen Ziels dieser Sektion.',
    h2Desc: 'Eine detaillierte, chronologische Analyse von Anfang bis Ende.',
    h3Desc: 'Heben Sie 3 entscheidende Szenen oder Wendepunkte hervor:',
    h4Desc: 'Wesentliche Details zu Subtext, psychologischer Dynamik und Vorahnungen.'
  },
  ja: {
    name: 'Japanese',
    native: '日本語',
    h1: '1. 中核となる目的と論点',
    h2: '2. 時系列詳細分析',
    h3: '3. 重要なアンカー参照と文脈',
    h4: '4. 重要な洞察、サブテクスト、伏線',
    anchorEarly: '序盤のアンカー参照',
    anchorMid: '中盤の転換点 / ターニングポイント',
    anchorEnd: '終盤の結びと移行',
    h1Desc: 'このセクションが物語的・概念的に達成した中核を2〜3文で要約。',
    h2Desc: '初めから終わりまでの出来事を順を追って箇条書きで詳細に解説。',
    h3Desc: 'セクション全体の決定的な3つのキーモーメントを抽出：',
    h4Desc: '水面下の心理的ダイナミクスや今後の展開につながる伏線を分析。'
  },
  pt: {
    name: 'Portuguese',
    native: 'Português',
    h1: '1. Objetivo Central e Tese',
    h2: '2. Detalhamento Cronológico',
    h3: '3. Principais Pontos de Ancoragem e Contexto',
    h4: '4. Principais Conclusões, Subtexto e Prenúncios',
    anchorEarly: 'Ponto de ancoragem inicial',
    anchorMid: 'Ponto de virada / Inflexão',
    anchorEnd: 'Ancoragem conclusiva / Transição',
    h1Desc: 'Uma síntese de 2 a 3 frases capturando o objetivo narrativo ou temático desta seção.',
    h2Desc: 'Um passo a passo cronológico detalhado analisando os acontecimentos do início ao fim.',
    h3Desc: 'Destaque 3 momentos definidores ao longo da seção:',
    h4Desc: 'Pontos detalhando subtextos sutis, dinâmicas implícitas ou prenúncios narrativos.'
  },
  it: {
    name: 'Italian',
    native: 'Italiano',
    h1: '1. Obiettivo Centrale e Tesi',
    h2: '2. Analisi Cronologica Dettagliata',
    h3: '3. Punti di Riferimento Chiave e Contesto',
    h4: '4. Riflessioni Critiche, Sottotesto e Presagi',
    anchorEarly: 'Punto di ancoraggio iniziale',
    anchorMid: 'Punto di svolta / Momento cruciale',
    anchorEnd: 'Ancoraggio conclusivo / Transizione',
    h1Desc: 'Una sintesi di 2-3 frasi che spieghi cosa raggiunge narrativamente o concettualmente questa sezione.',
    h2Desc: 'Un percorso cronologico dettagliato che analizza cosa accade dall inizio alla fine.',
    h3Desc: 'Evidenzia 3 momenti o riferimenti decisivi nella sezione:',
    h4Desc: 'Punti che approfondiscono sottotesti, dinamiche implicite e presagi narrativi.'
  },
  ru: {
    name: 'Russian',
    native: 'Русский',
    h1: '1. Ключевая цель и тезис',
    h2: '2. Хронологический разбор событий',
    h3: '3. Опорные сцены и контекст',
    h4: '4. Важные выводы, подтекст и предзнаменования',
    anchorEarly: 'Начальная опорная сцена',
    anchorMid: 'Кульминационный поворотный момент',
    anchorEnd: 'Заключительный переход',
    h1Desc: 'Синтез из 2-3 предложений, раскрывающий главное нарративное и концептуальное достижение раздела.',
    h2Desc: 'Подробный хронологический разбор событий от начала до конца.',
    h3Desc: 'Выделите 3 определяющих момента на протяжении раздела:',
    h4Desc: 'Пункты с анализом психологического подтекста и скрытых сюжетных намеков.'
  },
  ko: {
    name: 'Korean',
    native: '한국어',
    h1: '1. 핵심 목표 및 주제',
    h2: '2. 시간순 사건 전개 및 분석',
    h3: '3. 핵심 앵커 참조 및 맥락',
    h4: '4. 심층 인사이트, 서브텍스트 및 복선',
    anchorEarly: '도입부 앵커 장면',
    anchorMid: '중반부 핵심 전환점 / 터닝 포인트',
    anchorEnd: '결말부 앵커 및 전환',
    h1Desc: '이 섹션이 서사적, 개념적으로 달성한 핵심을 2~3문장으로 집약.',
    h2Desc: '처음부터 끝까지 일어난 주요 사건을 시간순으로 상세히 분석.',
    h3Desc: '섹션 전반에서 가장 결정적인 3가지 장면/참조를 추출:',
    h4Desc: '미묘한 심리적 서브텍스트 및 향후 전개를 암시하는 복선 분석.'
  },
  ar: {
    name: 'Arabic',
    native: 'العربية',
    h1: '1. الهدف الجوهري والأطروحة',
    h2: '2. التسلسل الزمني للأحداث',
    h3: '3. نقاط الارتكاز المرجعية والسياق',
    h4: '4. الاستنتاجات الجوهرية والمعاني الخفية والتمهيد',
    anchorEarly: 'نقطة الارتكاز الافتتاحية',
    anchorMid: 'نقطة التحول المركزية',
    anchorEnd: 'نقطة الارتكاز الختامية والتمهيد',
    h1Desc: 'تركيب في 2 إلى 3 جمل يلخص ما يحققه هذا القسم سردياً وفكرياً.',
    h2Desc: 'تسلسل زمني مفصل يحلل ما يحدث من البداية إلى النهاية.',
    h3Desc: 'إبراز 3 محطات رئيسية حاسمة على امتداد القسم:',
    h4Desc: 'نقاط توضح الأبعاد العميقة والمعاني المبطنة والتمهيد للأحداث اللاحقة.'
  }
};

export function buildChapterPrompt({
  bookTitle,
  bookAuthor,
  chapterLabel,
  chapterText,
  brevity = 'indepth',
  customFocus = '',
  focusPresetId = 'all',
  language = 'en'
}) {
  const brevityConfig = BREVITY_PRESETS[brevity] || BREVITY_PRESETS.indepth;
  
  let focusInstruction = '';
  if (focusPresetId && focusPresetId !== 'all') {
    const preset = FOCUS_PRESETS.find(p => p.id === focusPresetId);
    if (preset && preset.prompt) {
      focusInstruction += `\n- Specific Analytical Lens: ${preset.prompt}`;
    }
  }
  if (customFocus && customFocus.trim()) {
    focusInstruction += `\n- User Custom Focus: ${customFocus.trim()}`;
  }

  const schema = LANGUAGE_SCHEMAS[language] || LANGUAGE_SCHEMAS.en;
  const isEnglish = language === 'en';

  const strictLanguageDirective = !isEnglish
    ? `\n\nCRITICAL ZERO-ENGLISH REQUIREMENT:
You MUST write the ENTIRE output exclusively in ${schema.name} (${schema.native}).
This includes:
- All section titles (Use: "### ${schema.h1}", "### ${schema.h2}", "### ${schema.h3}", "### ${schema.h4}")
- All anchor labels (Use: "**${schema.anchorEarly} :**", "**${schema.anchorMid} :**", "**${schema.anchorEnd} :**")
- All analysis, descriptions, bullet points, and subtext.
DO NOT use English section names like "Core Objective", "Chronological Breakdown", "Key Anchor References", "Early Section Anchor", or "Critical Takeaways". Everything must be 100% in ${schema.name} (${schema.native}).`
    : '';

  const systemInstructions = `Act as an expert literary analyst, master editor, and companion book author.
I am going to provide you with text from ${chapterLabel} of the book "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ''}.${strictLanguageDirective}

Your goal is to provide an in-depth summary and companion breakdown that preserves all key arguments, plot points, and character/thematic developments so the reader never loses critical nuance or substantive depth.

Brevity / Depth Profile:
- Target length: ${brevityConfig.targetWords}
- Depth Directive: ${brevityConfig.instructions}
${focusInstruction ? `\nTarget Analytical Directives:${focusInstruction}\n` : ''}

CRITICAL NOTE ON "REFERENCES":
By references, we mean specific scene anchors, conceptual milestones, or textual moments (not literal word-for-word quotes). Describe the specific moment or argument clearly and analyze why it is pivotal.

Format your response cleanly in GitHub-flavored Markdown using the following exact localized structure:

### ${schema.h1}
${schema.h1Desc}

### ${schema.h2}
${schema.h2Desc}

### ${schema.h3}
${schema.h3Desc}
- **${schema.anchorEarly} :** [${!isEnglish ? `Identifier et décrire la scène ou le postulat d'ouverture` : `Identify and describe the specific opening scene, setup, or initial thesis`}] — *[${!isEnglish ? `Pourquoi cela compte / quelles tensions cela installe` : `Why this matters / what expectations or tensions it establishes`}]*
- **${schema.anchorMid} :** [${!isEnglish ? `Identifier et décrire le tournant critique ou le pivot de réflexion` : `Identify and describe the core climax, conflict, or shift in thinking`}] — *[${!isEnglish ? `Pourquoi cela compte / comment cela fait basculer le récit` : `Why this matters / how it pivots the narrative or argument`}]*
- **${schema.anchorEnd} :** [${!isEnglish ? `Identifier et décrire comment la section se conclut ou amorce la transition` : `Identify and describe how the section concludes or transitions`}] — *[${!isEnglish ? `Quelle passerelle cela construit vers la suite` : `How it concludes, what unresolved questions remain, or what bridge it builds`}]*

### ${schema.h4}
- ${schema.h4Desc}

Ensure the prose is lucid, engaging, and authoritative.${!isEnglish ? ` Remember: ABSOLUTELY NO ENGLISH HEADERS OR LABELS. Use only ${schema.name} (${schema.native}).` : ''}`;

  return {
    systemInstructions,
    userPrompt: `Here is the full text of ${chapterLabel} from "${bookTitle}":\n\n---\n${chapterText}\n---`
  };
}
