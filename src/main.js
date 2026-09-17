// LuminaEPUB — Main Application Controller

import { marked } from 'marked';
import {
  getAllBooks,
  getBook,
  saveBook,
  deleteBook,
  getAppSettings,
  saveAppSettings,
  updateChunkSummary
} from './db/indexedDb.js';
import {
  parseEpubFile,
  createChunksFromChapters,
  getSampleClassicBook
} from './parser/epubParser.js';
import { queueManager } from './services/queueManager.js';
import { testGeminiConnection, SUPPORTED_MODELS } from './services/geminiService.js';
import { BREVITY_PRESETS, FOCUS_PRESETS, SUPPORTED_LANGUAGES } from './services/promptBuilder.js';

// Configure marked for clean, secure rendering
marked.setOptions({
  gfm: true,
  breaks: true
});

class App {
  constructor() {
    this.currentBook = null;
    this.activeChunkIndex = 0;
    this.appSettings = null;
    this.viewMode = 'summary'; // 'summary' | 'split' | 'original'
    this.selectedRegenPreset = 'all';

    this.initElements();
    this.bindEvents();
    this.init();
  }

  initElements() {
    // Top Bar
    this.btnOpenLibrary = document.getElementById('btn-open-library');
    this.headerBookTitle = document.getElementById('header-active-book-title');
    this.headerModelName = document.getElementById('header-model-name');
    this.headerLanguageName = document.getElementById('header-language-name');
    this.btnExportMarkdown = document.getElementById('btn-export-markdown');
    this.btnUploadEpubNav = document.getElementById('btn-upload-epub-nav');
    this.btnOpenSettings = document.getElementById('btn-open-settings');

    // Sidebar
    this.sidebarBookCover = document.getElementById('sidebar-book-cover');
    this.sidebarBookTitle = document.getElementById('sidebar-book-title');
    this.sidebarBookAuthor = document.getElementById('sidebar-book-author');
    this.sidebarChapterCount = document.getElementById('sidebar-chapter-count');
    this.sidebarTotalWords = document.getElementById('sidebar-total-words');
    this.sidebarProgressPercent = document.getElementById('sidebar-progress-percent');
    this.sidebarProgressFill = document.getElementById('sidebar-progress-fill');
    this.sidebarChunkSizeLabel = document.getElementById('sidebar-chunk-size-label');

    // Generation controls
    this.btnGenerateNext = document.getElementById('btn-generate-next');
    this.btnGenerateNextText = document.getElementById('btn-generate-next-text');
    this.btnStopGeneration = document.getElementById('btn-stop-generation');
    this.btnStopGenerationCard = document.getElementById('btn-stop-generation-card');
    this.btnRechunkBook = document.getElementById('btn-rechunk-book');
    this.chunkListCount = document.getElementById('chunk-list-count');
    this.chapterListContainer = document.getElementById('chapter-list');

    // Reader Toolbar
    this.btnPrevChunk = document.getElementById('btn-prev-chunk');
    this.btnNextChunk = document.getElementById('btn-next-chunk');
    this.readerChunkIndicator = document.getElementById('reader-chunk-indicator');
    this.readerChunkTitle = document.getElementById('reader-chunk-title');
    this.btnOpenRegenerate = document.getElementById('btn-open-regenerate');
    this.btnCopySummary = document.getElementById('btn-copy-summary');
    this.viewModeButtons = document.querySelectorAll('.view-mode-toggle .toggle-btn');

    // Reader Meta Bar
    this.metaWordCount = document.getElementById('meta-word-count');
    this.metaChunkStatus = document.getElementById('meta-chunk-status');
    this.metaModelTag = document.getElementById('meta-model-tag');
    this.metaBrevityTag = document.getElementById('meta-brevity-tag');
    this.metaLanguageTag = document.getElementById('meta-language-tag');

    // Reader Panes
    this.readerViewports = document.getElementById('reader-viewports');
    this.originalTextContent = document.getElementById('original-text-content');
    this.originalReadingTime = document.getElementById('original-reading-time');
    this.summarySavedTime = document.getElementById('summary-saved-time');
    this.summaryEmptyState = document.getElementById('summary-empty-state');
    this.summaryRenderedMarkdown = document.getElementById('summary-rendered-markdown');
    this.summaryGeneratingState = document.getElementById('summary-generating-state');
    this.generatingStateTitle = document.getElementById('generating-state-title');
    this.generatingStateSub = document.getElementById('generating-state-sub');
    this.btnGenerateCurrent = document.getElementById('btn-generate-current');

    // Modals
    this.modalLibrary = document.getElementById('modal-library');
    this.modalSettings = document.getElementById('modal-settings');
    this.modalRegenerate = document.getElementById('modal-regenerate');
    this.modalRechunk = document.getElementById('modal-rechunk');

    // Dropzone
    this.epubDropzone = document.getElementById('epub-dropzone');
    this.epubFileInput = document.getElementById('epub-file-input');
    this.btnLoadSampleBook = document.getElementById('btn-load-sample-book');
    this.libraryBooksGrid = document.getElementById('library-books-grid');

    // Settings elements
    this.inputApiKey = document.getElementById('input-api-key');
    this.btnTestApiKey = document.getElementById('btn-test-api-key');
    this.selectChunkSize = document.getElementById('select-chunk-size');
    this.selectBrevity = document.getElementById('select-brevity');
    this.selectOutputLanguage = document.getElementById('select-output-language');
    this.btnSaveSettings = document.getElementById('btn-save-settings');

    // Regenerate elements
    this.regenBrevity = document.getElementById('regen-brevity');
    this.regenFocusChips = document.getElementById('regen-focus-chips');
    this.regenCustomFocus = document.getElementById('regen-custom-focus');
    this.regenModel = document.getElementById('regen-model');
    this.regenLanguage = document.getElementById('regen-language');
    this.btnConfirmRegenerate = document.getElementById('btn-confirm-regenerate');
    this.regenModalSubtitle = document.getElementById('regen-modal-subtitle');

    // Rechunk elements
    this.rechunkSizeSelect = document.getElementById('rechunk-size-select');
    this.btnConfirmRechunk = document.getElementById('btn-confirm-rechunk');

    this.toastContainer = document.getElementById('toast-container');
  }

