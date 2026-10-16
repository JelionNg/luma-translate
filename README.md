<p align="center">
  <img src="icons/128.png" width="96" height="96" alt="Luma Translate icon">
</p>
<h1 align="center">Luma Translate</h1>
<p align="center">
  Read across languages. Stay in context.<br>
  跨越语言，读懂上下文。
</p>
<p align="center">
  Bilingual web pages · Local image OCR · Context-aware subtitles<br>
  网页双语阅读 · 本地图片识别 · 上下文字幕翻译
</p>
<p align="center">
  <a href="#english">English</a> · <a href="#简体中文">简体中文</a> ·
  <a href="LICENSE">Apache-2.0</a> · <a href="https://github.com/JelionNg/luma-translate/issues">Feedback / 反馈</a>
</p>

---

## English

**Your browser, your translation service.** Luma Translate brings bilingual web reading, image translation with local OCR, and context-aware video subtitles to desktop Chrome and Edge. Bring your own API key.

Version **0.29.17** · Manifest V3 · Install from source; not yet available in extension stores.

### Features

- Translate web pages, selected text, or individual paragraphs. Switch between bilingual and translation-only views, with a floating button, progress indicators, and paragraph diagnostics.
- Viewport-first scheduling, batching, bounded concurrency, caching, and support for dynamic pages and SPA navigation.
- Site adaptations for GitHub, Reddit, Hugging Face, and others, with importable and exportable custom rules.
- Local PP-OCRv6 image recognition, positioned translation overlays, and original/translated comparison. Works with uploaded images and accessible web images.
- Existing video subtitle extraction, contextual translation, prefetching, and full-transcript TXT export. Supports selected subtitle paths on YouTube, Reddit, Bilibili, and other sites.
- OpenAI-compatible Chat Completions endpoints, multiple service profiles, glossaries, and target-language selection.

### Installation

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

### Usage

| Action | How |
| --- | --- |
| Start / cancel page translation | Floating button or `Alt+A` |
| Translate selection / inspect a paragraph | Select text and press `Alt+T`; without a selection, enter paragraph selection |
| Translate a web image | Hover over the image and use its translation button |
| Recognize a local image | Open the local image tool from the extension popup |
| Translate video subtitles | Use the in-player translation button; enable native captions when required by the site |
| Export a translated transcript | Use full-transcript translation and TXT export in the video tools |

After updating the source, reload the extension and refresh open pages.

### Privacy and data

OCR runs locally. Recognized text, web page text, subtitles, and related context are sent to the translation service you configure. This project does not operate a translation proxy server.

Settings and caches use browser storage. The active API key is stored in `chrome.storage.sync` and may sync through your browser account; service profiles and backups also use local extension storage. See [PRIVACY.md](PRIVACY.md) for details.

### Limitations

- Video translation requires accessible subtitles; speech recognition for videos without subtitles is not included.
- PDF translation is not included. Closed components, protected media, authenticated images, and some manga pages may be inaccessible.
- OCR can struggle with curved or vertical text, small dense text, and complex backgrounds. Translation overlays do not perform generative background restoration.
- Website changes can break adaptations. Speed and accuracy depend on your provider, network, and device. Not every site or video is supported.

### Development and verification

Runtime code needs no bundling. Run the basic tests with:

```sh
node --test tests/background.test.cjs
```

Browser integration tests require Playwright and desktop Chrome. Some currently use the macOS Chrome path; OCR tests also require model assets and the system tools used by those tests. Test output goes into the ignored `analysis/` directory. Mock API results do not measure real service latency.

After changing video rules, run `node scripts/sync-video-rules.cjs` to synchronize the MAIN-world rules file.

### License

Project code is licensed under [Apache-2.0](LICENSE). Third-party models, the character dictionary, and ONNX Runtime retain their upstream licenses. See [third-party notices](ocr/THIRD_PARTY_NOTICES.md) and the [asset manifest](ocr/assets-manifest.json). This project is not affiliated with or endorsed by Immersive Translate.

---

## 简体中文

