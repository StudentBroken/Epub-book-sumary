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
- **ESP32-S3 4.2" E-Paper Reader Export (`.ebk`) & BLE Studio**:
  - Directly generates the custom binary container format (`.ebk` v1 bitmaps and v2 reflowable text) for the **Seeed Studio XIAO ESP32-S3** and 4.2" ESL e-paper reader (SSD1619, 400x300, 1-bit monochrome).
  - Paginates original EPUB book text or AI summaries into discrete 400x300 frames with chapter header rules, margins, and page numbers.
  - Interactive 400x300 e-paper preview modal with page flipping before downloading or streaming.
  - **Wireless Web Bluetooth (BLE) Sync**: One-click wireless sync directly into the e-reader's LittleFS flash storage (`ESP32-Ereader` GATT service `19b10000...`).
  - **Web Serial USB-C Upload**: Fast fallback streaming via USB Serial modem (115200 baud).
  - **Built-in E-Reader Studio (`/ble.html`)**: Complete device manager with flash partition storage meter, book library table (read active book, rename, delete), wireless firmware OTA flashing (`firmware.bin`), and real-time terminal diagnostics.

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

## 🖼️ Colour Screensaver & WiFi (E-Reader)

Three pieces, all in this project plus the firmware's `tools/screensaver/apps_script.gs`:

1. **Converter (`/screensaver.html`)**: drop ~100 pictures (download from Drive first), it fits them to 300×400 portrait, dithers to white/black/red, packs 2 bits per pixel (SSI v1), splits each image into 13 CRC-protected rows (header, 10 data chunks, XOR parity, header copy) and exports `screensaver_sheet.csv`.
2. **Google Sheet + Apps Script**: import the CSV into a tab named `Images`, paste `apps_script.gs`, set `SECRET`, deploy as a web app (execute as you, anyone with the link).
3. **E-Reader Studio (`/ble.html`) → "WiFi & Colour Screensaver" card**: while the device is in BLE upload mode, save up to 4 WiFi networks, the web app URL (`.../exec?k=SECRET`) and the screensaver toggle.

The device then wakes every 12 h, syncs 14 random images weekly (4 attempts max) and shows one new image per day after the Zzz screen.