  async init() {
    this.appSettings = await getAppSettings();
    this.updateHeaderModelPill();
    this.updateHeaderLanguagePill();

    const books = await getAllBooks();
    if (books.length === 0) {
      // First run: load sample classic book
      const sample = getSampleClassicBook();
      sample.chunks = createChunksFromChapters(sample.rawChapters, this.appSettings.defaultChunkSize || 1);
      await saveBook(sample);
      this.currentBook = sample;
      this.appSettings.activeBookId = sample.id;
      await saveAppSettings(this.appSettings);
    } else {
      const activeId = this.appSettings.activeBookId;
      const found = books.find(b => b.id === activeId) || books[0];
      this.currentBook = found;
    }

    this.renderCurrentBook();
    this.setupQueueListeners();
  }

  bindEvents() {
    // Navigation & Modal triggers
    this.btnOpenLibrary.addEventListener('click', () => this.openLibraryModal());
    this.btnUploadEpubNav.addEventListener('click', () => this.openLibraryModal());
    this.btnOpenSettings.addEventListener('click', () => this.openSettingsModal());
    this.btnRechunkBook.addEventListener('click', () => this.openRechunkModal());
    this.btnExportMarkdown.addEventListener('click', () => this.exportBookAsMarkdown());

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-close-modal');
        document.getElementById(modalId).style.display = 'none';
      });
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.style.display = 'none';
        }
      });
    });

    // Reader Section Navigation
    this.btnPrevChunk.addEventListener('click', () => {
      if (this.activeChunkIndex > 0) {
        this.selectChunk(this.activeChunkIndex - 1);
      }
    });

    this.btnNextChunk.addEventListener('click', () => {
      if (this.currentBook && this.activeChunkIndex < this.currentBook.chunks.length - 1) {
        this.selectChunk(this.activeChunkIndex + 1);
      }
    });

    // View Mode toggles
    this.viewModeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.getAttribute('data-view');
        this.setViewMode(mode);
      });
    });

    // Generation Buttons (1-by-1 only)
    if (this.btnGenerateNext) {
      this.btnGenerateNext.addEventListener('click', () => this.generateNextSingle());
    }
    if (this.btnStopGeneration) {
      this.btnStopGeneration.addEventListener('click', () => this.stopCurrentGeneration());
    }
    if (this.btnStopGenerationCard) {
      this.btnStopGenerationCard.addEventListener('click', () => this.stopCurrentGeneration());
    }
    this.btnGenerateCurrent.addEventListener('click', () => this.generateActiveChunk());

    // Regenerate Section
    this.btnOpenRegenerate.addEventListener('click', () => this.openRegenerateModal());
    this.btnConfirmRegenerate.addEventListener('click', () => this.confirmRegenerate());

    // Regenerate Focus Preset Chips
    this.regenFocusChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      this.regenFocusChips.querySelectorAll('.chip-select').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      this.selectedRegenPreset = chip.getAttribute('data-preset');
    });

    // Copy summary
    this.btnCopySummary.addEventListener('click', () => this.copyActiveSummary());

    // Upload & Dropzone
    this.epubDropzone.addEventListener('click', () => this.epubFileInput.click());
    this.epubFileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    this.epubDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.epubDropzone.classList.add('dragover');
    });

    this.epubDropzone.addEventListener('dragleave', () => {
      this.epubDropzone.classList.remove('dragover');
    });

    this.epubDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.epubDropzone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.processEpubFile(files[0]);
      }
    });

    this.btnLoadSampleBook.addEventListener('click', () => this.loadSampleBook());

    // Settings actions
    this.btnTestApiKey.addEventListener('click', () => this.testApiKey());
    this.btnSaveSettings.addEventListener('click', () => this.saveSettingsFromModal());

    // Rechunk action
    this.btnConfirmRechunk.addEventListener('click', () => this.applyRechunk());
  }

  // ================= RENDER LOGIC =================

  renderCurrentBook() {
    if (!this.currentBook) return;

    // Header & Sidebar
    this.headerBookTitle.textContent = this.currentBook.title;
    this.sidebarBookTitle.textContent = this.currentBook.title;
    this.sidebarBookAuthor.textContent = this.currentBook.author || 'Unknown Author';

    if (this.currentBook.cover) {
      this.sidebarBookCover.style.backgroundImage = `url(${this.currentBook.cover})`;
      this.sidebarBookCover.textContent = '';
    } else {
      this.sidebarBookCover.style.backgroundImage = 'none';
      this.sidebarBookCover.textContent = '📖';
    }

    const totalWords = this.currentBook.chunks.reduce((acc, c) => acc + (c.wordCount || 0), 0);
    this.sidebarTotalWords.textContent = `${totalWords.toLocaleString()} words`;
    this.sidebarChapterCount.textContent = `${this.currentBook.chunks.length} Sections`;
    this.chunkListCount.textContent = `${this.currentBook.chunks.length} total`;
    this.sidebarChunkSizeLabel.textContent = this.currentBook.settings?.chunkingSize || this.appSettings?.defaultChunkSize || 1;

    this.updateProgressUI();
    this.renderChapterList();

    // Ensure valid active chunk index
    if (this.activeChunkIndex >= this.currentBook.chunks.length) {
      this.activeChunkIndex = 0;
    }
    this.renderActiveChunk();
  }

  updateProgressUI() {
    if (!this.currentBook || !this.currentBook.chunks) return;
    const completedCount = this.currentBook.chunks.filter(c => c.status === 'completed').length;
    const total = this.currentBook.chunks.length;
    const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    this.sidebarProgressPercent.textContent = `${percent}% (${completedCount}/${total})`;
    this.sidebarProgressFill.style.width = `${percent}%`;

    // Update generation button states (No auto-run)
    if (queueManager.isRunning) {
      if (this.btnStopGeneration) this.btnStopGeneration.style.display = 'inline-flex';
      if (this.btnGenerateNext) this.btnGenerateNext.style.display = 'none';
    } else {
      if (this.btnStopGeneration) this.btnStopGeneration.style.display = 'none';
      if (this.btnGenerateNext) {
        this.btnGenerateNext.style.display = 'inline-flex';
        if (completedCount === total && total > 0) {
          this.btnGenerateNext.disabled = true;
          if (this.btnGenerateNextText) this.btnGenerateNextText.textContent = 'All Sections Summarized';
        } else {
          this.btnGenerateNext.disabled = false;
          if (this.btnGenerateNextText) this.btnGenerateNextText.textContent = 'Generate Next Section (1-by-1)';
        }
      }
    }
  }

  renderChapterList() {
    this.chapterListContainer.innerHTML = '';

    this.currentBook.chunks.forEach((chunk, index) => {
      const item = document.createElement('div');
      item.className = `chapter-item ${index === this.activeChunkIndex ? 'active' : ''}`;
      item.dataset.index = index;

      let statusIconHtml = '';
      if (chunk.status === 'completed') {
        statusIconHtml = '<span class="chapter-item-status-icon status-completed-icon">✓</span>';
      } else if (chunk.status === 'generating') {
        statusIconHtml = '<span class="chapter-item-status-icon status-generating-icon">⏳</span>';
      } else if (chunk.status === 'error') {
        statusIconHtml = '<span class="chapter-item-status-icon status-error-icon">✕</span>';
      } else {
        statusIconHtml = `<span class="chapter-item-status-icon status-pending-icon">${index + 1}</span>`;
      }

      item.innerHTML = `
        ${statusIconHtml}
        <div class="chapter-item-info">
          <div class="chapter-item-title">${this.escapeHtml(chunk.title)}</div>
          <div class="chapter-item-meta">
            <span>${chunk.wordCount?.toLocaleString() || 0} words</span>
            <span>•</span>
            <span class="status-tag status-${chunk.status}">${chunk.status}</span>
          </div>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectChunk(index);
      });

      this.chapterListContainer.appendChild(item);
    });
  }

  selectChunk(index) {
    this.activeChunkIndex = index;
    // Update active class in list
    const items = this.chapterListContainer.querySelectorAll('.chapter-item');
    items.forEach((it, i) => {
      it.classList.toggle('active', i === index);
    });
    this.renderActiveChunk();
  }

  renderActiveChunk() {
    if (!this.currentBook) return;
    const chunk = this.currentBook.chunks[this.activeChunkIndex];
    if (!chunk) return;

    // Nav bar
    this.readerChunkIndicator.textContent = `Section ${this.activeChunkIndex + 1} of ${this.currentBook.chunks.length}`;
    this.readerChunkTitle.textContent = chunk.title;
    this.btnPrevChunk.disabled = this.activeChunkIndex === 0;
    this.btnNextChunk.disabled = this.activeChunkIndex === this.currentBook.chunks.length - 1;

    // Meta bar
    this.metaWordCount.textContent = `${chunk.wordCount?.toLocaleString() || 0} words`;
    this.metaChunkStatus.textContent = chunk.status.toUpperCase();
    this.metaChunkStatus.className = `status-tag status-${chunk.status}`;
    this.metaModelTag.textContent = chunk.modelUsed || this.appSettings.defaultModel;
    
    const brevityKey = chunk.brevity || this.appSettings.defaultBrevity || 'indepth';
    const brevityLabel = BREVITY_PRESETS[brevityKey]?.label || brevityKey;
    this.metaBrevityTag.textContent = brevityLabel;

    const langCode = chunk.language || this.appSettings.defaultLanguage || 'en';
    const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
    if (this.metaLanguageTag) {
      this.metaLanguageTag.textContent = langInfo ? `${langInfo.name} (${langInfo.native})` : langCode.toUpperCase();
    }

    // Original Text Pane
    this.originalTextContent.innerHTML = chunk.text
      ? chunk.text.split('\n\n').map(p => `<p>${this.escapeHtml(p)}</p>`).join('')
      : '<p>No original text available.</p>';

    const readingMins = Math.max(1, Math.round((chunk.wordCount || 800) / 230));
    this.originalReadingTime.textContent = `~${readingMins} min read`;

    // Summary Pane
    if (chunk.status === 'completed' && chunk.summary) {
      this.summaryEmptyState.style.display = 'none';
      this.summaryGeneratingState.style.display = 'none';
      this.summaryRenderedMarkdown.style.display = 'block';
      this.summaryRenderedMarkdown.innerHTML = marked.parse(chunk.summary);

      const summaryWords = chunk.summary.split(/\s+/).length;
      const savedMins = Math.max(1, readingMins - Math.round(summaryWords / 230));
      this.summarySavedTime.textContent = `⚡ Saved ~${savedMins} min (${summaryWords} words)`;
      this.summarySavedTime.style.display = 'inline-block';
    } else if (chunk.status === 'generating') {
      this.summaryEmptyState.style.display = 'none';
      this.summaryRenderedMarkdown.style.display = 'none';
      this.summaryGeneratingState.style.display = 'flex';
      this.generatingStateTitle.textContent = `Generating "${chunk.title}"...`;
      this.generatingStateSub.textContent = `Using ${this.appSettings.defaultModel} • Processing one at a time for maximum literary depth`;
      this.summarySavedTime.style.display = 'none';
    } else {
      // Pending or error
      this.summaryRenderedMarkdown.style.display = 'none';
      this.summaryGeneratingState.style.display = 'none';
      this.summaryEmptyState.style.display = 'flex';
      this.summarySavedTime.style.display = 'none';

      if (chunk.status === 'error') {
        this.summaryEmptyState.querySelector('h3').textContent = 'Generation Encountered an Issue';
        this.summaryEmptyState.querySelector('p').textContent = chunk.errorMsg || 'Failed to generate summary. Click below to retry.';
        this.btnGenerateCurrent.querySelector('span').textContent = 'Retry Generating Section';
      } else {
        this.summaryEmptyState.querySelector('h3').textContent = 'Section Not Yet Summarized';
        this.summaryEmptyState.querySelector('p').textContent = 'Generate an in-depth literary analysis capturing key arguments, chronological milestones, and anchor references.';
        this.btnGenerateCurrent.querySelector('span').textContent = 'Generate This Section Now';
      }
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.viewModeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });

    this.readerViewports.className = `reader-viewports view-mode-${mode}`;
  }

  // ================= CONTROLLED 1-AT-A-TIME GENERATION ENGINE =================

  setupQueueListeners() {
    queueManager.subscribe('onGenerationStart', () => {
      this.updateProgressUI();
    });

    queueManager.subscribe('onChunkStart', ({ chunk }) => {
      this.updateProgressUI();
      this.renderChapterList();
      if (this.currentBook.chunks[this.activeChunkIndex]?.id === chunk.id) {
        this.renderActiveChunk();
      }
    });

    queueManager.subscribe('onChunkComplete', ({ chunk, isRegen }) => {
      this.updateProgressUI();
      this.renderChapterList();
      if (this.currentBook.chunks[this.activeChunkIndex]?.id === chunk.id) {
        this.renderActiveChunk();
      }
      this.showToast(`Completed: ${chunk.title}`, 'success');
    });

    queueManager.subscribe('onChunkError', ({ chunk, error }) => {
      this.updateProgressUI();
      this.renderChapterList();
      if (this.currentBook.chunks[this.activeChunkIndex]?.id === chunk.id) {
        this.renderActiveChunk();
      }
      this.showToast(`Error on ${chunk.title}: ${error}`, 'error');
    });

    queueManager.subscribe('onChunkStopped', ({ chunk }) => {
      this.updateProgressUI();
      this.renderChapterList();
      if (this.currentBook.chunks[this.activeChunkIndex]?.id === chunk.id) {
        this.renderActiveChunk();
      }
      this.showToast(`Stopped generation for ${chunk.title}`, 'default');
    });

    queueManager.subscribe('onGenerationFinished', () => {
      this.updateProgressUI();
    });
  }

  async stopCurrentGeneration() {
    if (!queueManager.isRunning) return;
    const stopped = await queueManager.stopGeneration();
    if (stopped) {
      this.showToast('Generation cancelled by user', 'default');
      this.updateProgressUI();
      this.renderChapterList();
      this.renderActiveChunk();
    }
  }

  async generateNextSingle() {
    if (!this.currentBook || queueManager.isRunning) return;
    const nextPending = this.currentBook.chunks.find(c => c.status === 'pending' || c.status === 'error');
    if (!nextPending) {
      this.showToast('No pending sections remain!', 'success');
      return;
    }
    const idx = this.currentBook.chunks.indexOf(nextPending);
    this.selectChunk(idx);
    this.showToast(`Generating: ${nextPending.title}...`, 'default');
    await queueManager.generateNext(this.currentBook, this.appSettings);
  }

  async generateActiveChunk() {
    if (!this.currentBook || queueManager.isRunning) return;
    const chunk = this.currentBook.chunks[this.activeChunkIndex];
    if (!chunk) return;
    await queueManager.regenerateSingle(this.currentBook, chunk.id, this.appSettings);
  }

  // ================= SINGLE SECTION REGENERATION =================

  openRegenerateModal() {
    const chunk = this.currentBook?.chunks[this.activeChunkIndex];
    if (!chunk) return;

    this.regenModalSubtitle.textContent = `Customizing: ${chunk.title}`;
    this.regenBrevity.value = chunk.brevity || this.appSettings.defaultBrevity || 'indepth';
    this.regenModel.value = chunk.modelUsed || this.appSettings.defaultModel || 'gemini-3.8-flash';
    this.regenLanguage.value = chunk.language || this.appSettings.defaultLanguage || 'en';
    this.regenCustomFocus.value = '';

    // Reset chips to 'all'
    this.selectedRegenPreset = 'all';
    this.regenFocusChips.querySelectorAll('.chip-select').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-preset') === 'all');
    });

    this.modalRegenerate.style.display = 'flex';
  }

  async confirmRegenerate() {
    const chunk = this.currentBook?.chunks[this.activeChunkIndex];
    if (!chunk) return;

    const brevity = this.regenBrevity.value;
    const model = this.regenModel.value;
    const language = this.regenLanguage.value;
    const customFocus = this.regenCustomFocus.value.trim();
    const focusPresetId = this.selectedRegenPreset;

    this.modalRegenerate.style.display = 'none';

    this.showToast(`Regenerating "${chunk.title}" (${language.toUpperCase()})...`, 'default');

    try {
      await queueManager.regenerateSingle(this.currentBook, chunk.id, {
        brevity,
        model,
        customFocus,
        focusPresetId,
        language
      });
    } catch (err) {
      console.error(err);
    }
  }

  // ================= LIBRARY & BOOK SWITCHER =================

  async openLibraryModal() {
    const books = await getAllBooks();
    this.libraryBooksGrid.innerHTML = '';

    books.forEach(book => {
      const isCurrent = book.id === this.currentBook?.id;
      const completed = book.chunks.filter(c => c.status === 'completed').length;
      const total = book.chunks.length;

      const card = document.createElement('div');
      card.className = `library-book-item ${isCurrent ? 'active-book' : ''}`;
      card.innerHTML = `
        <div class="lib-book-info">
          <div class="lib-book-icon">📖</div>
          <div class="lib-book-details">
            <div class="lib-book-title">${this.escapeHtml(book.title)}</div>
            <div class="lib-book-meta">${this.escapeHtml(book.author || 'Unknown')} • ${completed}/${total} sections summarized</div>
          </div>
        </div>
        <div class="lib-book-actions">
          ${isCurrent ? '<span class="chip-badge">Active</span>' : `<button class="btn-secondary btn-switch" data-id="${book.id}">Switch</button>`}
          <button class="btn-icon btn-delete" data-id="${book.id}" title="Delete book">🗑</button>
        </div>
      `;

      const switchBtn = card.querySelector('.btn-switch');
      if (switchBtn) {
        switchBtn.addEventListener('click', () => this.switchActiveBook(book.id));
      }

      const deleteBtn = card.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDeleteBook(book.id, book.title);
      });

      this.libraryBooksGrid.appendChild(card);
    });

    this.modalLibrary.style.display = 'flex';
  }

  async switchActiveBook(bookId) {
    const book = await getBook(bookId);
    if (!book) return;

    this.currentBook = book;
    this.activeChunkIndex = 0;
    this.appSettings.activeBookId = bookId;
    await saveAppSettings(this.appSettings);

    this.renderCurrentBook();
    this.modalLibrary.style.display = 'none';
    this.showToast(`Switched to "${book.title}"`, 'success');
  }

  async confirmDeleteBook(bookId, title) {
    if (!confirm(`Are you sure you want to delete "${title}" and all its saved summaries?`)) return;

    await deleteBook(bookId);
    const remaining = await getAllBooks();

    if (this.currentBook?.id === bookId) {
      if (remaining.length > 0) {
        await this.switchActiveBook(remaining[0].id);
      } else {
        await this.loadSampleBook();
      }
    } else {
      this.openLibraryModal();
    }
    this.showToast('Book deleted from local library', 'default');
  }

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      await this.processEpubFile(file);
    }
    event.target.value = '';
  }

  async processEpubFile(file) {
    this.showToast(`Parsing EPUB: "${file.name}"...`, 'default');

    try {
      const parsedBook = await parseEpubFile(file);
      const chunkSize = this.appSettings.defaultChunkSize || 1;
      parsedBook.chunks = createChunksFromChapters(parsedBook.rawChapters, chunkSize);
      parsedBook.settings = { chunkingSize: chunkSize };

      await saveBook(parsedBook);
      this.currentBook = parsedBook;
      this.activeChunkIndex = 0;
      this.appSettings.activeBookId = parsedBook.id;
      await saveAppSettings(this.appSettings);

      this.modalLibrary.style.display = 'none';
      this.renderCurrentBook();
      this.showToast(`Successfully imported "${parsedBook.title}" (${parsedBook.chunks.length} sections)`, 'success');
    } catch (err) {
      console.error('EPUB parse failure:', err);
      alert(`Could not parse EPUB: ${err.message}`);
      this.showToast(`EPUB Parsing Error: ${err.message}`, 'error');
    }
  }

  async loadSampleBook() {
    const sample = getSampleClassicBook();
    sample.chunks = createChunksFromChapters(sample.rawChapters, this.appSettings.defaultChunkSize || 1);
    sample.id = `book_sample_${Date.now()}`;
    await saveBook(sample);

    this.currentBook = sample;
    this.activeChunkIndex = 0;
    this.appSettings.activeBookId = sample.id;
    await saveAppSettings(this.appSettings);

    this.modalLibrary.style.display = 'none';
    this.renderCurrentBook();
    this.showToast('Loaded "The Time Machine" by H.G. Wells', 'success');
  }

  // ================= SETTINGS MODAL =================

  openSettingsModal() {
    this.inputApiKey.value = this.appSettings.apiKey || '';
    this.selectChunkSize.value = this.appSettings.defaultChunkSize || '1';
    this.selectBrevity.value = this.appSettings.defaultBrevity || 'indepth';
    if (this.selectOutputLanguage) {
      this.selectOutputLanguage.value = this.appSettings.defaultLanguage || 'en';
    }

    const radios = document.querySelectorAll('input[name="setting-model"]');
    radios.forEach(radio => {
      radio.checked = (radio.value === this.appSettings.defaultModel);
    });

    this.modalSettings.style.display = 'flex';
  }

  async testApiKey() {
    const apiKey = this.inputApiKey.value.trim();
    if (!apiKey) {
      alert('Please enter an API key first, or leave blank to use Demo Mode.');
      return;
    }

    const selectedModelRadio = document.querySelector('input[name="setting-model"]:checked');
    const model = selectedModelRadio?.value || 'gemini-3.8-flash';

    this.btnTestApiKey.disabled = true;
    this.btnTestApiKey.textContent = 'Testing...';

    try {
      const res = await testGeminiConnection(apiKey, model);
      alert(res.message);
      this.showToast('Gemini connection verified successfully!', 'success');
    } catch (err) {
      alert(err.message);
      this.showToast(err.message, 'error');
    } finally {
      this.btnTestApiKey.disabled = false;
      this.btnTestApiKey.textContent = 'Test Connection';
    }
  }

  async saveSettingsFromModal() {
    const selectedModelRadio = document.querySelector('input[name="setting-model"]:checked');
    this.appSettings.apiKey = this.inputApiKey.value.trim();
    this.appSettings.defaultModel = selectedModelRadio?.value || 'gemini-3.8-flash';
    this.appSettings.defaultChunkSize = parseInt(this.selectChunkSize.value, 10) || 1;
    this.appSettings.defaultBrevity = this.selectBrevity.value || 'indepth';
    if (this.selectOutputLanguage) {
      this.appSettings.defaultLanguage = this.selectOutputLanguage.value || 'en';
    }

    await saveAppSettings(this.appSettings);
    this.updateHeaderModelPill();
    this.updateHeaderLanguagePill();
    this.modalSettings.style.display = 'none';
    this.showToast('Settings saved successfully!', 'success');
    this.renderActiveChunk();
  }

  updateHeaderModelPill() {
    const modelId = this.appSettings.defaultModel || 'gemini-3.8-flash';
    const modelInfo = SUPPORTED_MODELS.find(m => m.id === modelId);
    this.headerModelName.textContent = modelInfo ? modelInfo.name : modelId;
  }

  updateHeaderLanguagePill() {
    const langCode = this.appSettings.defaultLanguage || 'en';
    const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
    if (this.headerLanguageName) {
      this.headerLanguageName.textContent = langInfo ? `${langInfo.name} (${langInfo.code.toUpperCase()})` : langCode.toUpperCase();
    }
  }

  // ================= RECHUNK MODAL =================

  openRechunkModal() {
    if (!this.currentBook) return;
    const currentSize = this.currentBook.settings?.chunkingSize || 1;
    this.rechunkSizeSelect.value = String(currentSize);
    this.modalRechunk.style.display = 'flex';
  }

  async applyRechunk() {
    if (!this.currentBook) return;
    const newSize = parseInt(this.rechunkSizeSelect.value, 10) || 1;

    this.currentBook.chunks = createChunksFromChapters(this.currentBook.rawChapters, newSize);
    if (!this.currentBook.settings) this.currentBook.settings = {};
    this.currentBook.settings.chunkingSize = newSize;

    await saveBook(this.currentBook);
    this.activeChunkIndex = 0;
    this.modalRechunk.style.display = 'none';
    this.renderCurrentBook();
    this.showToast(`Re-chunked into groups of ${newSize} chapter(s)`, 'success');
  }

  // ================= EXPORT =================

  exportBookAsMarkdown() {
    if (!this.currentBook) return;

    let md = `# ${this.currentBook.title}\n`;
    if (this.currentBook.author) {
      md += `*By ${this.currentBook.author}*\n\n`;
    }
    md += `*AI Literary Companion Guide generated via LuminaEPUB*\n\n---\n\n`;

    this.currentBook.chunks.forEach((chunk, i) => {
      md += `## ${chunk.title}\n\n`;
      if (chunk.summary) {
        md += `${chunk.summary}\n\n`;
      } else {
        md += `*(Summary pending)*\n\n`;
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentBook.title.replace(/[^a-z0-9]/gi, '_')}_Companion_Guide.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('Companion Guide exported as Markdown!', 'success');
  }

  copyActiveSummary() {
    const chunk = this.currentBook?.chunks[this.activeChunkIndex];
    if (!chunk || !chunk.summary) {
      this.showToast('No summary to copy for this section yet', 'default');
      return;
    }

    navigator.clipboard.writeText(chunk.summary).then(() => {
      this.showToast('Summary copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Failed to copy to clipboard', 'error');
    });
  }

  // ================= UTILS =================

  showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
