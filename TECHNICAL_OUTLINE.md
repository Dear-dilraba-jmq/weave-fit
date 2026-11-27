# 技术大纲 · Weave Fit

> 适用版本：完整 App 1.3.0（数据结构版本 1）。用户与开发流程见 [WORKFLOW.md](WORKFLOW.md)，安装与运行见 [README.md](README.md)。

## 1. 定位与设计原则

- **本机优先**：账号、衣橱、照片和模型推理都在用户自己的电脑上，仓库不包含任何真实数据。
- **单进程、无框架**：Node.js 内置 `http`、`node:sqlite`、`node:test` 和 `crypto`，运行依赖只有 `sharp` 与 `@huggingface/transformers`，前端为原生 HTML / CSS / JS，无构建步骤。
- **可选增强、可降级**：文字 AI、图像服务、本机 FASHN 和淘宝联盟都通过 `.env` 开启；未配置或调用失败时退回本地规则或淘宝搜索链接，基本功能不受影响。
- **一份规则多处复用**：`outfit-plan.js` 同时运行在后台、App 前端和项目主页。
- **默认安全**：同源请求、HttpOnly 会话、主机白名单、按账号隔离、限流和请求体上限。

## 2. 总体架构

```mermaid
flowchart LR
  subgraph Browser["浏览器 / 手机 PWA"]
    UI["index.html · app.js<br/>cutout.js · look.js · shopping.js"]
    API["local-api.js<br/>同源请求 · 账号校验"]
    SW["sw.js<br/>只缓存静态文件"]
  end
  subgraph Backend["本机后台 · Node.js 24 · server.cjs"]
    GATE["主机白名单 · 来源校验<br/>会话 · 限流 · 请求体上限"]
    PLAN["outfit-service.cjs<br/>+ outfit-plan.js"]
    GAR["garment.cjs<br/>SegFormer 分割"]
    REC["item-recognizer.cjs<br/>CLIP 识别"]
    TRY["tryon.cjs<br/>fashn-local.cjs"]
    SHOP["shopping.cjs"]
  end
  DB[("data/outfit.sqlite")]
  MD[("models/<br/>本机 ONNX 模型")]
  LLM["文字 AI<br/>兼容 OpenAI"]
  IMG["图像编辑接口"]
  TB["淘宝联盟 TOP"]
  UI --> API --> GATE
  GATE --> DB
  GATE --> PLAN
  GATE --> GAR
  GATE --> REC
  GATE --> TRY
  GATE --> SHOP
  GAR --> MD
  REC --> MD
  PLAN -. 可选 .-> LLM
  TRY -. 可选 .-> IMG
  SHOP -. 可选 .-> TB
```

- 同一个 Node 进程既提供 `public/` 静态文件，也提供 `/api/*` 接口，浏览器只与本机后台通信。
- 外部服务都由后台调用，密钥不进入浏览器；虚线表示只有配置后才会使用。
- 项目主页是另一条独立的静态链路，也是打开就能用的网页版：`index.html`、`login.html`、`register.html` + `homepage/` + App 的公开脚本，发布到 GitHub Pages，不连接后台；本机账号和数据存在访客自己浏览器的 IndexedDB 里，自动识别在浏览器里运行与 App 相同的模型和规则（见第 10 节）。

## 3. 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js ≥ 24 | 内置 `http`、`node:sqlite`、`node:test`、`crypto.scrypt` |
| 存储 | SQLite（`node:sqlite`，WAL 模式） | 单文件 `data/outfit.sqlite`，照片以 BLOB 存在 `files` 表 |
| 图像处理 | sharp ~0.35.5 | 图片解码校验，合成 1080×1080 白底单品图；`package.json` 的 `overrides`（npm）与 `pnpm-workspace.yaml` 的 `overrides`（pnpm）让 transformers.js 也用同一个版本，进程里只加载一份 libvips |
| 本机推理 | @huggingface/transformers ^3.8.1 | ONNX 量化模型（q8，CPU，只读本地文件） |
| 前端 | 原生 HTML / CSS / JS | PWA：`manifest.webmanifest` + Service Worker |
| 测试 | node:test + jsdom 31.0.1 | 接口、规则、界面流程、Service Worker |
| 可选服务 | 兼容 OpenAI 的对话接口、Images Edit 接口、FASHN VTON（Python）、淘宝联盟 TOP | 均在 `.env` 配置 |

## 4. 目录与模块

### 4.1 后台（`outfit-independent/`）

