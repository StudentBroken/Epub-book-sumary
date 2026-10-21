/**
 * EBK (ESP32-S3 E-Reader) Binary Container Generator
 * 
 * Generates custom indexed .ebk binary files for the ESP32-S3 4.2" E-Paper Reader
 * (400x300 1-bit monochrome display, SSD1619 controller).
 * 
 * Format Specification:
 * - Header (40 bytes):
 *   [0x00 - 0x03] Magic: 'EBOK' (4 bytes)
 *   [0x04 - 0x05] Total Frames: uint16_t (little endian)
 *   [0x06 - 0x25] Title: char[32] (null-terminated / null-padded)
 *   [0x26 - 0x27] Font Identifier: uint16_t (e.g. 0x0010 = 16)
 * - Index Table:
 *   [0x28 + 4*N] Offset to Frame N: uint32_t (little endian)
 * - Frame Blocks:
 *   [Offset N + 0x00] Source Physical Page: uint16_t (little endian)
 *   [Offset N + 0x02] Payload Length: uint16_t (little endian, 15,000 bytes)
 *   [Offset N + 0x04] 1-bit Canvas Tile Data (15,000 bytes for 400x300, MSB first, 1=white, 0=black)
 */

export const EBK_CONFIG = {
  FRAME_WIDTH: 400,
  FRAME_HEIGHT: 300,
  FRAME_BUFFER_SIZE: 15000, // (400 * 300) / 8
  HEADER_SIZE: 40,
  FRAME_HEADER_SIZE: 4,
  MAGIC: [0x45, 0x42, 0x4F, 0x4B], // 'E', 'B', 'O', 'K'
  FONT_PRESETS: {
    compact: { fontSize: 13, lineHeight: 18, fontId: 0x000D },
    standard: { fontSize: 15, lineHeight: 21, fontId: 0x0010 },
    large: { fontSize: 17, lineHeight: 24, fontId: 0x0012 }
  }
};

/**
 * Paginates plain text or markdown into discrete 400x300 e-paper pages.
 * @param {Array<{ title: string, text: string, chapterIndex?: number }>} sections 
 * @param {Object} options 
 * @returns {Array<Object>} List of page specifications ready for canvas rendering
 */
