# 穿搭魔镜 · Weave Fit

整理自己的衣橱，按季节、温度和场合寻找搭配灵感。支持上装、下装、鞋子三行独立滑动，自己组合并收藏。

> **English summary** — Weave Fit is a local-first digital wardrobe. Photograph your clothes, let on-device models fill in name, category, colour and season, then build outfits by temperature-aware rules or by swiping three rows (tops, bottoms, shoes) yourself. The full App runs on your own computer with Node.js 24 and SQLite; text AI, try-on images and Taobao product cards are optional add-ons you configure locally. The repository root is also a browser-only web version with local accounts, in-browser recognition (the same models and rules via transformers.js), profiles, posters and backups — everything stays in the visitor's browser.

仓库根目录的 [index.html](index.html) 是打开就能用的网页版：不用下载或安装任何 App，手机和电脑都能用。版式复刻 ALP1NE 提示词网站（首屏随滚动换装、白色方角胶囊顶栏、橄榄色宣言区与视差拼贴、滚动展开的全屏风格卡），往下是完整的衣橱功能：

- **本机账号**：[register.html](register.html) / [login.html](login.html) 两个页面（全屏人物照背景，与首屏同一套版式）。一家人各注册一个，衣橱、收藏和个人档案互不打扰；账号只建在这台设备的浏览器里，不需要手机号或邮箱。注册时给出一次性的找回码，忘记密码时用它重设。没登录时可以用示例衣橱试遍所有功能，保存才需要账号。
- **拍照入橱**：在浏览器里运行与完整 App 相同的两个模型（SegFormer 衣物分割 + CLIP 款式识别，版本固定）和同一份识别规则，抠出白底单品图并填好名称、类别、季节和主色，可改回原图保存。第一次使用要征得访客同意后下载约 140 MB 模型，之后留在浏览器缓存里；照片不上传。
- **看天穿衣、自己滑着搭**：与 App 同一套温度规则，10 种风格、9 种场合；登录后默认用个人档案里的常穿风格。
- **我的衣橱 / 示例衣橱 / 搭配收藏 / 个人档案**：档案字段与 App 一致（身高、体重、身形、肤色、发色、常穿风格、面部参考照片），在看天穿衣里显示成「我的参考」；收藏和当前搭配都能导出 1080×1350 的参考图；备份含照片、收藏和档案，导入到当前账号。
- **账号与安全**：修改密码、换一个新的找回码、删除账号（连同数据）、退出。

账号、单品、收藏和档案都保存在访客浏览器的 IndexedDB 里，本站不接收任何数据；密码和找回码只以 PBKDF2 加盐哈希保存，用来区分家人、防止误操作，数据本身没有加密。文字 AI、本人试穿图和淘宝真实商品卡需要密钥和后台，网页版暂不提供（「待补」单品仍可直接去淘宝搜索）。人物形象照、拼贴单品图和登录 / 注册页背景是 AI 生成的风格示意；示例衣橱的 18 件单品是 Unsplash 上的真实服装照片（Unsplash License），页脚逐张注明摄影师和原图链接。

## 功能一览

| 能力 | 说明 | 是否需要外部服务 |
| --- | --- | --- |
| 拍照入橱 | 拍照或选图后自动建议名称、类别、主色和季节，并制作居中 1080×1080 白底单品图 | 否，本机 SegFormer + CLIP |
| 看天穿衣 | 6 档温度规则（≤5° 到 ≥29°）结合季节、天气和场合生成搭配，并提示缺少的单品 | 否 |
| 自己滑着搭 | 上装/下装/鞋子三行独立滑动，只提示不适温问题，不替换你的选择 | 否 |
| 收藏与海报 | 收藏整套搭配，导出含私有照片的参考图 | 否 |
| 备份与迁移 | 个人档案导出完整 JSON 备份（含照片），导入到新电脑的空账号 | 否 |
| 文字 AI 搭配 | 兼容 OpenAI 格式的对话接口，输出仍受本地温度规则约束 | 是，`LLM_*` |
| 本人全身穿搭图 | Images Edit 接口（默认 `gpt-image-2`）或本机 FASHN VTON | 是，`IMAGE_*` / `FASHN_*` |
| 淘宝补购 | 无凭证时打开淘宝搜索；配置淘宝联盟应用后展示真实商品卡 | 可选，`TAOBAO_*` |