| 文件 | 职责 |
| --- | --- |
| `server.cjs` | HTTP 服务：路由与方法表、安全检查、会话、限流，以及 records / files / backup / import |
| `launch.cjs` | 启动器：显示本机与局域网地址，写入 `data/logs/server.log`，当天没有备份时先备份 |
| `validation.cjs` | 记录字段校验、衣物类别、搭配请求参数 |
| `outfit-service.cjs` | 看天穿衣 `generate` 与自选搭配 `manual`；可选文字 AI 及其本地校验 |
| `garment.cjs` | SegFormer 衣物分割，按 `public/garment-rules.js` 的方案用 sharp 合成居中的 1080×1080 白底 PNG |
| `item-recognizer.cjs` | 图片解码与 CLIP 零样本推理；款式表、大类、颜色命名、款式选择与整套识别流程来自 `public/garment-rules.js` |
| `tryon.cjs` | 本人全身穿搭图：远程 Images Edit 接口或本机 FASHN |
| `fashn-local.cjs` | 检测本机 FASHN 环境并调用 `scripts/fashn-inference.py` |
| `shopping.cjs` | 淘宝联盟物料搜索（请求签名、结果过滤） |
| `provider-json.cjs` | 读取并解析外部服务返回的 JSON |
| `public-launch.cjs` | 公网测试入口（默认停用） |

### 4.2 App 前端（`outfit-independent/public/`）

| 文件 | 职责 |
| --- | --- |
| `index.html` · `styles.css` · `app.js` | App 外壳与主要界面：衣橱、搭配、收藏、档案、补购、试穿、备份 |
| `local-api.js` | 同源请求客户端：每个私有请求带 `x-outfit-owner`；其他标签页切换账号时中止旧请求 |
| `cutout.js` | 读取照片（按 EXIF 方向）与压缩，调用 `/api/garment` 和 `/api/wardrobe/analyze` |
| `outfit-plan.js` | 搭配规则引擎（第 9 节） |
| `garment-rules.js` | 识别规则（UMD，Node 与浏览器共用）：44 个款式、分割标签到大类、衣物区域与白底图方案 `productPlan`、HSV 颜色命名、款式选择、整套流程 `analyzeGarment`（分割、出图、分类由调用方注入）；App 后台与网页版共用 |
| `style-guide.js` | 风格指南「复古学院 · 甜酷日常」，整理自 17 张用户提供的搭配拼贴 |
| `look-reference.js` | 单品颜色、轮廓示意、搭配板与海报 SVG；待补单品一律用程序绘制的款式轮廓，不使用照片 |
| `look.js` | 导出搭配参考图（嵌入本人照片） |
| `shopping.js` | 补购：淘宝搜索链接与商品卡 |
| `taobao-connect.html` · `taobao-connect.js` | 淘宝联盟应用连接页 |
| `pwa.js` · `sw.js` · `manifest.webmanifest` | 安装与离线静态缓存 |
| 图片 | 图标，四季风格图 `style-source-*.jpg` |

### 4.3 项目主页（仓库根目录）

| 文件 | 职责 |
| --- | --- |
| `index.html` | 页面结构与文案：顶栏（含登录 / 注册或昵称 / 退出）、首屏、宣言区、风格卡、四个功能（拍照入橱、看天穿衣、自己滑着搭、我的衣橱与个人档案）、隐私、常见问题、开始使用、页脚署名；内容安全策略 |
| `login.html` · `register.html` | 登录（选账号、密码、忘记密码用找回码重设）与注册（昵称、密码、显示一次找回码）；全屏人物照背景，版式与首屏一致 |
| `homepage/home.css` | ALP1NE 版式（胶囊、首屏、宣言区、风格卡）、功能面板、个人档案、登录 / 注册页、响应式与「减少动态效果」 |
| `homepage/home.js` | 滚动驱动的画面（一个 rAF 循环）、示例衣橱数据、账号状态与跨标签页同步、拍照入橱（含按需加载识别）、看天穿衣、自己滑着搭、我的衣橱 / 搭配收藏 / 个人档案与账号安全、参考图、备份导出与导入、照片署名 |
| `homepage/store.js` | IndexedDB `weave-fit-web` 第 2 版（`people`、`items`、`looks`）的读写与本机账号：注册、登录、找回码、修改密码、删除账号、会话 |
| `homepage/account.js` | 登录 / 注册页的交互与找回码展示 |
| `homepage/recognize.js` | ES 模块，按需加载：固定版本的 transformers.js、SegFormer 与 CLIP 视觉模型（浏览器缓存），用 `garment-rules.js` 的流程输出自动填写结果和白底 JPEG |
| `homepage/clip-type-vectors.json` | 44 个款式描述「a photo of …」的 CLIP 文字向量（Float32、base64，logit scale 100），由 `outfit-independent/scripts/export-type-vectors.cjs` 用本机模型生成 |
| `homepage/photos/` | 18 张示例单品缩略图 `item-编号.jpg`（Unsplash）；9 张人物形象照 `look-*.webp`；7 张透明背景的拼贴单品图 `piece-*.webp`；2 张登录 / 注册页背景 `auth-*.webp` |
| `scripts/build-pages.cjs` | 把三个页面及依赖同步到 `docs/`（先清空 `docs/homepage/` 与 `docs/outfit-independent/`） |

