# LuminaEPUB — AI Literary Companion & Chapter Summarizer

A modern, client-side web application designed to upload EPUB books, store your entire library and generated summaries locally in **IndexedDB**, and generate in-depth literary analyses **one chapter at a time** using **Gemini 3.8 Flash**, **Gemini 3.7 Flash**, and **Gemini 3.5 Flash-Lite**.

---

## ✨ Features

- **Local EPUB Library (IndexedDB)**:
  - Drag-and-drop or select any `.epub` file. Parsed 100% in your browser using `JSZip` and DOMParser.
  - Multi-book support: Switch between books anytime without losing previously generated summaries.
  - Preloaded with H.G. Wells' *The Time Machine* for instant testing.
- **Controlled 1-at-a-Time Generation**:
  - Strictly avoids model output limits by generating one chapter at a time.
  - No runaway auto-loops: Step through chapters via **Generate Next Section (1-by-1)** or **Generate This Section Now**.
  - **Stop Generation** button to instantly abort in-flight requests using `AbortController`.
- **Gemini 3 Series Models**:
  - `gemini-3.8-flash` (Recommended for nuanced literary reasoning)
  - `gemini-3.7-flash` (Workhorse for long-horizon document comprehension)
  - `gemini-3.5-flash-lite` (Ultra-fast, cost-efficient)
  - Built-in Mock/Demo mode works immediately even without an API key.
- **Multi-Language Output (UI in English)**:
  - Supports summaries in **English**, **French**, **Spanish**, **Chinese (Simplified & Traditional)**, **German**, **Japanese**, **Portuguese**, **Italian**, **Russian**, **Korean**, and **Arabic**.
  - UI buttons and navigation remain strictly in English.
- **Chapter Chunking & Brevity Presets**:
  - Group chapters (1, 2, 3, etc. per chunk).
  - Brevity presets: *Ultra-Compressed (Executive)* (~200w), *Short & Punchy* (~400w), *Standard / Balanced* (~700w), *In-Depth Literary Guide* (~1,200w), and *Exhaustive* (~1,800+w).
- **Single-Section Regeneration**:
  - Fine-tune specific chapters with custom focus lenses (*Character Psychology*, *Philosophical & Thematic*, *Actionable Rules*, *Plot Mechanics*, *World-Building*) or custom freeform prompts.
- **Split Reader & Companion Guide Export**:
  - Side-by-side reading of original EPUB text alongside the AI breakdown.
  - Export the complete companion guide as a clean Markdown file (`.md`).

---

## 🚀 GitHub Pages Deployment

This project is configured out-of-the-box for **GitHub Pages**:
- `vite.config.js` sets `base: './'`, ensuring all assets load with relative paths regardless of repository name or subpath.
- An automated GitHub Actions workflow is included at `.github/workflows/deploy.yml`.

### How to Deploy:
1. Push this repository to GitHub.
2. In your GitHub repository, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. That's it! Every push to `main` (or manual trigger in the Actions tab) will automatically build and deploy your live site.

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```
