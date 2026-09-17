// Controlled One-at-a-Time Generator with Stop Capability (No Auto-Run)

import { buildChapterPrompt } from './promptBuilder.js';
import { generateChapterSummary } from './geminiService.js';
import { updateChunkSummary, getAppSettings } from '../db/indexedDb.js';

class QueueManager {
  constructor() {
    this.activeBook = null;
    this.isRunning = false;
    this.currentChunkId = null;
    this.abortController = null;
    this.previousChunkState = null;
    this.listeners = {
      onGenerationStart: [],
      onChunkStart: [],
      onChunkComplete: [],
      onChunkError: [],
      onChunkStopped: [],
      onGenerationFinished: []
    };
  }

  subscribe(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  setActiveBook(book) {
    this.activeBook = book;
  }

  // Generate only the next pending section (strict 1-at-a-time, NO auto-run)
  async generateNext(book, settings) {
    if (this.isRunning) return null;
    this.activeBook = book;
    const nextChunk = book.chunks.find(c => c.status === 'pending' || c.status === 'error');
    if (!nextChunk) return null;

    this.isRunning = true;
    this.emit('onGenerationStart', { bookId: book.id, chunkId: nextChunk.id });
    try {
      const res = await this._processSingleChunk(nextChunk, settings);
      return res;
    } finally {
      this.isRunning = false;
      this.currentChunkId = null;
      this.abortController = null;
      this.emit('onGenerationFinished', { bookId: book.id });
    }
  }

  // Generate or regenerate a single specific section
  async regenerateSingle(book, chunkId, customOverrides = {}) {
    if (this.isRunning) {
      // If already generating this or another chunk, stop first or throw
      throw new Error('A section is already being generated. Please wait or stop it first.');
    }
    this.activeBook = book;
    const chunk = book.chunks.find(c => c.id === chunkId);
    if (!chunk) throw new Error('Chunk not found: ' + chunkId);

    const appSettings = await getAppSettings();
    const mergedSettings = {
      ...appSettings,
      ...customOverrides
    };

    this.isRunning = true;
    this.emit('onGenerationStart', { bookId: book.id, chunkId: chunk.id });
    try {
      return await this._processSingleChunk(chunk, mergedSettings, true);
    } finally {
      this.isRunning = false;
      this.currentChunkId = null;
      this.abortController = null;
      this.emit('onGenerationFinished', { bookId: book.id });
    }
  }

  // Stop the current generation immediately
  async stopGeneration() {
    if (!this.isRunning || !this.abortController) {
      return false;
    }

    // Trigger abort signal
    this.abortController.abort();

    if (this.activeBook && this.currentChunkId) {
      const chunk = this.activeBook.chunks.find(c => c.id === this.currentChunkId);
      if (chunk) {
        // Revert chunk status back to pending (or previous summary if it was a regen)
        const revertedStatus = this.previousChunkState?.status === 'completed' ? 'completed' : 'pending';
        const updatedChunk = await updateChunkSummary(this.activeBook.id, chunk.id, {
          status: revertedStatus,
          errorMsg: null
        });

        const idx = this.activeBook.chunks.findIndex(c => c.id === chunk.id);
        if (idx !== -1) {
          this.activeBook.chunks[idx] = updatedChunk;
        }

        this.emit('onChunkStopped', { chunk: updatedChunk });
      }
    }

    this.isRunning = false;
    this.currentChunkId = null;
    this.abortController = null;
    this.emit('onGenerationFinished', { bookId: this.activeBook?.id });
    return true;
  }

  async _processSingleChunk(chunk, settings, isRegen = false) {
    this.currentChunkId = chunk.id;
    this.previousChunkState = { ...chunk };
    this.abortController = new AbortController();

    chunk.status = 'generating';
    this.emit('onChunkStart', { chunk, isRegen });

    try {
      const model = settings.model || settings.defaultModel || 'gemini-3.8-flash';
      const brevity = settings.brevity || settings.defaultBrevity || 'indepth';
      const customFocus = settings.customFocus || '';
      const focusPresetId = settings.focusPresetId || 'all';
      const language = settings.language || settings.defaultLanguage || 'en';

      const promptData = buildChapterPrompt({
        bookTitle: this.activeBook.title,
        bookAuthor: this.activeBook.author,
        chapterLabel: chunk.title,
        chapterText: chunk.text,
        brevity,
        customFocus,
        focusPresetId,
        language
      });

      const summaryMarkdown = await generateChapterSummary({
        apiKey: settings.apiKey,
        model,
        systemInstructions: promptData.systemInstructions,
        userPrompt: promptData.userPrompt,
        isMockMode: settings.isMockMode || !settings.apiKey,
        chapterLabel: chunk.title,
        bookTitle: this.activeBook.title,
        sampleText: chunk.text,
        language,
        signal: this.abortController.signal
      });

      const updatedChunk = await updateChunkSummary(this.activeBook.id, chunk.id, {
        status: 'completed',
        summary: summaryMarkdown,
        modelUsed: model,
        brevity,
        customFocus: customFocus || (focusPresetId !== 'all' ? focusPresetId : null),
        language,
        errorMsg: null
      });

      // Update in-memory reference
      const idx = this.activeBook.chunks.findIndex(c => c.id === chunk.id);
      if (idx !== -1) {
        this.activeBook.chunks[idx] = updatedChunk;
      }

      this.emit('onChunkComplete', { chunk: updatedChunk, isRegen });
      return updatedChunk;
    } catch (err) {
      if (err.name === 'AbortError' || this.abortController?.signal?.aborted) {
        console.log('Generation aborted by user');
        return null;
      }

      console.error('Generation error on chunk:', chunk.id, err);
      const updatedChunk = await updateChunkSummary(this.activeBook.id, chunk.id, {
        status: 'error',
        errorMsg: err.message || 'Generation failed'
      });

      const idx = this.activeBook.chunks.findIndex(c => c.id === chunk.id);
      if (idx !== -1) {
        this.activeBook.chunks[idx] = updatedChunk;
      }

      this.emit('onChunkError', { chunk: updatedChunk, error: err.message });
      throw err;
    }
  }
}

export const queueManager = new QueueManager();