## 5. 数据模型

表结构（`server.cjs` 启动时创建）：

```sql
CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL REFERENCES users(id), collection TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX records_owner ON records(owner, collection);
CREATE TABLE files(path TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), content_type TEXT NOT NULL, data BLOB NOT NULL);
CREATE TABLE imports(owner TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(owner, digest));
```

业务数据以 JSON 存在 `records.payload`，按 `collection` 区分：

| collection | 内容 | 图片字段 | 约束 |
| --- | --- | --- | --- |
| `profiles` | 个人档案与身材资料 | `face_photo_path`、`full_body_photo_path` | 每个账号最多 1 条 |
| `wardrobe_items` | 衣橱单品：名称、类别、颜色、季节等 | `image_path`（白底图）、`original_path`（原图） | 类别：上装、外套、下装、连衣裙、鞋履、包袋、配饰、其他 |
| `outfits` | 收藏的搭配方案 | 嵌套的 `image_path`、`original_path`、`tryonImage`、`lookImage` 等 | 引用的图片必须属于本账号 |

- `files.path` 必须以 `users/<账号ID>/` 开头，长度不超过 350，不含 `..`、反斜杠或空字符；同一路径不可覆盖。
- 仍被档案、衣橱或收藏引用的图片拒绝删除（409）。
- `imports.digest` 是备份内容的 SHA-256，用于阻止同一份备份重复导入。

完整备份格式（`GET /api/backup`）：

```json
{
  "format": "outfit-mirror-backup",
  "version": 1,
  "exported_at": "2026-01-01T00:00:00.000Z",
  "tables": { "profiles": [], "wardrobe_items": [], "outfits": [] },
  "files": [{ "path": "users/<账号ID>/…", "type": "image/png", "base64": "…" }]
}
```

## 6. 接口清单

约定：

- 全部为同源接口；JSON 请求必须带 `Content-Type: application/json`（否则 415）。成功返回 `{"data": …}`，失败返回 `{"error": {"message": "…"}}` 和对应状态码，500 错误不暴露内部信息。
- 请求方式不在方法表内时返回 405 并带 `Allow` 头；`/api/` 下除健康检查与登录相关接口外都要求登录（否则 401）。
- 请求带 `x-outfit-owner` 且与当前会话不一致时返回 409，并带 `X-Outfit-Account-Mismatch: 1`。

| 接口 | 方法 | 登录 | 限流 | 请求体上限 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `/api/health` | GET | 否 | — | — | 健康检查 |
| `/api/auth/register` | POST | 否 | 与登录合计 20 次 / 10 分钟 / IP | 16 KB | 注册并直接登录 |
| `/api/auth/login` | POST | 否 | 同上 | 16 KB | 登录，签发 7 天会话 |
| `/api/auth/logout` | POST | 否 | — | — | 删除当前会话 |
| `/api/auth/session` | GET | 否 | — | — | 当前登录账号（未登录为 null） |
| `/api/auth/password` | POST | 是 | 5 次 / 10 分钟 | 16 KB | 修改密码，该账号全部会话失效 |
| `/api/status` | GET | 是 | — | — | 版本、存储、规则、模型与可选服务状态 |
| `/api/records` | POST | 是 | — | 1 MB | 按 `mode` 读写三类记录 |
| `/api/files?path=` | GET · HEAD · PUT · DELETE | 是 | — | PUT 8 MB | 私有图片读写 |
| `/api/garment?category=` | POST | 是 | 12 次 / 分钟 | 8 MB | 衣物分割，返回白底 PNG |
| `/api/wardrobe/analyze?category=` | POST | 是 | 12 次 / 分钟 | 8 MB | 名称、类别、主色、季节建议 |
| `/api/outfits/generate` | POST | 是 | 12 次 / 分钟 | 16 KB | 看天穿衣方案 |
| `/api/outfits/manual` | POST | 是 | 30 次 / 分钟 | 16 KB | 校验三件自选单品并给出提醒 |
| `/api/shopping/status` | GET | 是 | — | — | 淘宝联盟是否已配置 |
| `/api/shopping/search` | POST | 是 | 30 次 / 分钟 | 2 KB | 每件待补单品最多 3 个商品候选 |
| `/api/tryon/status` | GET | 是 | — | — | 试穿是否可用、本机或远程、模型 |
| `/api/tryon` | POST | 是 | 3 次 / 10 分钟，同时 1 个 | 128 KB | 生成本人全身穿搭图 |
| `/api/models` | GET | 是 | — | — | 已配置的文字模型 |
| `/api/chat` | POST | 是 | 6 次 / 分钟 | 128 KB | 文字 AI 代理：最多 10 条消息，45 秒超时 |
| `/api/backup` | GET | 是 | — | — | 下载完整 JSON 备份 |
| `/api/import` | POST | 是 | — | 64 MB | 把备份导入空账号 |