**在熟悉的网页里，使用你选择的翻译服务。** Luma Translate 支持网页双语阅读、本地 OCR 图片翻译和上下文字幕翻译，自备 API Key 即可使用。

当前版本 **0.29.17** · 桌面 Chrome / Edge · Manifest V3 · 通过源码安装，尚未发布至扩展商店。

### 功能

- 网页、划词与单段翻译；双语 / 仅译文切换、浮球、进度与段落诊断。
- 视区优先、批量与受控并发、翻译缓存、动态页面和 SPA 路由跟随。
- GitHub、Reddit、Hugging Face 等站点适配，以及可导入导出的自定义规则。
- 图片本地 PP-OCRv6 识别、坐标译文覆盖、原图与译文对照；支持本地上传和可访问的网页图片。
- 视频已有字幕提取、上下文翻译、预取和全文 TXT 导出；支持 YouTube、Reddit、Bilibili 等站点的部分字幕路径。
- OpenAI 兼容 Chat Completions 接口、多服务配置、术语表与目标语言选择。

### 安装

1. 下载本仓库源码并解压，或 `git clone https://github.com/JelionNg/luma-translate.git`。
2. 如需图片翻译，在仓库目录执行 `python3 scripts/setup-ocr-assets.py`。脚本下载约 45 MB 的固定模型和运行时，并校验哈希；不会安装系统软件。网页和字幕翻译不需要这些资源。
3. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
4. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的仓库目录。
5. 打开扩展设置，填写服务地址、API Key 和你有权限使用的模型，保存并启用。
6. 刷新网页，点击浮球开始翻译，再次点击恢复原文。

默认配置面向 DeepSeek，模型可在设置中修改，请以服务商实际支持的模型为准。模型资源首次下载需要联网；下载后 OCR 在浏览器本机运行，文字翻译仍需要所配置的 API。

### 使用

| 操作 | 入口 |
| --- | --- |
| 开始 / 取消网页翻译 | 浮球或 `Alt+A` |
| 划词翻译 / 段落检查 | 选中文字后按 `Alt+T`；无选区时进入段落选择 |
| 网页图片翻译 | 悬停图片，点击图片翻译入口 |
| 本地图片识别 | 扩展弹窗中的本地图片入口 |
| 视频字幕翻译 | 播放器内翻译按钮；站点需要时先启用原生字幕 |
| 字幕全文导出 | 视频翻译工具中的全文翻译和 TXT 导出 |

升级源码后重新加载扩展，并刷新已打开的网页。

### 隐私与数据

见 [PRIVACY.md](PRIVACY.md)。OCR 在本地运行，但识别后的文字、待翻译网页文字、字幕及上下文会发送给你配置的翻译服务。项目没有提供自己的翻译代理服务器。活动 API Key 使用 `chrome.storage.sync` 保存，可能通过浏览器账号同步；服务配置及备份也使用扩展本地存储。

### 限制

- 视频翻译需要可取得的字幕，不包含无字幕音视频的语音识别。
- 不包含 PDF 翻译。封闭组件、受保护媒体、鉴权图片和部分漫画页面可能无法读取。
- OCR 对弯曲、竖排、密集小字和复杂背景仍可能识别不准；译文覆盖不是生成式背景修复。
- 网站改版会影响适配。速度和准确性取决于模型服务、网络与设备；不保证所有网站或视频均受支持。

### 开发与验证

运行时代码无需打包。基础测试：`node --test tests/background.test.cjs`。

浏览器集成测试需自行安装 Playwright 和桌面 Chrome；部分测试目前使用 macOS Chrome 路径，OCR 测试还需要下载模型及测试所需系统工具。测试输出写入被忽略的 `analysis/`，模拟接口验证不代表真实服务延迟。

修改视频规则后执行 `node scripts/sync-video-rules.cjs` 同步 MAIN world 规则文件。

### 许可

项目代码采用 [Apache-2.0](LICENSE)。第三方模型、字符字典和 ONNX Runtime 分别遵循其上游许可，详见 [第三方声明](ocr/THIRD_PARTY_NOTICES.md) 与 [资源清单](ocr/assets-manifest.json)。本项目与 Immersive Translate 无隶属或背书关系。
