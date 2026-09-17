// Prompt builder for literary summaries and chapter chunking

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

  const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];
  const langInstruction = langConfig.code !== 'en'
    ? `\n\nCRITICAL LANGUAGE DIRECTIVE:
You MUST write the ENTIRE response, including all section headers, analysis, bullets, anchor descriptions, and takeaways exclusively in ${langConfig.name} (${langConfig.native}).
Translate or adapt narrative names and concepts fluently and naturally in ${langConfig.name}.`
    : '';

  const systemInstructions = `Act as an expert literary analyst, master editor, and companion book author.
I am going to provide you with text from ${chapterLabel} of the book "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ''}.${langInstruction}

Your goal is to provide an in-depth summary and companion breakdown that preserves all key arguments, plot points, and character/thematic developments so the reader never loses critical nuance or substantive depth.

Brevity / Depth Profile:
- Target length: ${brevityConfig.targetWords}
- Depth Directive: ${brevityConfig.instructions}
${focusInstruction ? `\nTarget Analytical Directives:${focusInstruction}\n` : ''}

CRITICAL NOTE ON "REFERENCES":
By references, we mean specific scene anchors, conceptual milestones, or textual moments (not literal word-for-word quotes). Describe the specific moment or argument clearly and analyze why it is pivotal.

Format your response cleanly in GitHub-flavored Markdown using the following exact structure:

### 1. Core Objective & Thesis
A 2 to 3 sentence synthesis capturing what this chapter achieves narratively, conceptually, or argumentatively, and its primary contribution to the book.

### 2. Chronological Breakdown
A detailed, bulleted walkthrough analyzing what happens from beginning to end. Keep it clear, structured, and informative. Highlight turning points, confrontations, or key arguments.

### 3. Key Anchor References & Context
Highlight 3 defining moments/references from across the section:
- **Early Section Anchor:** [Identify and describe the specific opening scene, setup, or initial thesis] — *Why this matters / what expectations or tensions it establishes.*
- **Mid Section Anchor / Turning Point:** [Identify and describe the core climax, conflict, or shift in thinking] — *Why this matters / how it pivots the narrative or argument.*
- **End Section Anchor / Resolution:** [Identify and describe how the section concludes or transitions] — *How it concludes, what unresolved questions remain, or what bridge it builds to what follows.*

### 4. Critical Takeaways, Subtext & Foreshadowing
- Bullet points detailing subtle subtext, unspoken dynamics, intellectual frameworks, or narrative foreshadowing that could become important later.

Ensure the prose is lucid, engaging, and authoritative.${langConfig.code !== 'en' ? ` Remember to write everything in ${langConfig.name} (${langConfig.native}).` : ''}`;

  return {
    systemInstructions,
    userPrompt: `Here is the full text of ${chapterLabel} from "${bookTitle}":\n\n---\n${chapterText}\n---`
  };
}