`/api/records` 请求体：

```json
{ "table": "wardrobe_items", "mode": "select", "id": 12, "row": {}, "limit": 100, "single": false }
```

`table` 为三类 collection 之一，`mode` 为 `select`、`insert`、`update` 或 `delete`；`limit` 取 1–1000，`update` 与 `delete` 必须给出 `id`。

## 7. 安全设计

| 方面 | 做法 |
| --- | --- |
| 主机白名单 | 只接受 `localhost`、`127.0.0.1`、`[::1]`、本机网卡地址与 `APP_HOSTS` 中的域名，防止 DNS 重绑定 |
| 跨站请求 | 写请求的 `Origin` 必须与 `Host` 一致，`Sec-Fetch-Site` 不能是 `cross-site`；会话 Cookie 为 `SameSite=Strict` |
| 会话 | 32 字节随机令牌，数据库只存其 SHA-256；Cookie `outfit_session` 为 HttpOnly、Path=/、7 天有效，`COOKIE_SECURE=1` 时加 Secure |
| 密码 | scrypt（16 字节随机盐，64 字节派生），恒定时间比较；账号不存在时同样计算哈希，避免通过耗时判断账号；密码 10–200 位，账号 3–80 位并统一小写 |
| 修改密码 | 校验当前密码、新旧不同，在事务内更新并删除该账号全部会话 |
| 账号隔离 | 每次查询都带 `owner` 条件；图片路径必须位于本账号目录；记录引用的图片必须存在且属于本账号 |
| 输入限制 | 每个接口单独设置请求体上限；图片先校验文件头再用 sharp 解码（最多 2500 万像素）；备份每类记录与图片各不超过 1000 条，每张图片不超过 8MB |
| 限流 | 内存固定窗口：登录 / 注册按客户端 IP，其余按账号；试穿每个账号同时只运行一个任务，本机一次只处理一张照片 |
| 响应头 | `X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`、`X-Frame-Options: DENY`、`Cache-Control: no-store`；`PUBLIC_HTTPS_ONLY=1` 时加 HSTS 并把 HTTP 重定向到 HTTPS |
| 外部服务 | 密钥只在后台；文字 AI 与图像服务地址必须是 HTTPS（本机地址除外）且不含凭证；禁止重定向，并设置超时（文字 45 秒，图像 180 秒） |
| 隐私 | 远程试穿前必须得到用户明确同意；淘宝查询只发送单品关键词；Service Worker 不缓存任何接口数据 |
| 反向代理 | 只有 `TRUST_LOOPBACK_PROXY=1` 且连接来自本机时，登录限流才采用 `X-Forwarded-For` 的最后一跳 |
| 网页版 | 见第 10 节「网页版的账号与安全」：PBKDF2 哈希、一次性找回码、内容安全策略、所有动态文本转义、导入逐项校验 |

## 8. 本机模型

| 用途 | 模型 | 运行方式 | 安装 |
| --- | --- | --- | --- |
| 衣物分割 | `Xenova/segformer_b2_clothes`，固定版本 `cb6ac44e641faa309f29561c1afe08d87ef52631` | image-segmentation，q8，CPU，只读本地文件 | `node scripts/setup-garment-model.cjs` |
| 单品识别 | `Xenova/clip-vit-base-patch32` | zero-shot-image-classification，q8，CPU，只读本地文件 | `node scripts/setup-item-recognizer.cjs` |

- 模型保存在 `outfit-independent/models/`，已被 `.gitignore` 排除；推理全部在本机，不向模型网站发送照片。
- 网页版在访客浏览器里用同样的两个模型：SegFormer 与 App 同一固定版本；CLIP 只用视觉部分（`onnx/vision_model_quantized.onnx`，固定版本 `6b7c523703ae26e39be4b03774966f8571c7f523`），款式文字向量预先算好放在 `homepage/clip-type-vectors.json`，与 App 的零样本分类结果一致（logit scale 100 + softmax）。
- 分割流程：按所选类别取衣物掩码 → 连通域清理，去掉小碎片 → 裁切后居中合成到 1080×1080 白底（App 用 sharp，网页版用 canvas，方案都来自 `garment-rules.js` 的 `productPlan`）。
- 识别使用衣物区域而非杂乱背景的像素；分割失败时仍返回可编辑的元数据，并保留原图。
- `GET /api/status` 与 `npm run diagnose` 都会报告模型是否就绪。

## 9. 搭配规则引擎

`public/outfit-plan.js` 是 UMD 模块：浏览器中为 `window.OutfitPlanner`，Node 中通过 `require` 使用；它依赖 `style-guide.js`（`OutfitStyleGuide`）。