export function paginateSectionsForEpaper(sections, options = {}) {
  const presetKey = options.preset || 'standard';
  const preset = EBK_CONFIG.FONT_PRESETS[presetKey] || EBK_CONFIG.FONT_PRESETS.standard;
  const fontSize = options.fontSize || preset.fontSize;
  const lineHeight = options.lineHeight || preset.lineHeight;
  const fontFamily = options.fontFamily || 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const marginX = options.marginX || 20;
  const contentWidth = EBK_CONFIG.FRAME_WIDTH - (marginX * 2); // 360px
  const startY = 46; // Below header bar
  const bottomMargin = 26; // Above footer bar
  const availableHeight = EBK_CONFIG.FRAME_HEIGHT - startY - bottomMargin; // ~228px
  const maxLinesPerPage = Math.floor(availableHeight / lineHeight); // ~10-12 lines

  // Measure text using an offscreen canvas
  const measureCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(400, 300)
    : document.createElement('canvas');
  measureCanvas.width = 400;
  measureCanvas.height = 300;
  const ctx = measureCanvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;

  const pages = [];

  for (const section of sections) {
    const rawText = section.text || '';
    if (!rawText.trim()) continue;

    // Split text into paragraphs (preserve blank line spacing)
    const paragraphs = rawText.split(/\r?\n/);
    const wrappedLines = [];

    // Optional chapter heading on page 1 of each section
    const sectionTitle = (section.title || '').trim();

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      let p = paragraphs[pIdx].trim();
      
      // Clean markdown formatting slightly for clean e-paper text rendering
      p = p.replace(/\*\*(.*?)\*\*/g, '$1')
           .replace(/\*(.*?)\*/g, '$1')
           .replace(/^#+\s*/, '')
           .replace(/`([^`]+)`/g, '$1');

      if (!p) {
        // Blank line between paragraphs if previous line wasn't empty
        if (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1] !== '') {
          wrappedLines.push('');
        }
        continue;
      }

      // Word wrapping
      const words = p.split(/\s+/);
      let currentLine = '';

      for (let w = 0; w < words.length; w++) {
        const word = words[w];
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width <= contentWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
          }
          // If a single word is longer than the content width, break it
          if (ctx.measureText(word).width > contentWidth) {
            let part = '';
            for (const char of word) {
              if (ctx.measureText(part + char).width <= contentWidth) {
                part += char;
              } else {
                wrappedLines.push(part);
                part = char;
              }
            }
            currentLine = part;
          } else {
            currentLine = word;
          }
        }
      }

      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }

    if (wrappedLines.length === 0) {
      wrappedLines.push('[Empty Section]');
    }

    // Chunk wrapped lines into pages
    let lineIdx = 0;
    let sectionPageNum = 1;

    while (lineIdx < wrappedLines.length) {
      const pageLines = wrappedLines.slice(lineIdx, lineIdx + maxLinesPerPage);
      lineIdx += maxLinesPerPage;

      pages.push({
        sectionTitle: sectionTitle || 'Chapter',
        sectionPageNum,
        lines: pageLines,
        fontSize,
        lineHeight,
        fontFamily,
        marginX,
        startY
      });

      sectionPageNum++;
    }
  }

  return pages;
}

/**
 * Renders a single page onto a 400x300 canvas context.
 */
export function renderPageToCanvas(page, pageIndex, totalPages, bookTitle, canvas) {
  canvas.width = EBK_CONFIG.FRAME_WIDTH;
  canvas.height = EBK_CONFIG.FRAME_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // 1. Fill crisp white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, EBK_CONFIG.FRAME_WIDTH, EBK_CONFIG.FRAME_HEIGHT);

  // 2. Draw Header
  const marginX = page.marginX || 20;
  ctx.fillStyle = '#000000';
  ctx.font = `bold 12px ${page.fontFamily || 'sans-serif'}`;
  ctx.textBaseline = 'top';

  // Truncate title if needed
  const displayTitle = (page.sectionTitle || bookTitle || 'E-Book').slice(0, 36);
  ctx.fillText(displayTitle, marginX, 10);

  // Header dividing rule
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginX, 26);
  ctx.lineTo(EBK_CONFIG.FRAME_WIDTH - marginX, 26);
  ctx.stroke();

  // 3. Draw Body Text Lines
  ctx.font = `${page.fontSize}px ${page.fontFamily || 'sans-serif'}`;
  ctx.textBaseline = 'alphabetic';
  let y = page.startY + (page.fontSize);

  for (const line of page.lines) {
    if (line !== '') {
      ctx.fillText(line, marginX, y);
    }
    y += page.lineHeight;
  }

  // 4. Draw Footer
  ctx.font = `11px ${page.fontFamily || 'sans-serif'}`;
  ctx.textBaseline = 'bottom';
  const pageStr = `Page ${pageIndex + 1} of ${totalPages}`;
  const pageStrWidth = ctx.measureText(pageStr).width;
  ctx.fillText(pageStr, EBK_CONFIG.FRAME_WIDTH - marginX - pageStrWidth, EBK_CONFIG.FRAME_HEIGHT - 8);

  // Optional subtle e-reader footer rule
  ctx.beginPath();
  ctx.moveTo(marginX, EBK_CONFIG.FRAME_HEIGHT - 22);
  ctx.lineTo(EBK_CONFIG.FRAME_WIDTH - marginX, EBK_CONFIG.FRAME_HEIGHT - 22);
  ctx.stroke();

  return ctx;
}

/**
 * Converts a 400x300 canvas into an exact 15,000-byte 1-bit packed frame buffer.
 * In accordance with SSD1619 / GxEPD / EBK format:
 * Row-major, MSB first, 1 = White, 0 = Black.
 */
export function canvasTo1BitFrameBuffer(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, EBK_CONFIG.FRAME_WIDTH, EBK_CONFIG.FRAME_HEIGHT);
  const data = imgData.data;

  const frameBuffer = new Uint8Array(EBK_CONFIG.FRAME_BUFFER_SIZE);

  for (let y = 0; y < EBK_CONFIG.FRAME_HEIGHT; y++) {
    for (let x = 0; x < EBK_CONFIG.FRAME_WIDTH; x++) {
      const pixelIdx = (y * EBK_CONFIG.FRAME_WIDTH + x) * 4;
      const r = data[pixelIdx];
      const g = data[pixelIdx + 1];
      const b = data[pixelIdx + 2];
      
      // Standard perceptual luminance threshold
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const isWhite = lum >= 135 ? 1 : 0;

      const byteIdx = Math.floor((y * EBK_CONFIG.FRAME_WIDTH + x) / 8);
      const bitIdx = 7 - (x % 8);

      if (isWhite) {
        frameBuffer[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  return frameBuffer;
}

/**
 * Builds the complete .ebk binary container file.
 * 
 * @param {string} title Book title (max 31 characters encoded)
 * @param {Array<Uint8Array>} framePayloads Array of 15,000-byte 1-bit frame buffers
 * @param {number} fontId Font identifier (e.g. 0x0010)
 * @returns {Uint8Array} Complete binary .ebk file buffer
 */
export function buildEbkBinary(title, framePayloads, fontId = 0x0010) {
  const totalFrames = framePayloads.length;
  if (totalFrames === 0) {
    throw new Error('Cannot create an EBK file with 0 frames.');
  }

  const indexTableSize = totalFrames * 4;
  const firstFrameOffset = EBK_CONFIG.HEADER_SIZE + indexTableSize;

  // Calculate total file size: Header + IndexTable + N * (FrameHeader + Payload)
  let totalFileSize = firstFrameOffset;
  const frameOffsets = [];

  for (let i = 0; i < totalFrames; i++) {
    frameOffsets.push(totalFileSize);
    totalFileSize += EBK_CONFIG.FRAME_HEADER_SIZE + framePayloads[i].length;
  }

  const buffer = new Uint8Array(totalFileSize);
  const view = new DataView(buffer.buffer);

  // 1. Write Header (40 bytes)
  // Magic: 'EBOK'
  buffer[0] = EBK_CONFIG.MAGIC[0];
  buffer[1] = EBK_CONFIG.MAGIC[1];
  buffer[2] = EBK_CONFIG.MAGIC[2];
  buffer[3] = EBK_CONFIG.MAGIC[3];

  // Total frames: uint16_t (little endian)
  view.setUint16(4, totalFrames, true);

  // Title: 32 bytes (null padded)
  const encoder = new TextEncoder();
  const titleBytes = encoder.encode(title.trim().slice(0, 31));
  for (let i = 0; i < 32; i++) {
    buffer[6 + i] = i < titleBytes.length ? titleBytes[i] : 0x00;
  }

  // Font ID / size: uint16_t (little endian)
  view.setUint16(38, fontId, true);

  // 2. Write Index Table (totalFrames * 4 bytes)
  let indexPos = EBK_CONFIG.HEADER_SIZE;
  for (let i = 0; i < totalFrames; i++) {
    view.setUint32(indexPos, frameOffsets[i], true);
    indexPos += 4;
  }

  // 3. Write Frame Blocks
  for (let i = 0; i < totalFrames; i++) {
    const offset = frameOffsets[i];
    const pageNum = i + 1;
    const payload = framePayloads[i];

    // Frame Header (4 bytes):
    // Source page: uint16_t (little endian)
    view.setUint16(offset, pageNum, true);
    // Payload length: uint16_t (little endian)
    view.setUint16(offset + 2, payload.length, true);

    // Payload (15,000 bytes)
    buffer.set(payload, offset + EBK_CONFIG.FRAME_HEADER_SIZE);
  }

  return buffer;
}

export const EBK2_CONFIG = {
  MAGIC: [0x45, 0x42, 0x4B, 0x32], // 'E', 'B', 'K', '2'
  HEADER_SIZE: 104,
  TOC_ENTRY_SIZE: 40,
  TITLE_MAX_LEN: 64,
  AUTHOR_MAX_LEN: 32,
  CHAP_TITLE_MAX_LEN: 32
};

/**
 * Builds the compact EBK v2 structured text container.
 * Stores UTF-8 text with chapter table of contents for on-device reflow and dynamic font sizing.
 * 
 * @param {Object} bookData
 * @param {string} bookData.title Book title (up to 64 bytes UTF-8)
 * @param {string} bookData.author Author name (up to 32 bytes UTF-8)
 * @param {Array<{ title: string, text: string }>} bookData.chapters
 * @returns {Uint8Array} Complete binary .ebk v2 buffer
 */
export function buildEbk2Binary({ title = 'Untitled Book', author = 'Unknown', chapters = [] }) {
  if (!chapters || chapters.length === 0) {
    throw new Error('Cannot create an EBK v2 container without chapters.');
  }

  const encoder = new TextEncoder();
  const totalChapters = chapters.length;

  // 1. Prepare chapter payloads and TOC data
  const encodedPayloads = [];
  let totalPayloadSize = 0;

  for (let i = 0; i < totalChapters; i++) {
    const rawText = chapters[i].text || '';
    const bytes = encoder.encode(rawText);
    encodedPayloads.push(bytes);
    totalPayloadSize += bytes.length;
  }

  const tocSize = totalChapters * EBK2_CONFIG.TOC_ENTRY_SIZE;
  const firstPayloadOffset = EBK2_CONFIG.HEADER_SIZE + tocSize;
  const totalFileSize = firstPayloadOffset + totalPayloadSize;

  const buffer = new Uint8Array(totalFileSize);
  const view = new DataView(buffer.buffer);

  // 2. Write Header (104 bytes, 0x68)
  // Magic 'EBK2'
  buffer[0] = EBK2_CONFIG.MAGIC[0];
  buffer[1] = EBK2_CONFIG.MAGIC[1];
  buffer[2] = EBK2_CONFIG.MAGIC[2];
  buffer[3] = EBK2_CONFIG.MAGIC[3];

  // Version: 0x0002 (little endian)
  view.setUint16(4, 2, true);

  // Title: 64 bytes (null-padded)
  const titleBytes = encoder.encode(title.trim().slice(0, 63));
  for (let i = 0; i < 64; i++) {
    buffer[6 + i] = i < titleBytes.length ? titleBytes[i] : 0x00;
  }

  // Author: 32 bytes (null-padded)
  const authorBytes = encoder.encode(author.trim().slice(0, 31));
  for (let i = 0; i < 32; i++) {
    buffer[70 + i] = i < authorBytes.length ? authorBytes[i] : 0x00;
  }

  // Total Chapters: uint16_t (little endian)
  view.setUint16(102, totalChapters, true);

  // 3. Write TOC Entries (40 bytes each) and copy Payloads
  let tocPos = EBK2_CONFIG.HEADER_SIZE;
  let currentPayloadOffset = firstPayloadOffset;

  for (let i = 0; i < totalChapters; i++) {
    const chapTitle = (chapters[i].title || `Chapter ${i + 1}`).trim().slice(0, 31);
    const chapTitleBytes = encoder.encode(chapTitle);
    const payloadBytes = encodedPayloads[i];

    // Chapter Title (32 bytes)
    for (let j = 0; j < 32; j++) {
      buffer[tocPos + j] = j < chapTitleBytes.length ? chapTitleBytes[j] : 0x00;
    }

    // Offset: uint32_t (little endian)
    view.setUint32(tocPos + 32, currentPayloadOffset, true);

    // Length: uint32_t (little endian)
    view.setUint32(tocPos + 36, payloadBytes.length, true);

    // Copy Payload into buffer at currentPayloadOffset
    buffer.set(payloadBytes, currentPayloadOffset);

    tocPos += EBK2_CONFIG.TOC_ENTRY_SIZE;
    currentPayloadOffset += payloadBytes.length;
  }

  return buffer;
}

/**
 * Validates an .ebk binary buffer against the official ESP32-S3 reader specification.
 * Supports both v2 Text ('EBK2') and legacy v1 Bitmap ('EBOK').
 */
export function validateEbkBinary(buffer) {
  if (buffer.length < EBK_CONFIG.HEADER_SIZE) {
    return { valid: false, error: 'File smaller than 40-byte header.' };
  }

  const isV2 = buffer[0] === EBK2_CONFIG.MAGIC[0] &&
               buffer[1] === EBK2_CONFIG.MAGIC[1] &&
               buffer[2] === EBK2_CONFIG.MAGIC[2] &&
               buffer[3] === EBK2_CONFIG.MAGIC[3];

  const isV1 = buffer[0] === EBK_CONFIG.MAGIC[0] &&
               buffer[1] === EBK_CONFIG.MAGIC[1] &&
               buffer[2] === EBK_CONFIG.MAGIC[2] &&
               buffer[3] === EBK_CONFIG.MAGIC[3];

  if (!isV2 && !isV1) {
    return { valid: false, error: 'Invalid magic bytes. Expected "EBK2" or "EBOK".' };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (isV2) {
    if (buffer.length < EBK2_CONFIG.HEADER_SIZE) {
      return { valid: false, error: 'File smaller than 104-byte v2 header.' };
    }
    const version = view.getUint16(4, true);
    const titleBytes = buffer.slice(6, 70);
    const titleEnd = titleBytes.indexOf(0x00);
    const title = new TextDecoder().decode(titleBytes.slice(0, titleEnd !== -1 ? titleEnd : 64));

    const authorBytes = buffer.slice(70, 102);
    const authorEnd = authorBytes.indexOf(0x00);
    const author = new TextDecoder().decode(authorBytes.slice(0, authorEnd !== -1 ? authorEnd : 32));

    const totalChapters = view.getUint16(102, true);

    return {
      valid: true,
      format: 'v2_text',
      version,
      title,
      author,
      totalChapters,
      fileSize: buffer.length
    };
  }

  // Legacy v1 Bitmap
  const totalFrames = view.getUint16(4, true);
  const titleBytes = buffer.slice(6, 38);
  const titleEnd = titleBytes.indexOf(0x00);
  const title = new TextDecoder().decode(titleBytes.slice(0, titleEnd !== -1 ? titleEnd : 32));
  const fontId = view.getUint16(38, true);

  const expectedIndexEnd = EBK_CONFIG.HEADER_SIZE + (totalFrames * 4);
  if (buffer.length < expectedIndexEnd) {
    return { valid: false, error: 'Buffer truncated before end of index table.' };
  }

  return {
    valid: true,
    format: 'v1_bitmap',
    totalFrames,
    title,
    fontId,
    fileSize: buffer.length
  };
}

/**
 * Triggers a browser download of the generated .ebk file.
 */
export function downloadEbkBlob(uint8Array, filename) {
  const safeFilename = (filename || 'book').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const finalFilename = safeFilename.endsWith('.ebk') ? safeFilename : `${safeFilename}.ebk`;

  const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Streams .ebk bytes over Web Serial directly to XIAO ESP32-S3.
 */
export async function streamEbkOverSerial(port, uint8Array, onProgress) {
  if (!port || !port.writable) {
    throw new Error('Serial port is not open or writable.');
  }

  const writer = port.writable.getWriter();
  const chunkSize = 256;
  let offset = 0;

  try {
    while (offset < uint8Array.length) {
      const chunk = uint8Array.slice(offset, offset + chunkSize);
      await writer.write(chunk);
      offset += chunk.length;

      if (onProgress) {
        const percent = Math.floor((offset / uint8Array.length) * 100);
        onProgress(percent, offset, uint8Array.length);
      }
      
      // Give serial driver brief breathing room
      await new Promise(r => setTimeout(r, 10));
    }
  } finally {
    writer.releaseLock();
  }
}
