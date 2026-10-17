<p align="center">
  <img src="icons/128.png" width="96" height="96" alt="Luma Translate icon">
</p>
<h1 align="center">Luma Translate</h1>
<p align="center">Read across languages. Stay in context.</p>
<p align="center">Bilingual web pages · Image OCR · Context-aware subtitles</p>
<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> ·
  <a href="LICENSE">Apache-2.0</a> · <a href="https://github.com/JelionNg/luma-translate/issues">Feedback</a>
</p>

---

**Your browser, your translation service.** Luma Translate brings bilingual web reading, image translation with local OCR, and context-aware video subtitles to desktop Chrome and Edge. Bring your own API key.

Version **0.30.0** · Manifest V3 · Install from source; not yet available in extension stores.

## Features

- Translate web pages, selected text, or individual paragraphs. Switch between bilingual and translation-only views, with a floating button, progress indicators, and paragraph diagnostics.
- Viewport-first scheduling, batching, bounded concurrency, caching, and support for dynamic pages and SPA navigation.
- Site adaptations for GitHub, Reddit, Hugging Face, and others, with importable and exportable custom rules.
- Local PP-OCRv6 image recognition, positioned translation overlays, and original/translated comparison. Works with uploaded images and accessible web images.
- Existing video subtitle extraction, contextual translation, prefetching, and full-transcript TXT export. Supports selected subtitle paths on YouTube, Reddit, Bilibili, and other sites.
- OpenAI-compatible Chat Completions endpoints, multiple service profiles, glossaries, and target-language selection.

## Installation

1. Download and extract this repository, or run:

   ```sh
   git clone https://github.com/JelionNg/luma-translate.git
   cd luma-translate
   ```

2. For image translation, run the following from the repository directory:

   ```sh
   python3 scripts/setup-ocr-assets.py
   ```

   This downloads about 45 MB of pinned models and runtime assets and verifies their hashes. It does not install system software. Web page and subtitle translation do not require these assets.

3. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
4. Choose **Load unpacked** and select the repository directory containing `manifest.json`.
5. Open the extension settings, enter your endpoint, API key, and an available model, then save and enable the service.
6. Refresh a web page and click the floating button to translate. Click again to restore the original.

The default configuration targets DeepSeek. Change the model in settings to one supported by your provider. Downloading OCR assets requires an internet connection; afterward, OCR runs locally in the browser. Text translation still requires your configured API.

## PDF reader

Open **PDF 对照阅读** from the extension popup and choose a PDF. Click **翻译可见页** to translate visible pages as you scroll. The original is on the left; hover or focus a translated paragraph on the right to highlight its source lines. Use **暂停** to stop translation. Parsing runs in your browser; extracted text is sent to your configured translation API. The right pane reflows text for reading rather than reproducing the original PDF layout.

## Usage

| Action | How |
| --- | --- |
| Start / cancel page translation | Floating button or `Alt+A` |
| Translate selection / inspect a paragraph | Select text and press `Alt+T`; without a selection, enter paragraph selection |
| Translate a web image | Hover over the image and use its translation button |
| Image recognition | Use the image tool in the extension popup for uploads, or hover over a web image |
| Translate video subtitles | Use the in-player translation button; enable native captions when required by the site |
| Export a translated transcript | Use full-transcript translation and TXT export in the video tools |

After updating the source, reload the extension and refresh open pages.

## Privacy and data

OCR runs locally. Recognized text, web page text, subtitles, and related context are sent to the translation service you configure. This project does not operate a translation proxy server.

Settings and caches use browser storage. The active API key is stored in `chrome.storage.sync` and may sync through your browser account; service profiles and backups also use local extension storage. See [PRIVACY.md](PRIVACY.md) for details.

## Limitations

- Video translation requires accessible subtitles; speech recognition for videos without subtitles is not included.
- PDF side-by-side reading supports text-based files with paragraph translation and linked source highlighting. Scanned pages and complex tables/formulas are not yet supported. Closed components, protected media, authenticated images, and some manga pages may be inaccessible.
- OCR can struggle with curved or vertical text, small dense text, and complex backgrounds. Translation overlays do not perform generative background restoration.
- Website changes can break adaptations. Speed and accuracy depend on your provider, network, and device. Not every site or video is supported.

## Project structure

```text
manifest.json     Extension entry point
src/
  background/     API requests and task scheduling
  web/            Web page reading and site rules
  image/          Image translation and overlays
  video/          Subtitle extraction and translation
  shared/         Shared configuration and utilities
  ui/             Popup, settings and diagnostics
ocr/              Local OCR engine and asset manifest
icons/            Extension icons
tests/            Regression tests
scripts/          Asset setup and maintenance
```

Load the repository root as the unpacked extension; `src/` is not a separate extension.

## Development and verification

Runtime code needs no bundling. Run the basic tests with:

```sh
node --test tests/background.test.cjs
```

Browser integration tests require Playwright and desktop Chrome. Some currently use the macOS Chrome path; OCR tests also require model assets and the system tools used by those tests. Test output goes into the ignored `analysis/` directory. Mock API results do not measure real service latency.

After changing video rules, run `node scripts/sync-video-rules.cjs` to synchronize the MAIN-world rules file.

## License

Project code is licensed under [Apache-2.0](LICENSE). Third-party models, the character dictionary, and ONNX Runtime retain their upstream licenses. See [third-party notices](ocr/THIRD_PARTY_NOTICES.md) and the [asset manifest](ocr/assets-manifest.json). This project is not affiliated with or endorsed by Immersive Translate.
