<p align="center">
  <img src="icons/128.png" width="96" height="96" alt="Luma Translate icon">
</p>
<h1 align="center">Luma Translate</h1>
<p align="center">跨越语言，读懂上下文。</p>
<p align="center">网页双语阅读 · 图片识别 · 上下文字幕翻译</p>
<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> ·
  <a href="LICENSE">Apache-2.0</a> · <a href="https://github.com/JelionNg/luma-translate/issues">反馈</a>
</p>

---

**在熟悉的网页里，使用你选择的翻译服务。** Luma Translate 支持网页双语阅读、本地 OCR 图片翻译和上下文字幕翻译，自备 API Key 即可使用。

当前版本 **0.30.0** · 桌面 Chrome / Edge · Manifest V3 · 通过源码安装，尚未发布至扩展商店。

## 功能

- 网页、划词与单段翻译；双语 / 仅译文切换、浮球、进度与段落诊断。
- 视区优先、批量与受控并发、翻译缓存、动态页面和 SPA 路由跟随。
- GitHub、Reddit、Hugging Face 等站点适配，以及可导入导出的自定义规则。
- 图片本地 PP-OCRv6 识别、坐标译文覆盖、原图与译文对照；支持本地上传和可访问的网页图片。
- 视频已有字幕提取、上下文翻译、预取和全文 TXT 导出；支持 YouTube、Reddit、Bilibili 等站点的部分字幕路径。
- OpenAI 兼容 Chat Completions 接口、多服务配置、术语表与目标语言选择。

## 安装

1. 下载本仓库源码并解压，或 `git clone https://github.com/JelionNg/luma-translate.git`。
2. 如需图片翻译，在仓库目录执行 `python3 scripts/setup-ocr-assets.py`。脚本下载约 45 MB 的固定模型和运行时，并校验哈希；不会安装系统软件。网页和字幕翻译不需要这些资源。
3. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
4. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的仓库目录。
5. 打开扩展设置，填写服务地址、API Key 和你有权限使用的模型，保存并启用。
6. 刷新网页，点击浮球开始翻译，再次点击恢复原文。

默认配置面向 DeepSeek，模型可在设置中修改，请以服务商实际支持的模型为准。模型资源首次下载需要联网；下载后 OCR 在浏览器本机运行，文字翻译仍需要所配置的 API。

## PDF 对照阅读

从扩展弹窗打开“PDF 对照阅读”，选择 PDF，点击“翻译可见页”。左侧原文、右侧译文；在右侧段落内划选词语或短语，左侧高亮对应的短原文片段；单字不触发。相同文字在本地匹配，跨语言短语按需请求已配置的模型并缓存结果；无法确认或范围过大的结果不高亮。取消选择或按 Esc 清除。滚动后继续翻译附近页面，“暂停”可停止任务。文件在浏览器内解析，提取的文字发送到已配置的翻译服务。右侧保留页面尺寸、栏位、标题和图形，并在文字区域内自然重排段落；区域内统一调整字号和行距，过长译文可滚动阅读，不覆盖相邻内容。识别到的图表内部、算法和独立公式保留原文，图注、表注和正文继续翻译。

## 使用

| 操作 | 入口 |
| --- | --- |
| 开始 / 取消网页翻译 | 浮球或 `Alt+A` |
| 划词翻译 / 段落检查 | 选中文字后按 `Alt+T`；无选区时进入段落选择 |
| 网页图片翻译 | 悬停图片，点击图片翻译入口 |
| 图片识别 | 扩展弹窗中选择图片，或悬停网页图片使用翻译入口 |
| 视频字幕翻译 | 播放器内翻译按钮；站点需要时先启用原生字幕 |
| 字幕全文导出 | 视频翻译工具中的全文翻译和 TXT 导出 |

升级源码后重新加载扩展，并刷新已打开的网页。

## 隐私与数据

见 [PRIVACY.md](PRIVACY.md)。OCR 在本地运行，但识别后的文字、待翻译网页文字、字幕及上下文会发送给你配置的翻译服务。项目没有提供自己的翻译代理服务器。活动 API Key 使用 `chrome.storage.sync` 保存，可能通过浏览器账号同步；服务配置及备份也使用扩展本地存储。

## 限制

- 视频翻译需要可取得的字幕，不包含无字幕音视频的语音识别。
- PDF 对照阅读支持文字型文件、段落翻译及原文联动高亮；扫描页、复杂表格和公式尚未完善。封闭组件、受保护媒体、鉴权图片和部分漫画页面可能无法读取。
- OCR 对弯曲、竖排、密集小字和复杂背景仍可能识别不准；译文覆盖不是生成式背景修复。
- 网站改版会影响适配。速度和准确性取决于模型服务、网络与设备；不保证所有网站或视频均受支持。

## 目录结构

源码按职责分为 `src/background`、`web`、`image`、`video`、`shared` 和 `ui`，OCR、图标、测试及维护脚本各自独立。加载扩展时仍选择包含 `manifest.json` 的根目录，不要选择 `src/`。

## 开发与验证

运行时代码无需打包。基础测试：`node --test tests/background.test.cjs`。

浏览器集成测试需自行安装 Playwright 和桌面 Chrome；部分测试目前使用 macOS Chrome 路径，OCR 测试还需要下载模型及测试所需系统工具。测试输出写入被忽略的 `analysis/`，模拟接口验证不代表真实服务延迟。

修改视频规则后执行 `node scripts/sync-video-rules.cjs` 同步 MAIN world 规则文件。

## 许可

项目代码采用 [Apache-2.0](LICENSE)。第三方模型、字符字典和 ONNX Runtime 分别遵循其上游许可，详见 [第三方声明](ocr/THIRD_PARTY_NOTICES.md) 与 [资源清单](ocr/assets-manifest.json)。本项目与 Immersive Translate 无隶属或背书关系。
