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
import {
  paginateSectionsForEpaper,
  renderPageToCanvas,
  canvasTo1BitFrameBuffer,
  buildEbkBinary,
  buildEbk2Binary,
  downloadEbkBlob,
  streamEbkOverSerial,
  streamEbkOverBLE,
  EBK_CONFIG,
  EBK2_CONFIG
} from './services/ebkGenerator.js';
import { bleDeviceManager } from './services/bleDeviceManager.js';

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

    // EBK E-Reader state
    this.ebkPages = [];
    this.ebkCurrentPreviewIndex = 0;
    this.ebkIsGenerating = false;

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
    this.btnOpenExportEbk = document.getElementById('btn-open-export-ebk');
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

    // First-Time Setup / Onboarding Modal
    this.modalApiSetup = document.getElementById('modal-api-setup');
    this.setupInputApiKey = document.getElementById('setup-input-api-key');
    this.setupBtnTestKey = document.getElementById('setup-btn-test-key');
    this.setupSelectModel = document.getElementById('setup-select-model');
    this.setupSelectLanguage = document.getElementById('setup-select-language');
    this.setupBtnSaveKey = document.getElementById('setup-btn-save-key');
    // EBK Export Modal elements
    this.modalExportEbk = document.getElementById('modal-export-ebk');
    this.ebkFormatSelect = document.getElementById('ebk-format-select');
    this.ebkSourceSelect = document.getElementById('ebk-source-select');
    this.ebkFontPreset = document.getElementById('ebk-font-preset');
    this.ebkStatFrames = document.getElementById('ebk-stat-frames');
    this.ebkStatSize = document.getElementById('ebk-stat-size');
    this.ebkStatFit = document.getElementById('ebk-stat-fit');
    this.ebkPreviewCanvas = document.getElementById('ebk-preview-canvas');
    this.ebkPreviewPageIndicator = document.getElementById('ebk-preview-page-indicator');
    this.ebkPreviewPageLabel = document.getElementById('ebk-preview-page-label');
    this.ebkBtnPrevPage = document.getElementById('ebk-btn-prev-page');
    this.ebkBtnNextPage = document.getElementById('ebk-btn-next-page');
    this.ebkProgressBox = document.getElementById('ebk-progress-box');
    this.ebkProgressStatus = document.getElementById('ebk-progress-status');
    this.ebkProgressPct = document.getElementById('ebk-progress-pct');
    this.ebkProgressFill = document.getElementById('ebk-progress-fill');
    this.ebkBtnBleStream = document.getElementById('ebk-btn-ble-stream');
    this.ebkBtnSerialStream = document.getElementById('ebk-btn-serial-stream');
    this.ebkBtnDownload = document.getElementById('ebk-btn-download');

    // E-Reader Studio elements
    this.btnOpenEreaderStudio = document.getElementById('btn-open-ereader-studio');
    this.modalEreaderStudio = document.getElementById('modal-ereader-studio');
    this.studioConnectionStatus = document.getElementById('studio-connection-status');
    this.studioTabBle = document.getElementById('studio-tab-ble');
    this.studioTabSerial = document.getElementById('studio-tab-serial');
    this.studioPanelBle = document.getElementById('studio-panel-ble');
    this.studioPanelSerial = document.getElementById('studio-panel-serial');
    this.studioBleConnectBtn = document.getElementById('studio-ble-connect-btn');
    this.studioBleDisconnectBtn = document.getElementById('studio-ble-disconnect-btn');
    this.studioSerialConnectBtn = document.getElementById('studio-serial-connect-btn');
    this.studioSerialDisconnectBtn = document.getElementById('studio-serial-disconnect-btn');
    this.studioBookCountBadge = document.getElementById('studio-book-count-badge');
    this.studioRefreshBooksBtn = document.getElementById('studio-refresh-books-btn');
    this.studioStorageText = document.getElementById('studio-storage-text');
    this.studioStorageBar = document.getElementById('studio-storage-bar');
    this.studioBooksEmpty = document.getElementById('studio-books-empty');
    this.studioBooksTableWrapper = document.getElementById('studio-books-table-wrapper');
    this.studioBooksTbody = document.getElementById('studio-books-tbody');
    this.studioSyncActiveBtn = document.getElementById('studio-sync-active-btn');
    this.studioDropzone = document.getElementById('studio-dropzone');
    this.studioDropzoneText = document.getElementById('studio-dropzone-text');
    this.studioDropzoneSub = document.getElementById('studio-dropzone-sub');
    this.studioFileInput = document.getElementById('studio-file-input');
    this.studioUploadBtn = document.getElementById('studio-upload-btn');
    this.studioProgressContainer = document.getElementById('studio-progress-container');
    this.studioProgressBar = document.getElementById('studio-progress-bar');
    this.studioProgressStatus = document.getElementById('studio-progress-status');
    this.studioProgressPct = document.getElementById('studio-progress-pct');
    this.studioOtaDropzone = document.getElementById('studio-ota-dropzone');
    this.studioOtaDropzoneText = document.getElementById('studio-ota-dropzone-text');
    this.studioOtaDropzoneSub = document.getElementById('studio-ota-dropzone-sub');
    this.studioOtaFileInput = document.getElementById('studio-ota-file-input');
    this.studioOtaFlashBtn = document.getElementById('studio-ota-flash-btn');
    this.studioOtaProgressContainer = document.getElementById('studio-ota-progress-container');
    this.studioOtaProgressBar = document.getElementById('studio-ota-progress-bar');
    this.studioOtaProgressStatus = document.getElementById('studio-ota-progress-status');
    this.studioOtaProgressPct = document.getElementById('studio-ota-progress-pct');
    this.studioTerminal = document.getElementById('studio-terminal');
    this.studioClearTermBtn = document.getElementById('studio-clear-term-btn');

    this.studioSelectedFile = null;
    this.studioSelectedOtaFile = null;

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

    // First-time running check: prompt for Gemini API Key if not configured yet
    if (!this.appSettings.apiKey && !this.appSettings.hasCompletedOnboarding) {
      this.openApiSetupModal();
    }

    this.setupBleDeviceListeners();
  }

  bindEvents() {
    // Navigation & Modal triggers
    this.btnOpenLibrary.addEventListener('click', () => this.openLibraryModal());
    this.btnUploadEpubNav.addEventListener('click', () => this.openLibraryModal());
    this.btnOpenSettings.addEventListener('click', () => this.openSettingsModal());
    this.btnRechunkBook.addEventListener('click', () => this.openRechunkModal());
    this.btnExportMarkdown.addEventListener('click', () => this.exportBookAsMarkdown());
    if (this.btnOpenEreaderStudio) {
      this.btnOpenEreaderStudio.addEventListener('click', () => this.openEreaderStudioModal());
    }
    if (this.btnOpenExportEbk) {
      this.btnOpenExportEbk.addEventListener('click', () => this.openExportEbkModal());
    }
    this.bindStudioEvents();
    if (this.ebkFormatSelect) {
      this.ebkFormatSelect.addEventListener('change', () => this.updateEbkPaginationAndPreview());
    }
    if (this.ebkSourceSelect) {
      this.ebkSourceSelect.addEventListener('change', () => this.updateEbkPaginationAndPreview());
    }
    if (this.ebkFontPreset) {
      this.ebkFontPreset.addEventListener('change', () => this.updateEbkPaginationAndPreview());
    }
    if (this.ebkBtnPrevPage) {
      this.ebkBtnPrevPage.addEventListener('click', () => this.prevEbkPreviewPage());
    }
    if (this.ebkBtnNextPage) {
      this.ebkBtnNextPage.addEventListener('click', () => this.nextEbkPreviewPage());
    }
    if (this.ebkBtnDownload) {
      this.ebkBtnDownload.addEventListener('click', () => this.generateAndDownloadEbk());
    }
    if (this.ebkBtnBleStream) {
      this.ebkBtnBleStream.addEventListener('click', () => this.syncEbkToWebBLE());
    }
    if (this.ebkBtnSerialStream) {
      this.ebkBtnSerialStream.addEventListener('click', () => this.streamEbkToWebSerial());
    }

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

    // First-Time Setup modal actions
    if (this.setupBtnTestKey) {
      this.setupBtnTestKey.addEventListener('click', () => this.testSetupApiKey());
    }
    if (this.setupBtnSaveKey) {
      this.setupBtnSaveKey.addEventListener('click', () => this.saveSetupApiKey());
    }
    if (this.setupBtnSkipDemo) {
      this.setupBtnSkipDemo.addEventListener('click', () => this.skipSetupDemo());
    }
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

  // ================= FIRST-TIME API SETUP MODAL =================

  openApiSetupModal() {
    if (this.modalApiSetup) {
      if (this.setupInputApiKey) this.setupInputApiKey.value = this.appSettings.apiKey || '';
      if (this.setupSelectModel) this.setupSelectModel.value = this.appSettings.defaultModel || 'gemini-3.8-flash';
      if (this.setupSelectLanguage) this.setupSelectLanguage.value = this.appSettings.defaultLanguage || 'en';
      this.modalApiSetup.style.display = 'flex';
    }
  }

  async testSetupApiKey() {
    const key = this.setupInputApiKey.value.trim();
    if (!key) {
      alert('Please enter your Google Gemini API key first, or click "Explore in Demo Mode".');
      return;
    }
    const model = this.setupSelectModel.value || 'gemini-3.8-flash';
    this.setupBtnTestKey.disabled = true;
    this.setupBtnTestKey.textContent = 'Testing...';
    try {
      const res = await testGeminiConnection(key, model);
      alert(res.message);
      this.showToast('Gemini connection verified successfully!', 'success');
    } catch (err) {
      alert(err.message);
      this.showToast(err.message, 'error');
    } finally {
      this.setupBtnTestKey.disabled = false;
      this.setupBtnTestKey.textContent = 'Test Connection';
    }
  }

  async saveSetupApiKey() {
    const key = this.setupInputApiKey.value.trim();
    const model = this.setupSelectModel.value || 'gemini-3.8-flash';
    const language = this.setupSelectLanguage.value || 'en';

    this.appSettings.apiKey = key;
    this.appSettings.defaultModel = model;
    this.appSettings.defaultLanguage = language;
    this.appSettings.hasCompletedOnboarding = true;

    await saveAppSettings(this.appSettings);
    this.updateHeaderModelPill();
    this.updateHeaderLanguagePill();
    this.modalApiSetup.style.display = 'none';

    if (key) {
      this.showToast('Gemini API key saved! Ready to summarize.', 'success');
    } else {
      this.showToast('Exploring in Demo / Mock Mode. Add your key anytime in Settings.', 'default');
    }
    this.renderActiveChunk();
  }

  async skipSetupDemo() {
    this.appSettings.hasCompletedOnboarding = true;
    await saveAppSettings(this.appSettings);
    this.modalApiSetup.style.display = 'none';
    this.showToast('Welcome! Exploring in Demo Mode. You can add your API key anytime via Settings (⚙️).', 'default');
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

  // ================= EBK (ESP32-S3 E-READER) GENERATION =================

  openExportEbkModal() {
    if (!this.currentBook) {
      this.showToast('Please load an EPUB book first', 'error');
      return;
    }

    this.ebkCurrentPreviewIndex = 0;
    this.modalExportEbk.style.display = 'flex';
    this.updateEbkPaginationAndPreview();
  }

  getEbkSections() {
    if (!this.currentBook) return [];
    const source = this.ebkSourceSelect ? this.ebkSourceSelect.value : 'book';
    const sections = [];

    if (source === 'book') {
      // Full EPUB book original chapters
      if (this.currentBook.rawChapters && this.currentBook.rawChapters.length > 0) {
        this.currentBook.rawChapters.forEach(ch => {
          sections.push({
            title: ch.title || `Chapter ${ch.index + 1}`,
            text: ch.text || '',
            chapterIndex: ch.index
          });
        });
      } else if (this.currentBook.chunks) {
        this.currentBook.chunks.forEach((ch, idx) => {
          sections.push({
            title: ch.title || `Section ${idx + 1}`,
            text: ch.text || ''
          });
        });
      }
    } else if (source === 'summaries') {
      // AI Chapter summaries
      const chunksWithSummary = (this.currentBook.chunks || []).filter(c => c.summary);
      if (chunksWithSummary.length === 0) {
        sections.push({
          title: this.currentBook.title || 'Summary',
          text: `No summaries have been generated yet for "${this.currentBook.title}". Run the AI generator first to export full summaries.`
        });
      } else {
        chunksWithSummary.forEach((c, idx) => {
          sections.push({
            title: c.title || `Summary ${idx + 1}`,
            text: c.summary || ''
          });
        });
      }
    } else if (source === 'current') {
      // Active section only
      const chunk = this.currentBook.chunks?.[this.activeChunkIndex];
      if (chunk) {
        sections.push({
          title: chunk.title || `Section ${this.activeChunkIndex + 1}`,
          text: chunk.summary || chunk.text || ''
        });
      }
    }

    if (sections.length === 0) {
      sections.push({
        title: this.currentBook.title || 'Empty Section',
        text: 'No text available in this selection.'
      });
    }

    return sections;
  }

  updateEbkPaginationAndPreview() {
    if (!this.currentBook) return;

    const format = this.ebkFormatSelect ? this.ebkFormatSelect.value : 'v2';
    const preset = this.ebkFontPreset ? this.ebkFontPreset.value : 'standard';
    const sections = this.getEbkSections();

    // Prepare preview pages for visual inspection on the 400x300 canvas
    this.ebkPages = paginateSectionsForEpaper(sections, { preset });
    if (this.ebkPages.length === 0) {
      this.ebkPages.push({
        sectionTitle: this.currentBook.title || 'Untitled',
        sectionPageNum: 1,
        lines: ['[No text available in this selection]'],
        fontSize: 15,
        lineHeight: 21,
        startY: 46
      });
    }

    if (this.ebkCurrentPreviewIndex >= this.ebkPages.length) {
      this.ebkCurrentPreviewIndex = 0;
    }

    const partitionMaxBytes = 6.4 * 1024 * 1024; // LittleFS partition size (~6.4 MB)

    if (format === 'v2') {
      // EBK2: 104-byte header + (chapters * 40-byte TOC) + UTF-8 text payloads
      const encoder = new TextEncoder();
      let totalPayloadBytes = 0;
      sections.forEach(s => {
        totalPayloadBytes += encoder.encode(s.text || '').length;
      });
      const totalSizeBytes = 104 + (sections.length * 40) + totalPayloadBytes;
      const sizeKb = (totalSizeBytes / 1024).toFixed(1);
      const sizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(2);
      const displaySize = totalSizeBytes > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

      this.ebkStatFrames.textContent = `${sections.length} chapter${sections.length === 1 ? '' : 's'} (reflow on ESP32)`;
      this.ebkStatSize.textContent = displaySize;

      const usedPct = ((totalSizeBytes / partitionMaxBytes) * 100).toFixed(1);
      this.ebkStatFit.textContent = `✓ Fits (${usedPct}% of 6.4MB LittleFS — fits 15+ books)`;
      this.ebkStatFit.className = 'ebk-stat-value ebk-stat-green';
      this.ebkStatFit.style.color = '';
    } else {
      // Legacy v1 Bitmap: 40-byte header + index table + 15,004 bytes per frame
      const totalFrames = this.ebkPages.length;
      const totalSizeBytes = 40 + (totalFrames * 4) + (totalFrames * 15004);
      const sizeKb = (totalSizeBytes / 1024).toFixed(1);
      const sizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(2);
      const displaySize = totalSizeBytes > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

      this.ebkStatFrames.textContent = `${totalFrames} frame${totalFrames === 1 ? '' : 's'} (pre-baked)`;
      this.ebkStatSize.textContent = displaySize;

      const usedPct = ((totalSizeBytes / partitionMaxBytes) * 100).toFixed(1);
      if (totalSizeBytes <= partitionMaxBytes) {
        this.ebkStatFit.textContent = `✓ Fits (${usedPct}% of 6.4MB LittleFS)`;
        this.ebkStatFit.className = 'ebk-stat-value ebk-stat-green';
        this.ebkStatFit.style.color = '';
      } else {
        this.ebkStatFit.textContent = `⚠ Exceeds LittleFS (${usedPct}%)`;
        this.ebkStatFit.className = 'ebk-stat-value';
        this.ebkStatFit.style.color = '#ef4444';
      }
    }

    this.renderEbkPreview();
  }

  renderEbkPreview() {
    if (!this.ebkPages || this.ebkPages.length === 0) return;
    const page = this.ebkPages[this.ebkCurrentPreviewIndex];
    const totalPages = this.ebkPages.length;

    renderPageToCanvas(
      page,
      this.ebkCurrentPreviewIndex,
      totalPages,
      this.currentBook.title,
      this.ebkPreviewCanvas
    );

    this.ebkPreviewPageIndicator.textContent = `Frame ${this.ebkCurrentPreviewIndex + 1} / ${totalPages}`;
    this.ebkPreviewPageLabel.textContent = `Frame ${this.ebkCurrentPreviewIndex + 1}`;
    this.ebkBtnPrevPage.disabled = this.ebkCurrentPreviewIndex === 0;
    this.ebkBtnNextPage.disabled = this.ebkCurrentPreviewIndex >= totalPages - 1;
  }

  prevEbkPreviewPage() {
    if (this.ebkCurrentPreviewIndex > 0) {
      this.ebkCurrentPreviewIndex--;
      this.renderEbkPreview();
    }
  }

  nextEbkPreviewPage() {
    if (this.ebkCurrentPreviewIndex < this.ebkPages.length - 1) {
      this.ebkCurrentPreviewIndex++;
      this.renderEbkPreview();
    }
  }

  async generateAndDownloadEbk() {
    if (!this.currentBook) return;
    if (this.ebkIsGenerating) return;

    const format = this.ebkFormatSelect ? this.ebkFormatSelect.value : 'v2';
    const sections = this.getEbkSections();
    if (!sections || sections.length === 0) return;

    this.ebkIsGenerating = true;
    this.ebkBtnDownload.disabled = true;
    this.ebkProgressBox.style.display = 'flex';
    this.ebkProgressFill.style.width = '0%';
    this.ebkProgressPct.textContent = '0%';

    try {
      let ebkBinary = null;

      if (format === 'v2') {
        this.ebkProgressStatus.textContent = 'Packing structured text container (EBK2)...';
        this.ebkProgressFill.style.width = '50%';
        this.ebkProgressPct.textContent = '50%';
        await new Promise(r => setTimeout(r, 30));

        ebkBinary = buildEbk2Binary({
          title: this.currentBook.title || 'Untitled Book',
          author: this.currentBook.author || 'Unknown',
          chapters: sections
        });

        this.ebkProgressFill.style.width = '100%';
        this.ebkProgressPct.textContent = '100%';
        this.ebkProgressStatus.textContent = 'Packaging complete!';
        await new Promise(r => setTimeout(r, 20));
      } else {
        // v1 Bitmap frame generation
        this.ebkProgressStatus.textContent = 'Rendering 1-bit frames...';

        const scratchCanvas = document.createElement('canvas');
        scratchCanvas.width = 400;
        scratchCanvas.height = 300;
        const frameBuffers = [];
        const totalFrames = this.ebkPages.length;

        for (let i = 0; i < totalFrames; i++) {
          const page = this.ebkPages[i];
          renderPageToCanvas(page, i, totalFrames, this.currentBook.title, scratchCanvas);
          const frameBuffer = canvasTo1BitFrameBuffer(scratchCanvas);
          frameBuffers.push(frameBuffer);

          const pct = Math.floor(((i + 1) / totalFrames) * 100);
          this.ebkProgressFill.style.width = `${pct}%`;
          this.ebkProgressPct.textContent = `${pct}%`;
          this.ebkProgressStatus.textContent = `Frame ${i + 1} of ${totalFrames}...`;

          if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }

        this.ebkProgressStatus.textContent = 'Packing binary container (.ebk)...';
        await new Promise(r => setTimeout(r, 20));

        const fontPreset = this.ebkFontPreset ? this.ebkFontPreset.value : 'standard';
        const fontId = EBK_CONFIG.FONT_PRESETS[fontPreset]?.fontId || 0x0010;
        ebkBinary = buildEbkBinary(this.currentBook.title, frameBuffers, fontId);
      }

      const filename = `${(this.currentBook.title || 'book').replace(/[^a-z0-9]/gi, '_')}.ebk`;
      downloadEbkBlob(ebkBinary, filename);

      const formatLabel = format === 'v2' ? 'v2 Structured Text' : 'v1 Bitmap';
      this.showToast(`Exported "${filename}" (${formatLabel}, ${(ebkBinary.length / 1024).toFixed(1)} KB) successfully!`, 'success');
      this.modalExportEbk.style.display = 'none';
    } catch (err) {
      console.error('[EBK Export Error]', err);
      this.showToast(`EBK export failed: ${err.message}`, 'error');
    } finally {
      this.ebkIsGenerating = false;
      this.ebkBtnDownload.disabled = false;
      this.ebkProgressBox.style.display = 'none';
    }
  }

  async syncEbkToWebBLE() {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is only supported in Chrome, Edge, Opera, or Bluefy (iOS) over HTTPS or localhost.');
      return;
    }
    if (!this.currentBook) return;
    if (this.ebkIsGenerating) return;

    const format = this.ebkFormatSelect ? this.ebkFormatSelect.value : 'v2';
    const sections = this.getEbkSections();
    if (!sections || sections.length === 0) return;

    try {
      this.ebkIsGenerating = true;
      if (this.ebkBtnBleStream) this.ebkBtnBleStream.disabled = true;
      if (this.ebkBtnSerialStream) this.ebkBtnSerialStream.disabled = true;
      if (this.ebkBtnDownload) this.ebkBtnDownload.disabled = true;
      this.ebkProgressBox.style.display = 'flex';
      this.ebkProgressStatus.textContent = 'Preparing .ebk container for e-reader...';
      this.ebkProgressFill.style.width = '10%';
      this.ebkProgressPct.textContent = '10%';

      let ebkBinary = null;

      if (format === 'v2') {
        ebkBinary = buildEbk2Binary({
          title: this.currentBook.title || 'Untitled Book',
          author: this.currentBook.author || 'Unknown',
          chapters: sections
        });
      } else {
        const scratchCanvas = document.createElement('canvas');
        scratchCanvas.width = 400;
        scratchCanvas.height = 300;
        const frameBuffers = [];
        const totalFrames = this.ebkPages.length;

        for (let i = 0; i < totalFrames; i++) {
          renderPageToCanvas(this.ebkPages[i], i, totalFrames, this.currentBook.title, scratchCanvas);
          frameBuffers.push(canvasTo1BitFrameBuffer(scratchCanvas));
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }

        const fontPreset = this.ebkFontPreset ? this.ebkFontPreset.value : 'standard';
        const fontId = EBK_CONFIG.FONT_PRESETS[fontPreset]?.fontId || 0x0010;
        ebkBinary = buildEbkBinary(this.currentBook.title, frameBuffers, fontId);
      }

      const bookTitle = (this.currentBook.title || 'book').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const filename = `${bookTitle}.ebk`;

      this.ebkProgressStatus.textContent = 'Pairing with ESP32-Ereader over Bluetooth...';
      this.showToast('Select "ESP32-Ereader" in the Bluetooth dialog (make sure BLE pairing countdown is active on device)', 'default');

      const result = await streamEbkOverBLE(ebkBinary, filename, (pct, sent, total) => {
        this.ebkProgressFill.style.width = `${pct}%`;
        this.ebkProgressPct.textContent = `${pct}%`;
        this.ebkProgressStatus.textContent = `Streaming via BLE: ${Math.round(sent / 1024)} / ${Math.round(total / 1024)} KB (${pct}%)`;
      });

      this.showToast(`Wirelessly synced "${result.filename}" (${Math.round(result.bytes / 1024)} KB) over BLE!`, 'success');
      this.ebkProgressStatus.textContent = 'Sync complete! E-Reader is opening book.';
      this.ebkProgressFill.style.width = '100%';
      this.ebkProgressPct.textContent = '100%';
    } catch (err) {
      if (err.name !== 'NotFoundError') { // User didn't just cancel Bluetooth dialog
        console.error('[Web BLE Error]', err);
        this.showToast(`Web BLE sync failed: ${err.message}`, 'error');
      }
    } finally {
      this.ebkIsGenerating = false;
      if (this.ebkBtnBleStream) this.ebkBtnBleStream.disabled = false;
      if (this.ebkBtnSerialStream) this.ebkBtnSerialStream.disabled = false;
      if (this.ebkBtnDownload) this.ebkBtnDownload.disabled = false;
      setTimeout(() => {
        if (!this.ebkIsGenerating) {
          this.ebkProgressBox.style.display = 'none';
        }
      }, 1800);
    }
  }

  async streamEbkToWebSerial() {
    if (!('serial' in navigator)) {
      alert('Web Serial is only supported in Chrome, Edge, and Opera browsers over HTTPS or localhost.');
      return;
    }
    if (!this.currentBook) return;
    if (this.ebkIsGenerating) return;

    const format = this.ebkFormatSelect ? this.ebkFormatSelect.value : 'v2';
    const sections = this.getEbkSections();
    if (!sections || sections.length === 0) return;

    let port = null;
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      this.ebkIsGenerating = true;
      this.ebkBtnSerialStream.disabled = true;
      this.ebkProgressBox.style.display = 'flex';
      this.ebkProgressStatus.textContent = 'Preparing binary container...';
      this.ebkProgressFill.style.width = '10%';
      this.ebkProgressPct.textContent = '10%';

      let ebkBinary = null;

      if (format === 'v2') {
        ebkBinary = buildEbk2Binary({
          title: this.currentBook.title || 'Untitled Book',
          author: this.currentBook.author || 'Unknown',
          chapters: sections
        });
      } else {
        const scratchCanvas = document.createElement('canvas');
        scratchCanvas.width = 400;
        scratchCanvas.height = 300;
        const frameBuffers = [];
        const totalFrames = this.ebkPages.length;

        for (let i = 0; i < totalFrames; i++) {
          renderPageToCanvas(this.ebkPages[i], i, totalFrames, this.currentBook.title, scratchCanvas);
          frameBuffers.push(canvasTo1BitFrameBuffer(scratchCanvas));
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }

        const fontPreset = this.ebkFontPreset ? this.ebkFontPreset.value : 'standard';
        const fontId = EBK_CONFIG.FONT_PRESETS[fontPreset]?.fontId || 0x0010;
        ebkBinary = buildEbkBinary(this.currentBook.title, frameBuffers, fontId);
      }

      this.ebkProgressStatus.textContent = 'Streaming to XIAO ESP32-S3 LittleFS...';
      await streamEbkOverSerial(port, ebkBinary, (pct, sent, total) => {
        this.ebkProgressFill.style.width = `${pct}%`;
        this.ebkProgressPct.textContent = `${pct}%`;
        this.ebkProgressStatus.textContent = `Streaming: ${Math.round(sent / 1024)} / ${Math.round(total / 1024)} KB (${pct}%)`;
      });

      this.showToast(`Streamed ${ebkBinary.length} bytes directly to ESP32-S3!`, 'success');
    } catch (err) {
      if (err.name !== 'NotFoundError') { // User didn't just cancel port selection
        console.error('[Web Serial Error]', err);
        this.showToast(`Web Serial upload failed: ${err.message}`, 'error');
      }
    } finally {
      if (port) {
        try {
          await port.close();
        } catch (_) {}
      }
      this.ebkIsGenerating = false;
      this.ebkBtnSerialStream.disabled = false;
      this.ebkProgressBox.style.display = 'none';
    }
  }

  // ================= E-READER STUDIO IMPLEMENTATION =================

  setupBleDeviceListeners() {
    bleDeviceManager.on('stateChange', ({ connected, type }) => {
      this.updateStudioConnectionUI(connected, type);
    });

    bleDeviceManager.on('log', ({ message, color }) => {
      this.appendStudioLog(message, color);
    });

    bleDeviceManager.on('libraryUpdate', (data) => {
      this.renderStudioLibrary(data);
    });

    bleDeviceManager.on('progress', ({ type, status, pct }) => {
      this.updateStudioProgress(type, status, pct);
    });
  }

  openEreaderStudioModal() {
    if (!this.modalEreaderStudio) return;
    this.modalEreaderStudio.style.display = 'flex';

    // If already connected, auto-refresh device storage and library
    if (bleDeviceManager.isConnected() && bleDeviceManager.getConnectionType() === 'ble') {
      bleDeviceManager.requestBookList().catch(() => {});
    }
  }

  bindStudioEvents() {
    if (!this.studioTabBle) return;

    // Tabs
    this.studioTabBle.addEventListener('click', () => {
      bleDeviceManager.activeMode = 'ble';
      this.studioTabBle.classList.add('active');
      this.studioTabSerial.classList.remove('active');
      this.studioPanelBle.style.display = 'block';
      this.studioPanelSerial.style.display = 'none';
      this.checkStudioUploadReady();
    });

    this.studioTabSerial.addEventListener('click', () => {
      bleDeviceManager.activeMode = 'serial';
      this.studioTabSerial.classList.add('active');
      this.studioTabBle.classList.remove('active');
      this.studioPanelSerial.style.display = 'block';
      this.studioPanelBle.style.display = 'none';
      this.checkStudioUploadReady();
    });

    // BLE Connect / Disconnect
    this.studioBleConnectBtn.addEventListener('click', async () => {
      try {
        await bleDeviceManager.connectBLE();
        this.showToast('Paired successfully with ESP32-Ereader over BLE!', 'success');
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          this.showToast(`BLE Connection Failed: ${err.message}`, 'error');
        }
      }
    });

    this.studioBleDisconnectBtn.addEventListener('click', () => {
      bleDeviceManager.disconnectBLE();
      this.showToast('Disconnected from BLE E-Reader.', 'default');
    });

    // Serial Connect / Disconnect
    this.studioSerialConnectBtn.addEventListener('click', async () => {
      try {
        await bleDeviceManager.connectSerial();
        this.showToast('Connected to USB Serial port!', 'success');
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          this.showToast(`Serial Connection Failed: ${err.message}`, 'error');
        }
      }
    });

    this.studioSerialDisconnectBtn.addEventListener('click', async () => {
      await bleDeviceManager.disconnectSerial();
      this.showToast('Disconnected from serial port.', 'default');
    });

    // Refresh Library button
    this.studioRefreshBooksBtn.addEventListener('click', async () => {
      try {
        await bleDeviceManager.requestBookList();
      } catch (err) {
        this.showToast(`Failed to refresh library: ${err.message}`, 'error');
      }
    });

    // Sync currently loaded book
    this.studioSyncActiveBtn.addEventListener('click', () => {
      this.syncActiveBookToEreader();
    });

    // File Drag & Drop for .ebk
    this.studioDropzone.addEventListener('click', () => this.studioFileInput.click());
    this.studioFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.handleStudioFile(e.target.files[0]);
    });
    this.studioDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.studioDropzone.style.borderColor = 'var(--accent-cyan)';
    });
    this.studioDropzone.addEventListener('dragleave', () => {
      this.studioDropzone.style.borderColor = 'var(--border)';
    });
    this.studioDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.studioDropzone.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files.length > 0) this.handleStudioFile(e.dataTransfer.files[0]);
    });

    this.studioUploadBtn.addEventListener('click', () => {
      this.uploadStudioSelectedFile();
    });

    // OTA File Drag & Drop for firmware.bin
    this.studioOtaDropzone.addEventListener('click', () => this.studioOtaFileInput.click());
    this.studioOtaFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.handleStudioOtaFile(e.target.files[0]);
    });
    this.studioOtaDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.studioOtaDropzone.style.borderColor = '#c084fc';
    });
    this.studioOtaDropzone.addEventListener('dragleave', () => {
      this.studioOtaDropzone.style.borderColor = 'rgba(192, 132, 252, 0.4)';
    });
    this.studioOtaDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.studioOtaDropzone.style.borderColor = 'rgba(192, 132, 252, 0.4)';
      if (e.dataTransfer.files.length > 0) this.handleStudioOtaFile(e.dataTransfer.files[0]);
    });

    this.studioOtaFlashBtn.addEventListener('click', () => {
      this.flashStudioOtaFile();
    });

    // Terminal clear
    this.studioClearTermBtn.addEventListener('click', () => {
      this.studioTerminal.innerHTML = '';
    });
  }

  handleStudioFile(file) {
    if (!file.name.toLowerCase().endsWith('.ebk')) {
      alert('Please choose an .ebk book container file.');
      return;
    }
    this.studioSelectedFile = file;
    this.studioDropzone.classList.add('has-file');
    this.studioDropzoneText.textContent = `Selected: ${file.name}`;
    this.studioDropzoneSub.textContent = `File Size: ${(file.size / 1024).toFixed(1)} KB (${file.size.toLocaleString()} bytes)`;
    bleDeviceManager.log(`[FILE] Loaded book container '${file.name}' (${(file.size / 1024).toFixed(1)} KB).`);
    this.checkStudioUploadReady();
  }

  handleStudioOtaFile(file) {
    if (!file.name.toLowerCase().endsWith('.bin')) {
      alert('Please select a compiled firmware .bin binary (e.g. from .pio/build/seeed_xiao_esp32s3/firmware.bin).');
      return;
    }
    if (file.size > 1835008) {
      alert(`File is too large for the OTA partition! Size: ${(file.size / 1024).toFixed(0)} KB (max 1792 KB).`);
      return;
    }
    this.studioSelectedOtaFile = file;
    this.studioOtaDropzone.classList.add('has-file');
    this.studioOtaDropzoneText.textContent = `Selected Firmware: ${file.name}`;
    this.studioOtaDropzoneSub.textContent = `Binary Size: ${(file.size / 1024).toFixed(1)} KB (${file.size.toLocaleString()} bytes)`;
    bleDeviceManager.log(`[OTA FILE] Loaded firmware '${file.name}' (${(file.size / 1024).toFixed(1)} KB).`, '#c084fc');
    this.checkStudioUploadReady();
  }

  checkStudioUploadReady() {
    const isConnected = bleDeviceManager.isConnected();
    const isTransferring = bleDeviceManager.isTransferring || bleDeviceManager.isFlashingOta;

    if (this.studioUploadBtn) {
      this.studioUploadBtn.disabled = !isConnected || !this.studioSelectedFile || isTransferring;
    }
    if (this.studioSyncActiveBtn) {
      this.studioSyncActiveBtn.disabled = !isConnected || !this.currentBook || isTransferring;
    }
    if (this.studioOtaFlashBtn) {
      this.studioOtaFlashBtn.disabled = !(bleDeviceManager.bleServer && bleDeviceManager.bleServer.connected) || !this.studioSelectedOtaFile || isTransferring;
    }
  }

  updateStudioConnectionUI(connected, type) {
    if (!this.studioConnectionStatus) return;

    this.studioConnectionStatus.className = 'studio-badge';
    const label = this.studioConnectionStatus.querySelector('span:last-child');

    if (connected) {
      if (type === 'ble') {
        this.studioConnectionStatus.classList.add('connected-ble');
        label.textContent = 'BLE Connected (ESP32-Ereader)';
        this.studioBleConnectBtn.disabled = true;
        this.studioBleDisconnectBtn.disabled = false;
        this.studioRefreshBooksBtn.disabled = false;
      } else {
        this.studioConnectionStatus.classList.add('connected-serial');
        label.textContent = 'USB Serial Connected';
        this.studioSerialConnectBtn.disabled = true;
        this.studioSerialDisconnectBtn.disabled = false;
        this.studioRefreshBooksBtn.disabled = true;
      }
    } else {
      label.textContent = 'Disconnected';
      this.studioBleConnectBtn.disabled = false;
      this.studioBleDisconnectBtn.disabled = true;
      this.studioSerialConnectBtn.disabled = false;
      this.studioSerialDisconnectBtn.disabled = true;
      this.studioRefreshBooksBtn.disabled = true;
    }

    this.checkStudioUploadReady();
  }

  renderStudioLibrary(data) {
    if (!this.studioBooksTbody) return;

    if (!data) {
      this.studioBooksEmpty.style.display = 'block';
      this.studioBooksEmpty.textContent = 'Connect to your E-Reader via BLE to view and manage books stored on the device.';
      this.studioBooksTableWrapper.style.display = 'none';
      this.studioBookCountBadge.textContent = '0 Books';
      this.studioStorageText.textContent = '-- / -- MB used (--%)';
      this.studioStorageBar.style.width = '0%';
      return;
    }

    // Update storage bar
    const totalBytes = data.total || 0;
    const usedBytes = data.used || 0;
    if (totalBytes > 0) {
      const usedMB = (usedBytes / 1048576).toFixed(2);
      const totalMB = (totalBytes / 1048576).toFixed(2);
      const pct = Math.min(100, Math.round((usedBytes / totalBytes) * 100));
      this.studioStorageText.textContent = `${usedMB} / ${totalMB} MB used (${pct}%)`;
      this.studioStorageBar.style.width = `${pct}%`;
    }

    const books = data.books || [];
    this.studioBookCountBadge.textContent = `${books.length} Book${books.length === 1 ? '' : 's'}`;

    if (books.length === 0) {
      this.studioBooksEmpty.style.display = 'block';
      this.studioBooksEmpty.textContent = 'No .ebk books found on LittleFS flash storage. Upload a book below to begin reading!';
      this.studioBooksTableWrapper.style.display = 'none';
      return;
    }

    this.studioBooksEmpty.style.display = 'none';
    this.studioBooksTableWrapper.style.display = 'block';
    this.studioBooksTbody.innerHTML = '';

    const activePath = data.active || '';

    books.forEach(b => {
      const tr = document.createElement('tr');
      const isActive = (b.file === activePath || (b.file && activePath.endsWith(b.file)));

      // Title & filename
      const tdTitle = document.createElement('td');
      const titleRow = document.createElement('div');
      titleRow.style.fontWeight = '600';
      titleRow.style.display = 'flex';
      titleRow.style.alignItems = 'center';
      titleRow.style.gap = '6px';
      titleRow.textContent = b.title || b.file;

      if (isActive) {
        const pill = document.createElement('span');
        pill.style.cssText = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;';
        pill.textContent = 'Active';
        titleRow.appendChild(pill);
      }

      const fnameRow = document.createElement('div');
      fnameRow.style.cssText = 'font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px;';
      fnameRow.textContent = b.file;

      tdTitle.appendChild(titleRow);
      tdTitle.appendChild(fnameRow);

      // Size
      const tdSize = document.createElement('td');
      tdSize.style.fontFamily = 'var(--font-mono)';
      tdSize.textContent = (b.size >= 1048576) ? `${(b.size / 1048576).toFixed(2)} MB` : `${(b.size / 1024).toFixed(1)} KB`;

      // Progress
      const tdProg = document.createElement('td');
      tdProg.style.fontFamily = 'var(--font-mono)';
      if (b.fmt === 2 && b.chs > 0) {
        // v2 text book: chapter N of M and percent through the current chapter
        tdProg.textContent = `Ch. ${b.ch} / ${b.chs} · ${b.pct}%`;
        if (b.ctitle) tdProg.title = b.ctitle;
      } else if (b.tot > 0) {
        const progPct = Math.round((Math.max(1, b.cur) / b.tot) * 100);
        tdProg.textContent = `Page ${b.cur || 1} / ${b.tot} (${progPct}%)`;
      } else {
        tdProg.textContent = 'New';
      }

      // Actions
      const tdActions = document.createElement('td');
      const actionsDiv = document.createElement('div');
      actionsDiv.style.cssText = 'display: flex; justify-content: flex-end; gap: 6px; align-items: center;';

      if (!isActive) {
        const btnRead = document.createElement('button');
        btnRead.className = 'btn-ghost';
        btnRead.style.cssText = 'padding: 3px 8px; font-size: 11px; color: var(--accent-cyan); border-color: rgba(56, 189, 248, 0.3);';
        btnRead.textContent = 'Read';
        btnRead.addEventListener('click', async () => {
          try {
            await bleDeviceManager.selectActiveBook(b.file);
            this.showToast(`Switched active book to "${b.title || b.file}"!`, 'success');
          } catch (err) {
            this.showToast(`Failed to switch book: ${err.message}`, 'error');
          }
        });
        actionsDiv.appendChild(btnRead);
      }

      const btnRename = document.createElement('button');
      btnRename.className = 'btn-ghost';
      btnRename.style.cssText = 'padding: 3px 8px; font-size: 11px; color: #cbd5e1;';
      btnRename.textContent = 'Rename';
      btnRename.addEventListener('click', async () => {
        const cleanOld = b.file.startsWith('/') ? b.file.substring(1) : b.file;
        const newName = prompt(`Enter new filename for "${cleanOld}":`, cleanOld);
        if (!newName || newName.trim() === '' || newName.trim() === cleanOld) return;
        try {
          await bleDeviceManager.renameBook(b.file, newName);
          this.showToast(`Book renamed to "${newName}"!`, 'success');
        } catch (err) {
          this.showToast(`Failed to rename book: ${err.message}`, 'error');
        }
      });
      actionsDiv.appendChild(btnRename);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-ghost';
      btnDelete.style.cssText = 'padding: 3px 8px; font-size: 11px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);';
      btnDelete.textContent = 'Delete';
      btnDelete.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to permanently delete "${b.file}" from E-Reader storage?`)) return;
        try {
          await bleDeviceManager.deleteBook(b.file);
          this.showToast(`Deleted "${b.file}" from E-Reader!`, 'success');
        } catch (err) {
          this.showToast(`Failed to delete book: ${err.message}`, 'error');
        }
      });
      actionsDiv.appendChild(btnDelete);

      tdActions.appendChild(actionsDiv);

      tr.appendChild(tdTitle);
      tr.appendChild(tdSize);
      tr.appendChild(tdProg);
      tr.appendChild(tdActions);
      this.studioBooksTbody.appendChild(tr);
    });
  }

  async syncActiveBookToEreader() {
    if (!this.currentBook) return;

    try {
      this.studioProgressContainer.style.display = 'block';
      this.studioProgressStatus.textContent = 'Building .ebk v2 structured container...';
      this.studioProgressBar.style.width = '10%';
      this.studioProgressPct.textContent = '10%';

      const sections = this.getEbkSections();
      const ebkBinary = buildEbk2Binary({
        title: this.currentBook.title || 'Untitled Book',
        author: this.currentBook.author || 'Unknown',
        chapters: sections
      });

      const bookTitle = (this.currentBook.title || 'book').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const filename = `${bookTitle}.ebk`;

      if (bleDeviceManager.activeMode === 'ble') {
        if (!bleDeviceManager.isConnected() || bleDeviceManager.getConnectionType() !== 'ble') {
          await bleDeviceManager.connectBLE();
        }
        await bleDeviceManager.uploadBookBLE(ebkBinary, filename);
      } else {
        if (!bleDeviceManager.isConnected() || bleDeviceManager.getConnectionType() !== 'serial') {
          await bleDeviceManager.connectSerial();
        }
        await bleDeviceManager.uploadBookSerial(ebkBinary);
      }

      this.showToast(`Book "${filename}" successfully synced to your E-Reader!`, 'success');
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        this.showToast(`Sync failed: ${err.message}`, 'error');
      }
    } finally {
      this.checkStudioUploadReady();
      setTimeout(() => {
        if (!bleDeviceManager.isTransferring) {
          this.studioProgressContainer.style.display = 'none';
        }
      }, 2000);
    }
  }

  async uploadStudioSelectedFile() {
    if (!this.studioSelectedFile) return;

    try {
      this.studioProgressContainer.style.display = 'block';

      if (bleDeviceManager.activeMode === 'ble') {
        await bleDeviceManager.uploadBookBLE(this.studioSelectedFile, this.studioSelectedFile.name);
      } else {
        await bleDeviceManager.uploadBookSerial(this.studioSelectedFile);
      }

      this.showToast(`Successfully uploaded "${this.studioSelectedFile.name}" to E-Reader!`, 'success');
    } catch (err) {
      this.showToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      this.checkStudioUploadReady();
      setTimeout(() => {
        if (!bleDeviceManager.isTransferring) {
          this.studioProgressContainer.style.display = 'none';
        }
      }, 2000);
    }
  }

  async flashStudioOtaFile() {
    if (!this.studioSelectedOtaFile) return;

    if (!confirm(`Flash firmware "${this.studioSelectedOtaFile.name}" to your ESP32-S3 over BLE? The e-reader will verify checksum and reboot automatically.`)) {
      return;
    }

    try {
      this.studioOtaProgressContainer.style.display = 'block';
      await bleDeviceManager.flashFirmwareBLE(this.studioSelectedOtaFile, this.studioSelectedOtaFile.name);
      this.showToast('Firmware update complete! E-Reader is rebooting...', 'success');
    } catch (err) {
      this.showToast(`OTA Update failed: ${err.message}`, 'error');
    } finally {
      this.checkStudioUploadReady();
    }
  }

  appendStudioLog(message, color = '') {
    if (!this.studioTerminal) return;
    const entry = document.createElement('div');
    entry.style.marginBottom = '2px';
    if (color) entry.style.color = color;
    entry.textContent = message;
    this.studioTerminal.appendChild(entry);
    this.studioTerminal.scrollTop = this.studioTerminal.scrollHeight;
  }

  updateStudioProgress(type, status, pct) {
    if (type === 'ota') {
      if (this.studioOtaProgressContainer) this.studioOtaProgressContainer.style.display = 'block';
      if (this.studioOtaProgressStatus) this.studioOtaProgressStatus.textContent = status;
      if (this.studioOtaProgressBar) this.studioOtaProgressBar.style.width = `${pct}%`;
      if (this.studioOtaProgressPct) this.studioOtaProgressPct.textContent = `${pct}%`;
    } else {
      if (this.studioProgressContainer) this.studioProgressContainer.style.display = 'block';
      if (this.studioProgressStatus) this.studioProgressStatus.textContent = status;
      if (this.studioProgressBar) this.studioProgressBar.style.width = `${pct}%`;
      if (this.studioProgressPct) this.studioProgressPct.textContent = `${pct}%`;
    }
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