| 函数 | 作用 |
| --- | --- |
| `climateFor(o)` | 由季节、温度、天气得到温度档位、建议、是否雨雪 / 大风、是否需要外套 |
| `suggest(wardrobe, picked, request)` | 从衣橱挑选完整搭配，并列出缺少的单品、提示与提醒 |
| `unsuitable(item, climate)` | 判断单品是否不适合当前温度 |
| `validate(plan, wardrobe, request)` | 检查方案与温度、类别是否匹配，返回问题列表 |
| `group(item)` · `styleMatch(item, style)` · `currentSeason()` · `prefersVacationDress(climate, request)` | 分组、风格匹配、当前季节、度假场合偏好 |
| `seasonDefaults` | 季节默认温度：春季 18°C、夏季 30°C、秋季 18°C、冬季 5°C |

温度档位（温度先限制在 −10…40°C；未给温度时用季节默认值，季节也没有时按 22°C）：

| 档位 | 温度 | 名称 |
| --- | --- | --- |
| 0 | ≤ 5°C | 寒冷保暖 |
| 1 | ≤ 11°C | 偏冷叠穿 |
| 2 | ≤ 17°C | 凉爽外搭 |
| 3 | ≤ 23°C | 温和轻装 |
| 4 | ≤ 28°C | 偏热透气 |
| 5 | > 28°C | 炎热清凉 |

- 天气含「雨 / 雪」时标记为雨雪天气：排除凉鞋、拖鞋、麂皮、绒面、帆布等不防水或露脚趾的鞋履，衣橱里的靴子或标明防水、防滑的鞋优先于其他同样适温的鞋，没有合适的鞋时待补建议注明防水防滑（自选搭配额外提醒雨具）；含「风」时影响是否需要外套；档位 0–2 默认需要外套。
- 文字 AI 方案必须同时满足以下条件，否则回退为规则方案：通过 `validate()`；度假场合包含合适的连衣裙；保留用户预选且适温的单品。
- 规则只在这一个文件维护，后台、App 和主页共用，改动后运行 `npm test`（`outfit-plan.test.cjs`、`outfit-service.test.cjs`）。

## 10. 项目主页

主页就是网页版：打开就能用，不用下载或安装 App。脚本按依赖顺序加载：`style-guide.js` → `outfit-plan.js` → `garment-rules.js` → `homepage/store.js` → `homepage/home.js`；`homepage/recognize.js` 只在访客使用自动识别时按需加载。版式复刻 ALP1NE 提示词网站（固定全屏首屏随滚动换画面、白色方角胶囊顶栏、底部差值混合大标题、橄榄色宣言区与视差拼贴、滚动展开的全屏风格卡），之后接四个可用的功能、隐私、常见问题和开始使用；登录 / 注册是两个单独的页面，沿用同一套版式。