## 项目结构

```text
index.html              网页版主页（打开就能用：首屏、风格卡与全部衣橱功能）
login.html register.html 网页版的登录 / 注册页（含忘记密码、找回码）
homepage/               网页版代码与照片：
  home.css                样式（主页与登录 / 注册页共用）
  home.js                 主页交互：滚动画面、拍照入橱、看天穿衣、自己滑着搭、衣橱、个人档案、参考图、备份
  store.js                本机数据与本机账号（IndexedDB，主页与登录 / 注册页共用）
  account.js              登录 / 注册页的交互
  recognize.js            浏览器内自动识别（按需加载 transformers.js 与模型）
  clip-type-vectors.json  预先算好的 44 个款式文字向量（由 export-type-vectors.cjs 生成）
  photos/                 示例单品、人物形象照、拼贴单品图、登录 / 注册页背景
docs/                   GitHub Pages 发布目录（由 scripts/build-pages.cjs 生成）
scripts/build-pages.cjs 把网页版及其依赖同步到 docs/
outfit-independent/     完整 App：前端 public/、Node.js 后台、脚本 scripts/、测试 test/
WORKFLOW.md             用户流程、业务流程与开发/发布流程
TECHNICAL_OUTLINE.md    架构、模块、数据模型、接口、安全与路线图
WORK.md                 竞品调研、差距分析、迭代记录与待办
启动独立版.cmd           Windows 启动入口
```

网页版直接复用完整 App 的 `style-guide.js` 和 `outfit-plan.js`（温度规则），搭配结果与 App 的本地规则一致；规则提示缺少的单品时，用衣架图标占位并给出淘宝搜索链接。识别规则（款式表、大类、颜色命名、款式选择与整套识别流程）放在 `outfit-independent/public/garment-rules.js`，App 后台（`garment.cjs`、`item-recognizer.cjs`）和网页版共用这一份，两边的识别结果一致。

## 运行完整 App

安装 Node.js 24 或更新版本，在下载的项目中执行：

```sh
cd outfit-independent
npm install
node launch.cjs
```

已经装过依赖的，更新代码后请在 `outfit-independent/` 里重新执行一次 `npm install`（或 `pnpm install`）：图片库 sharp 已升级到 0.35.5，修复了 0.34.x 依赖的 libvips、libheif、librsvg 的高危安全公告。

启动器会显示电脑地址（默认 `http://127.0.0.1:8090/`）及同一 Wi-Fi 的手机地址。安装依赖后，Windows 也可双击根目录的「启动独立版.cmd」。这是本地 HTTP 服务：请在可信 Wi-Fi 下使用，不要把端口直接暴露到互联网。

首次使用需注册本地账号（密码至少 10 位）。已有独立版用户要迁移到另一台电脑时，应从旧版个人档案导出自己的备份，再导入新电脑的空账号；本仓库不包含任何真实账号、衣橱数据库或个人照片。

上传单品照片后，完整 App 会自动建议名称、类别、主色和季节；可修改后保存，手动填写过的内容不会被自动结果覆盖。识别在本机进行，季节仅按可见款式估计。

如需本机衣物分割和自动填写，在 `outfit-independent/` 中另行下载两个模型：

```sh
node scripts/setup-garment-model.cjs
node scripts/setup-item-recognizer.cjs
```

