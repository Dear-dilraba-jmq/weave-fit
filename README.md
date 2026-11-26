# 穿搭魔镜 · Weave Fit

整理自己的衣橱，按季节、温度和场合寻找搭配灵感。支持上装、下装、鞋子三行独立滑动，自己组合并收藏。

> **English summary** — Weave Fit is a local-first digital wardrobe. Photograph your clothes, let on-device models fill in name, category, colour and season, then build outfits by temperature-aware rules or by swiping three rows (tops, bottoms, shoes) yourself. Everything runs on your own computer with Node.js 24 and SQLite; text AI, try-on images and Taobao product cards are optional add-ons you configure locally.

仓库根目录的 [index.html](index.html) 是可直接展示的项目主页：打开衣橱的动画、点选单品放进魔镜、三行滑动试搭、拖动温度看规则搭配，均支持手机且不需要登录。主页示例单品为浏览器内绘制的面料质感示意（待补款式为轮廓示意），不是真实商品或本人试穿图。

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
index.html              项目主页（衣橱动画、魔镜试搭、看天穿衣）
homepage/               主页样式 home.css、交互 home.js、面料渲染 fabric.js
docs/                   GitHub Pages 发布目录（由 scripts/build-pages.cjs 生成）
scripts/build-pages.cjs 把主页及其依赖同步到 docs/
outfit-independent/     完整 App：前端 public/、Node.js 后台、脚本 scripts/、测试 test/
WORKFLOW.md             用户流程、业务流程与开发/发布流程
TECHNICAL_OUTLINE.md    架构、模块、数据模型、接口、安全与路线图
启动独立版.cmd           Windows 启动入口
```

主页直接复用完整 App 的 `style-guide.js`、`outfit-plan.js`（温度规则）和 `look-reference.js`（待补款式轮廓），演示结果与 App 的本地规则一致。

## 运行完整 App

安装 Node.js 24 或更新版本，在下载的项目中执行：

```sh
cd outfit-independent
npm install
node launch.cjs
```

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

将更新后的根目录主页和 `docs/` 一起提交即可。发布目录只包含主页、演示代码和图标。本地预览可在仓库根目录启动任意静态服务器，例如 `python -m http.server 8765`，再打开 `http://127.0.0.1:8765/`。

GitHub Pages 是静态托管：可以展示本主页与搭配演示，不能运行 Node.js、SQLite、账号登录、照片上传或本机模型。完整 App 需要上述本地后台，或另行部署到支持持久存储的服务器。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 验证与数据保护

完整检查在 `outfit-independent/` 中执行 `node scripts/run-checks.cjs`，测试使用独立临时数据。

`data/`、`.env`、数据库、模型、依赖和本机工具已排除；上传或推送时不要强制添加这些文件。当前保留本地独立版，公网测试启动入口默认停用。

## 文档

- [WORKFLOW.md](WORKFLOW.md)：用户使用流程、核心业务流程、开发与发布流程
- [TECHNICAL_OUTLINE.md](TECHNICAL_OUTLINE.md)：技术架构、模块职责、数据模型、接口清单、安全设计与路线图
- [outfit-independent/README.txt](outfit-independent/README.txt)：完整 App 的详细功能说明与迁移、部署注意事项

## 下一步

- 完整 App 界面沿用主页的衣橱 / 魔镜视觉语言，统一两端风格
- 规则引擎补充更细的场合（通勤、约会、运动）与雨雪天鞋履约束
- 为主页演示加入更多面料（亚麻、灯芯绒、皮革外套）与配饰
- 公网部署：HTTPS 反向代理、`APP_HOSTS` 白名单与 `COOKIE_SECURE=1` 的验收方案