| 区块 | 实现 |
| --- | --- |
| 顶栏 | 白色方角胶囊：品牌、浏览器本地时间（每秒刷新）、功能 / 风格 / 我的衣橱、常见问题，未登录时「登录」「注册」，登录后显示昵称（点开个人档案）和「退出」；≤1024px 只留品牌和「菜单」，菜单是带模糊背景的全屏浮层，关闭时 `inert` |
| 首屏 | 5 张人物形象照 `look-*.webp` 叠在固定层里，滚过 250vh 的占位区时依次换装：每张停留大半段，只在中间 40% 淡入下一张，同时缓慢拉远（代替提示词里随滚动拖动进度的视频）。左上角胶囊显示当前造型的风格与温度；底部标题在首屏前 85% 的滚动里上移 150px、缩到 0.8、模糊到 24px 并淡出 |
| 宣言区 | 橄榄色 `#575234` 底、差值混合的大字；7 件生成的单品图 `piece-*.webp` 都放在文字下面做视差（文字叠在衣服上仍清楚）：区块中心与视口中心的距离归一到 −1.2…1.2，每件按 `data-speed`、`data-drift`、`data-rot` 移动、漂移和旋转 |
| 风格卡 | `.looks` 比视口高 3400px，舞台 sticky 固定：前 700px 窗口从中心展开（easeInOutCubic），之后每 900px 换一张卡（先停留，再在中间 60% 的距离里滑过去），卡内照片左右各多出 12% 并反向位移，宽屏上需要上下裁切时从下方裁，保住人物的头；停止滚动时如果停在两张卡之间，平滑滚到最近一张卡的停留区（`scrollend`，不支持时滚动停 220ms 后）；中央的大号符号每换一张随机换一个。区块向上叠住宣言区最后一屏，窗口在宣言文字还没滚完时就开始展开。「按某风格搭一套」把风格带进看天穿衣 |
| 01 拍照入橱 | 表单添加 / 修改 / 删除我的单品（保存需要登录，访客可以试用识别）：照片在浏览器里按长边 900px 缩小并转成 JPEG，主色取画面中间、和边缘背景色差得多的像素里最常见的颜色，颜色名用 `garment-rules.js` 的 `colorName`。随后提供自动识别：模型不在缓存时先说明约 140 MB 并征得同意，下载进度显示在表单里；识别结果填进名称、类别、季节、主色（手动改过的项不覆盖，只有手动选过类别时才把类别交给识别），生成白底单品图并可切回原图。保存时白底图为主图、原图另存。删除需要连点两次 |
| 02 看天穿衣 | 季节（套用 `seasonDefaults` 的示例温度）、实际温度（−10…40°C）、天气、10 种风格、9 种场合 → `OutfitPlanner.suggest`，与 App 同一套规则，用当前选中的衣橱；登录后风格默认取个人档案里排在最前的常穿风格，并显示「我的参考」（面部参考照片与档案摘要）。缺少的单品显示衣架占位和淘宝搜索链接。「换一套」递增 `variant`，「收藏」存下这一套，「拿去自己调整」把方案放进下一块 |
| 03 自己滑着搭 | 「上装 / 外套」「下装」「鞋子」三行（与 App 相同），支持滑动、按钮、方向键与 Home / End、随机、重置、收藏和导出参考图；衣橱变化时重建，能保留的选择按单品保留；某一行没有单品时提示去添加。按看天穿衣当前的温度用 `unsuitable()` 检查，只提醒不替换 |
| 04 我的衣橱 | 左侧切换我的衣橱 / 示例衣橱 / 搭配收藏 / 个人档案：选哪个衣橱，看天穿衣和自己滑着搭就用哪个（我的衣橱为空时仍用示例衣橱）。我的单品点一下回到 01 修改；示例单品点一下放进三行滑动；收藏可以放进自己搭、导出参考图或删除。个人档案字段与 App 一致，保存前逐项校验；「账号与安全」里修改密码、换找回码、删除账号、退出 |
| 参考图 | canvas 画成 1080×1350 PNG：品牌与日期胶囊、场景说明、一到四件单品（白底格子，没有照片或已删除的单品画成色块和名字）、署名；文字超宽时截断 |
| 备份 | 导出当前账号的单品（白底图与原图转成 data URL）、收藏和档案（含面部参考照片），第 2 版 JSON；导入到当前账号：只接受 jpeg / png / webp 的 data URL，单品与收藏各最多 2000 条，档案只取已知字段且只在当前档案为空时导入；编号已被这台设备上别的账号使用时换新编号并同步改写收藏里的引用，同一账号再次导入同一份备份则原地更新 |
| 页脚署名 | 由 `closet` 生成 18 条示例单品照片署名：单品名链接到 Unsplash 原图页，并注明摄影师 |

数据与照片：

- 数据存在浏览器 IndexedDB 数据库 `weave-fit-web` 第 2 版的三个表里：`people`（本机账号：昵称、密码与找回码的哈希、档案、面部参考照片 Blob）、`items`（单品：`owner` 为账号编号，`image` 主图与 `original` 原图为 Blob）与 `looks`（收藏：`owner`、单品编号、当时的名字、场景说明）。第 1 版留下的单品和收藏没有 `owner`，由这台设备上第一个注册的账号认领。第一次保存后调用 `navigator.storage.persist()`。浏览器不允许使用 IndexedDB 时只保存在本次打开的页面里，并提示访客。本站是静态网页，不接收任何数据。
- 识别模型由 transformers.js 存在 Cache Storage `transformers-cache`（键是下载地址）；已缓存时直接用缓存所在的地址，不再联网试连。
- 示例衣橱 `closet` 中每件单品有 `photo`（Unsplash 图片编号）、`page`（原图页面）、`by`（摄影师），可选 `rect`（原图像素裁切区域）；`item-编号.jpg` 是 480×480 的正方形缩略图，由 Unsplash 图床按 `photo`、`rect` 生成后下载（JPEG，质量 72）。
- 人物形象照 `look-*.webp`（1670×941）和登录 / 注册页背景 `auth-*.webp`（1672×941）由用户提供；拼贴单品图 `piece-*.webp` 由 Figma AI（gpt-image）按提示词生成，原生透明背景，只裁掉四周的空白并按显示尺寸的 2 倍缩小。这些都是 AI 生成的风格示意，页脚注明。
- 页面只读取静态文件，不调用后台；支持 360px 手机宽度与 `prefers-reduced-motion`（滚动驱动的数值直接到位，不做视差、模糊和位移，CSS 关闭过渡）。

网页版的账号与安全：