按温度生成规则搭配、手动组合、衣橱管理与收藏不需要外部 AI。自动本人全身穿搭图、文字 AI 和淘宝真实商品卡需要分别配置服务，见 [完整说明](outfit-independent/README.txt) 与 [环境配置示例](outfit-independent/.env.example)。复制 `.env.example` 为 `.env` 后填写，密钥仅在本机配置，不要提交。

常用命令（均在 `outfit-independent/` 中执行）：

| 命令 | 作用 |
| --- | --- |
| `npm start` | 读取 `.env`（如有）并启动服务 |
| `npm test` | 运行 `test/*.test.cjs` 单元与接口测试 |
| `npm run test:all` | 完整检查（测试 + 界面检查 + 账号切换检查） |
| `npm run diagnose` | 检查 Node 版本、依赖和本机模型是否就绪 |
| `npm run backup` | 备份本地数据库 |
| `npm run recover-account` | 在本机终端重设忘记的本地密码（先自动备份） |

## GitHub Pages 项目主页

Pages 发布来源为 `main` 分支的 `/docs`。修改主页后运行：

```sh
node scripts/build-pages.cjs
```

将更新后的根目录页面和 `docs/` 一起提交即可。发布目录只包含网页版的三个页面、代码、款式向量、照片和图标，不含任何账号或个人数据。本地预览可在仓库根目录启动任意静态服务器，例如 `python -m http.server 8765`，再打开 `http://127.0.0.1:8765/`。账号（浏览器的 WebCrypto）、自动识别和复制找回码都需要安全来源：HTTPS，或本机的 `127.0.0.1` / `localhost`；用局域网 IP 的 http 地址在手机上预览时，页面会提示账号功能不可用，也不能直接双击打开 HTML 文件。

网页版的照片保存在 `homepage/photos/`（18 张示例单品照片、9 张人物形象照、7 张拼贴单品图、2 张登录 / 注册页背景，约 2.5 MB），由 `build-pages.cjs` 一并发布，不依赖外部图床；替换或新增照片的做法见 [WORKFLOW.md 3.5](WORKFLOW.md#35-项目主页开发)。识别模型不随网页发布：访客同意后由浏览器从 Hugging Face（或国内镜像 hf-mirror.com）按固定版本下载，推理库 transformers.js 从 jsDelivr 按固定版本加载；页面用内容安全策略只允许这些来源的脚本。

GitHub Pages 是静态托管：网页版的账号、衣橱、自动识别、规则搭配、三行滑动、收藏、参考图与备份都在访客的浏览器里运行，不需要后台。完整 App 的 SQLite 账号、跨设备访问、文字 AI、本人穿搭图和淘宝商品卡仍需要上述本地后台，或另行部署到支持持久存储的服务器。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 验证与数据保护

完整检查在 `outfit-independent/` 中执行 `node scripts/run-checks.cjs`，测试使用独立临时数据。

`data/`、`.env`、数据库、模型、依赖和本机工具已排除；上传或推送时不要强制添加这些文件。当前保留本地独立版，公网测试启动入口默认停用。

## 文档

- [WORKFLOW.md](WORKFLOW.md)：用户使用流程、核心业务流程、开发与发布流程
- [TECHNICAL_OUTLINE.md](TECHNICAL_OUTLINE.md)：技术架构、模块职责、数据模型、接口清单、安全设计与路线图
- [WORK.md](WORK.md)：竞品调研、与同类产品的差距、每轮迭代的改动与验证、待办清单
- [outfit-independent/README.txt](outfit-independent/README.txt)：完整 App 的详细功能说明与迁移、部署注意事项

## 下一步

完整待办与优先级见 [WORK.md 第 5 节](WORK.md#5-待办)，近期重点：

- 白色板鞋示例照片带有品牌标识，换成无标识的照片
- 完整 App 界面沿用主页的视觉语言，统一两端风格
- 规则引擎补充更细的场合（通勤、约会、运动）
- 公网部署：HTTPS 反向代理、`APP_HOSTS` 白名单与 `COOKIE_SECURE=1` 的验收方案
