// EPUB parser using JSZip and browser DOMParser, plus chapter chunking engine

import JSZip from 'jszip';

export async function parseEpubFile(fileOrBlob) {
  const arrayBuffer = await fileOrBlob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Read META-INF/container.xml to find root OPF
  const containerXmlStr = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXmlStr) {
    throw new Error('Invalid EPUB: META-INF/container.xml not found.');
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXmlStr, 'application/xml');
  const rootfile = containerDoc.querySelector('rootfile');
  const opfPath = rootfile?.getAttribute('full-path');

  if (!opfPath) {
    throw new Error('Invalid EPUB: OPF rootfile path not specified in container.xml.');
  }

  // Base directory for resolving relative paths in OPF
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Read OPF file
  const opfStr = await zip.file(opfPath)?.async('text');
  if (!opfStr) {
    throw new Error(`Invalid EPUB: OPF package file not found at "${opfPath}".`);
  }

  const opfDoc = parser.parseFromString(opfStr, 'application/xml');

  // Metadata
  const title = opfDoc.querySelector('title')?.textContent?.trim() || 'Untitled Book';
  const author = opfDoc.querySelector('creator')?.textContent?.trim() || 'Unknown Author';

  // Manifest items map: id -> { href, mediaType, fullPath }
  const manifestItems = {};
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    if (id && href) {
      const fullPath = resolveRelativePath(opfDir, href);
      manifestItems[id] = { id, href, mediaType, fullPath };
    }
  });

  // Extract cover image if available
  let coverDataUrl = null;
  const coverMeta = opfDoc.querySelector('meta[name="cover"]');
  const coverId = coverMeta?.getAttribute('content') || 
                  Object.values(manifestItems).find(i => i.id.toLowerCase().includes('cover') && i.mediaType?.startsWith('image/'))?.id;

  if (coverId && manifestItems[coverId]) {
    const coverFile = zip.file(manifestItems[coverId].fullPath);
    if (coverFile) {
      const coverBlob = await coverFile.async('blob');
      coverDataUrl = await blobToDataURL(coverBlob);
    }
  }

  // 3. Read spine in order
  const spineItemRefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
  const rawChapters = [];

  let chapterIndex = 1;
  for (let i = 0; i < spineItemRefs.length; i++) {
    const idref = spineItemRefs[i].getAttribute('idref');
    const item = manifestItems[idref];
    if (!item) continue;

    const file = zip.file(item.fullPath);
    if (!file) continue;

    const contentHtml = await file.async('text');
    const chapterDoc = parser.parseFromString(contentHtml, 'text/html');

    // Extract text content cleanly
    const cleanedText = extractCleanText(chapterDoc.body || chapterDoc);
    const wordCount = countWords(cleanedText);

    // Skip almost-empty fragments (e.g. standalone cover markup or blank spacers under 25 words)
    if (wordCount < 30 && i === 0 && !cleanedText.toLowerCase().includes('chapter')) {
      continue;
    }

    // Extract chapter title or heading
    const detectedHeading = chapterDoc.querySelector('h1, h2, h3, title')?.textContent?.trim();
    const chapterTitle = cleanChapterTitle(detectedHeading, chapterIndex, wordCount);

    rawChapters.push({
      id: `chap_${chapterIndex}_${Date.now()}`,
      index: chapterIndex,
      title: chapterTitle,
      wordCount,
      text: cleanedText,
      originalHtml: contentHtml.slice(0, 15000) // stored for preview
    });

    chapterIndex++;
  }

  if (rawChapters.length === 0) {
    throw new Error('No readable chapters found in this EPUB archive.');
  }

  return {
    id: `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    author,
    cover: coverDataUrl,
    rawChapters
  };
}

export function createChunksFromChapters(rawChapters, chunkSize = 1) {
  const size = Math.max(1, parseInt(chunkSize, 10) || 1);
  const chunks = [];

  for (let i = 0; i < rawChapters.length; i += size) {
    const group = rawChapters.slice(i, i + size);
    const chunkNum = Math.floor(i / size) + 1;

    let chunkTitle;
    if (group.length === 1) {
      chunkTitle = group[0].title;
    } else {
      const first = group[0];
      const last = group[group.length - 1];
      chunkTitle = `Chapters ${first.index}–${last.index}: ${first.title.replace(/^Chapter\s+\d+:?\s*/i, '')} to ${last.title.replace(/^Chapter\s+\d+:?\s*/i, '')}`;
    }

    const mergedText = group.map(ch => `--- ${ch.title} ---\n\n${ch.text}`).join('\n\n\n');
    const totalWords = group.reduce((acc, ch) => acc + ch.wordCount, 0);

    chunks.push({
      id: `chunk_${chunkNum}_${Date.now()}_${i}`,
      chunkNumber: chunkNum,
      title: chunkTitle,
      chapterIndices: group.map(ch => ch.index),
      text: mergedText,
      wordCount: totalWords,
      status: 'pending', // 'pending' | 'generating' | 'completed' | 'error'
      summary: null,
      errorMsg: null,
      modelUsed: null,
      lastGeneratedAt: null,
      brevity: null,
      customFocus: null
    });
  }

  return chunks;
}

function resolveRelativePath(baseDir, relativePath) {
  if (!baseDir) return relativePath;
  const parts = (baseDir + relativePath).split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function extractCleanText(element) {
  if (!element) return '';
  // Clone to avoid mutation
  const clone = element.cloneNode(true);
  // Remove script and style tags
  const toRemove = clone.querySelectorAll('script, style, noscript, svg');
  toRemove.forEach(el => el.remove());

  // Replace block tags with newline separators
  const blocks = clone.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, tr');
  blocks.forEach(b => {
    b.insertAdjacentText('afterend', '\n\n');
  });

  return clone.textContent
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function cleanChapterTitle(heading, index, wordCount) {
  if (heading && heading.length > 2 && heading.length < 90) {
    return heading.replace(/\s+/g, ' ').trim();
  }
  return `Chapter ${index}`;
}

function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Built-in Classic Sample Books for instant testing
export function getSampleClassicBook() {
  const chapters = [
    {
      index: 1,
      title: 'Chapter 1: The Machine & The Fourth Dimension',
      text: `The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burnt brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses.

"You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted. The geometry, for instance, they taught you at school is founded on a misconception. There are really four dimensions, three which we call the three planes of Space, and a fourth, Time."

"There is no difference between Time and any of the three dimensions of Space except that our consciousness moves along it," said the Time Traveller. He took a small metallic framework, scarcely larger than a clock, and made of ivory and crystalline substance. "This little thing," said he, "is only a model. It is my plan for a machine to travel through time." He turned a small lever, and with a faint gust of wind, the model vanished into nothingness.`,
      wordCount: 850
    },
    {
      index: 2,
      title: 'Chapter 2: The Journey into the Unknown',
      text: `I took the starting lever in one hand and the stopping one in the other, pressed the first, and almost immediately the second. I seemed to reel; I felt a nightmare sensation of falling; and, looking round, I saw the laboratory exactly as before. Had anything happened? Then I glanced at the clock. A moment before it was eight o'clock; now it was nearly half-past three.

I drew a breath, set my teeth, gripped the starting lever with both hands, and went off with a thud. The laboratory grew faint and hazy, then disappeared into a tumult of grey mist. Night came like the flapping of a dark wing, and the sun hopped across the sky every minute like a streak of fire. The palpitation of day and night was an excruciating agony to the eye.

The slope of hill grew greener, trees sprang up and vanished like puffs of smoke, giant palaces rose, decayed, and dissolved. Finally, overcome with terror, I reversed the lever and the machine crashed violently into a bed of soft hail and flowering rhododendrons. I had stopped in the year Eight Hundred and Two Thousand Seven Hundred and One A.D.`,
      wordCount: 920
    },
    {
      index: 3,
      title: 'Chapter 3: The Golden Age of the Eloi',
      text: `In another moment we were surrounded by a crowd of dainty human beings in rich tunics, their hair curled and their eyes gentle. They were tiny figures, scarcely four feet high, beautiful and fragile beyond description. They touched my hands, laughing softly, and spoke to each other in a sweet, cooing language.

They led me into an immense hall of carved stone and stained glass, whose walls were draped with magnificent tapestries crumbling into dust. Long tables of polished stone were laden with exquisite fruits—strange grapes, huge melons, and succulent oranges. Meat there was none, nor any domestic animal.

As I observed these graceful, childlike creatures, whom I later learned to call the Eloi, a profound realization dawned upon me. Mankind had achieved complete triumph over nature, conquered disease, eliminated labor, and perfected comfort. Yet in achieving total security, they had lost their intellect, their strength, and their purpose. They were the decadent twilight of humanity, playing aimlessly among ruins.`,
      wordCount: 980
    },
    {
      index: 4,
      title: 'Chapter 4: The Vanishing Machine & Panic',
      text: `When I returned to the lawn beneath the colossal statue of the White Sphinx, a cold shock ran through my veins. The Time Machine was gone! The bronze pedestal was scarred by deep grooved tracks in the turf, showing where something heavy had been dragged inside the hollow base beneath the Sphinx.

I ran among the sleeping Eloi in frantic fury, shaking them by their shoulders, shouting, weeping, demanding where my vessel had been taken. They looked at me with blank terror and incomprehension, shrinking away as if from a wild beast.

That night, walking among the moonlit garden terraces, I saw pale, ape-like figures flitting between the shadows and vanishing down deep circular ventilation shafts that dotted the landscape like wells. A rhythmic, muffled thudding sound echoed from deep underground. The surface world was not alone; beneath their paradise lay another civilization entirely.`,
      wordCount: 890
    },
    {
      index: 5,
      title: 'Chapter 5: The Darkness Below & The Morlocks',
      text: `I realized now that humanity had not simply decayed; it had split into two distinct species. The Upper-worlders, the graceful Eloi, were the descendants of the leisured aristocrats; while the Under-worlders, the bleached, subterranean Morlocks, were the evolutionary spawn of the oppressed working class, driven forever into darkness to keep the machinery of the world turning.

Driven by desperation to recover my machine, I struck a match and descended the iron rungs into a pitch-black ventilation shaft. The air grew stifling, humid, and heavy with the smell of blood. In the vast subterranean cavern, monstrous iron engines pulsed, tended by pale, red-eyed creatures who shielded their eyes and hissed at the matchlight.

On a central stone slab, I saw the remnants of their feast. It was then the horrifying truth struck me with sickening clarity: the Eloi were not the masters of this world. They were cattle, bred and preserved in the sunlight only to be harvested in the dark of the moon by the carnivorous Morlocks.`,
      wordCount: 1100
    },
    {
      index: 6,
      title: 'Chapter 6: Escape & The End of Time',
      text: `With a pocketful of matches and a heavy iron lever pried from an abandoned museum, I fought my way back to the bronze pedestal of the Sphinx. The Morlocks had dragged the Time Machine inside as bait for a trap. As the bronze doors clanged shut behind me in the suffocating darkness, they sprang upon me like spiders.

I struck a match, leaped into the saddle of the machine, and screwed the levers into place. With a blinding flash of motion, the Morlocks dissolved into dust.

I pushed the forward lever further still, traveling millions of years into the dying age of Earth. The sun grew huge, dim, and blood-red in a silent, freezing sky. No wind blew; no waves crested upon the dead sea. Along the desolate beach, colossal reddish crab-like monsters crawled through poisonous lichen, while black flitting things touched the rim of the darkening water.

Faint and trembling before the abyss of cosmic oblivion, I reversed the lever and fled back toward my own century.`,
      wordCount: 1050
    }
  ];

  return {
    id: 'book_sample_time_machine',
    title: 'The Time Machine',
    author: 'H.G. Wells',
    cover: null,
    rawChapters: chapters.map(ch => ({
      id: `chap_sample_${ch.index}`,
      index: ch.index,
      title: ch.title,
      wordCount: ch.wordCount,
      text: ch.text,
      originalHtml: `<div class="chapter-content"><h1>${ch.title}</h1><p>${ch.text.replace(/\n\n/g, '</p><p>')}</p></div>`
    }))
  };
}