| 方面 | 做法 |
| --- | --- |
| 密码 | PBKDF2-SHA256，21 万次，16 字节随机盐，256 位；比较时不提前退出；校验失败统一等 600ms。昵称 1–24 字（不区分大小写唯一），密码 10–200 位 |
| 找回码 | 12 位（去掉 0 O 1 I L，按 4 位一组显示），注册时与重设后各显示一次，只存同样的 PBKDF2 哈希；用过即作废、换发新的；登录后可凭当前密码换一个 |
| 会话 | 只记账号编号：勾选「记住我」存 localStorage，否则存 sessionStorage；其他标签页登录或退出时通过 `storage` 事件同步 |
| 安全来源 | `crypto.subtle` 只在 HTTPS 与 `localhost` / `127.0.0.1` 可用；用局域网 IP 的 http 地址打开时，登录 / 注册页直接说明并禁用提交 |
| 内容安全策略 | 三个页面都用 `<meta http-equiv="Content-Security-Policy">`：脚本只允许本站（主页另加 jsDelivr 与 `wasm-unsafe-eval`），无内联脚本和内联事件；样式允许 Google Fonts 与内联样式属性；图片只允许本站、blob 与 data；主页的网络请求只允许本站与 HTTPS（下载模型）|
| 输出转义 | 所有拼进 HTML 的昵称、单品名、备注、收藏说明都经过转义；数值与颜色先校验格式 |
| 边界 | 数据在本机、没有加密：密码用来区分家人、防止误操作，不能防住能打开这台设备开发者工具的人。删除账号需要当前密码并点两次确认 |

## 11. PWA 与缓存

- `sw.js` 只处理同源 GET，并且只处理 `STATIC` 白名单中的静态路径：网络优先，离线时回退缓存。
- 登录、记录、图片、备份和生成结果等接口一律直连网络，从不缓存（`worker.test.cjs` 覆盖）。
- 缓存名当前为 `outfit-mirror-independent-v26`；新版本激活时只删除本应用的旧缓存。

## 12. 测试

| 文件 | 主要内容 |
| --- | --- |
| `account-owner.test.cjs` | 账号请求头阻止过期的读、写和退出；私有图片不能跨账号引用 |
| `backend.test.cjs` | 持久化、登录、私有照片、备份与迁移 |
| `backend-validation.test.cjs` | 非法输入返回明确的 400；图片必须可解码；删除衣物后仍被引用的照片保留 |
| `garment.test.cjs` | 浅色衣物保留、人物与背景去除；缺少衣物类别时明确失败 |
| `item-auto-fill.test.cjs` | 上传后自动填写四个字段并尊重手动修改；识别接口校验账号与图片 |
| `item-recognizer.test.cjs` | 用衣物像素识别；分割失败时仍有元数据与原图 |
| `look-reference.test.cjs` | 明确颜色优先；搭配板包含全部单品；待补单品只用轮廓示意、不出现照片 |
| `manual-ui.test.cjs` | 三行可用按钮、键盘和触摸独立选择 |
| `operations.test.cjs` | 启动器端口与地址；在线备份包含 WAL 中已提交的数据且不覆盖源库 |
| `outfit-plan.test.cjs` | 度假优先连衣裙；30°C 不选普通卫衣，18°C 不选短袖上衣 |
| `outfit-service.test.cjs` | 只使用当前账号衣橱；AI 结果校验，服务失败或虚构单品时回退 |
| `public-access.test.cjs` | 公网入口强制 HTTPS、安全 Cookie、同源操作与登录限流 |
| `shopping.test.cjs` · `shopping-ui.test.cjs` | TOP 签名、不发送个人字段、安全处理上游失败；未配置时提供搜索链接 |
| `tryon.test.cjs` | 使用本人资料与衣物、必须同意；校验温度、类别与层次 |
| `worker.test.cjs` | Service Worker 不拦截私有数据，只清理本应用旧缓存 |
| `ui-check.cjs` · `account-switch-check.cjs` | jsdom 界面流程；多标签页账号切换 |

`npm test` 运行全部 `*.test.cjs`；`npm run test:all` 依次运行上述全部检查，并清空外部服务密钥，保证测试不调用真实服务。

## 13. 运维脚本

| 脚本 | 用途 |
| --- | --- |
| `scripts/run-checks.cjs` | `npm run test:all`：完整检查 |
| `scripts/diagnose.cjs` | `npm run diagnose`：Node 版本、依赖和本机模型 |
| `scripts/backup-database.cjs` | `npm run backup`：在线备份数据库到 `data/backups/` |
| `scripts/reset-local-password.cjs` | `npm run recover-account`：本机重设密码，先备份并让该账号在所有设备退出 |
| `scripts/setup-garment-model.cjs` | 下载固定版本的衣物分割模型 |
| `scripts/setup-item-recognizer.cjs` | 下载单品识别模型 |
| `scripts/export-type-vectors.cjs` | `node scripts/export-type-vectors.cjs [模型目录]`：用本机 CLIP 模型为 `garment-rules.js` 的 44 个款式生成文字向量，写入网页版的 `homepage/clip-type-vectors.json` |
| `scripts/prepare-import.cjs` | `node scripts/prepare-import.cjs <导出目录> <输出.json>`：把旧网站的单用户导出（`profiles.json`、`wardrobe_items.json`、`outfits.json`、`images/`）转换为备份格式 |
| `scripts/fashn-inference.py` | 本机 FASHN VTON 推理，由 `fashn-local.cjs` 调用 |
| `scripts/preview-test.cjs` | 启动隔离的浏览器检查实例，不打开或复制用户数据库 |
| `scripts/public-host.cjs` · `public-bridge.cjs` · `stop-public.cjs` | 公网测试入口（默认停用） |

## 14. 配置项

配置写在 `outfit-independent/.env`（参考 `.env.example`），由 `npm start` 读取。

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `HOST` · `PORT` | 监听地址与端口 | `127.0.0.1` · `8090`；启动器默认允许同一 Wi-Fi 访问 |
| `LLM_API_BASE` · `LLM_API_KEY` · `LLM_MODEL` | 文字 AI（`/chat/completions`），三项齐全才启用 | 未配置 |
| `IMAGE_API_KEY` · `IMAGE_API_URL` · `IMAGE_MODEL` | 远程试穿图像接口 | 地址默认 OpenAI Images Edit，模型默认 `gpt-image-2`；密钥可回退到 `OPENAI_API_KEY` |
| `FASHN_PYTHON` · `FASHN_WEIGHTS` | 本机 FASHN VTON：Python 可执行文件存在且权重目录含 `model.safetensors` 时启用，一次处理一张 | 未配置 |
| `TAOBAO_APP_KEY` · `TAOBAO_APP_SECRET` · `TAOBAO_ADZONE_ID` | 淘宝联盟商品卡（推广位 ID 为数字） | 未配置 |
| `APP_HOSTS` | 额外允许访问的域名，逗号分隔 | 空 |
| `COOKIE_SECURE` | 设为 `1` 时会话 Cookie 加 Secure（HTTPS 部署时开启） | 关闭 |
| `PUBLIC_HTTPS_ONLY` · `TRUST_LOOPBACK_PROXY` | 由公网入口脚本设置：强制 HTTPS；信任本机反向代理转发的客户端地址 | 关闭 |

## 15. 部署形态

| 形态 | 做法 | 适用 |
| --- | --- | --- |
| 本机 + 局域网 | `node launch.cjs`，同一 Wi-Fi 的手机用局域网地址访问 | 个人日常使用（默认） |
| 自有域名 | HTTPS 反向代理到本机端口，设置 `APP_HOSTS=<域名>` 与 `COOKIE_SECURE=1`，持久化 `data/` 并定期备份 | 需要外网访问时 |
| 项目主页（网页版） | `node scripts/build-pages.cjs` 后由 GitHub Pages 发布 `main` 分支的 `/docs` | 打开就能用：本机账号、自动识别、规则搭配、三行滑动、收藏与参考图、个人档案、备份，数据存在访客自己的浏览器里；需要 HTTPS |

完整 App 需要持久的 SQLite 与本机模型，不能部署到 GitHub Pages 这类纯静态托管。

## 16. 已知限制

- 单进程设计：限流计数、试穿任务锁和照片处理锁都在内存中，重启后清零，多个实例之间不共享。
- 照片以 BLOB 存在 SQLite，数据库随照片增长；备份为 base64 JSON，单次导入上限 64MB。
- 没有邮箱验证与找回，忘记密码只能在本机终端重设。
- 识别为零样本分类，季节只按可见款式估计；复杂背景或多件叠放时分割可能不准确。分割模型用人物穿着照片训练，单独摆拍的鞋子可能被当成上装（例如示例衣橱的切尔西短靴），这时结果会标「请核对」。
- 规则引擎为启发式，搭配结果取决于衣橱里实际有哪些单品。
- 网页版的数据只在一台设备的一个浏览器里，换设备要靠导出 / 导入备份；清除网站数据或无痕窗口关闭后会丢失。网页版账号与 App 账号互不相通，两边的备份格式也不同。
- 网页版自动识别第一次要下载约 140 MB；内存较小的手机可能加载失败，这时保留照片和主色，可以手动填写。国内无法访问 Hugging Face 时改用 hf-mirror.com，能否下载取决于镜像是否允许跨域。
- 网页版暂无文字 AI、本人试穿图和淘宝真实商品卡（需要密钥和后台）。
- 仓库暂无许可证文件。

## 17. 路线图

逐项待办、优先级与完成标准见 [WORK.md 第 5 节](WORK.md#5-待办)。

- **近期**：App 界面沿用主页的视觉语言；规则引擎细分通勤、约会、运动等场合。
- **中期**：穿着记录与统计（穿着日历、穿着次数）；分片备份与导入，突破 64MB；持续集成；补充许可证与贡献指南。
- **长期**：服务器版部署方案（HTTPS、持久存储、多实例共享限流）；更多本机模型（如材质识别），持续保持「照片不出本机」。
