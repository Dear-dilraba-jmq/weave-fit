# 工作流程 · Weave Fit

本文说明三件事：用户怎样使用穿搭魔镜，每个核心功能在浏览器与本机后台之间怎样流转，开发者怎样修改、检查和发布。模块职责、数据表、接口参数与安全设计见 [TECHNICAL_OUTLINE.md](TECHNICAL_OUTLINE.md)。

## 1. 用户旅程

```mermaid
flowchart TD
  A["注册本地账号"] --> B["完善个人档案<br/>身材资料 · 可选面部 / 全身照"]
  B --> C["拍照入橱<br/>自动建议名称、类别、主色、季节"]
  C --> D{"怎么搭"}
  D -->|看天穿衣| E["选季节、温度、天气、场合<br/>生成规则搭配"]
  D -->|自己滑着搭| F["上装 / 下装 / 鞋子三行滑动"]
  E --> G["收藏 · 导出参考图"]
  F --> G
  E --> H["缺少的单品<br/>淘宝搜索或商品卡"]
  G --> I["可选：生成本人全身穿搭图"]
  G --> J["个人档案：备份 / 迁移到新电脑"]
```

| 阶段 | 用户做什么 | 需要外部服务 |
| --- | --- | --- |
| 注册与档案 | 注册本地账号（密码至少 10 位），填写身材资料，可选上传面部 / 全身照 | 否 |
| 拍照入橱 | 拍照或选图，确认自动建议后保存 | 否（需先下载两个本机模型） |
| 看天穿衣 | 选择季节、温度、天气和场合，可预选想穿的单品 | 否；配置文字 AI 后由 AI 出方案，并经本地规则校验 |
| 自己滑着搭 | 三行分别左右滑动，组合后查看温度提醒 | 否 |
| 收藏与参考图 | 收藏整套方案，导出含本人照片的参考图 | 否 |
| 补购 | 对缺少的单品打开淘宝搜索，或查看真实商品卡 | 搜索链接不需要；商品卡需淘宝联盟应用 |
| 本人穿搭图 | 确认授权后生成全身穿搭图 | 需图像服务或本机 FASHN |
| 备份迁移 | 导出 JSON 备份，在新电脑导入空账号 | 否 |

## 2. 核心业务流程

### 2.1 拍照入橱

```mermaid
sequenceDiagram
  participant U as 用户
  participant W as 浏览器（app.js · cutout.js）
  participant S as 本机后台 server.cjs
  participant M as 本机模型
  participant DB as SQLite
  U->>W: 拍照或选图，选择类别
  W->>S: POST /api/garment?category=上装
  S->>M: SegFormer 分割衣物
  S-->>W: 居中的 1080×1080 白底 PNG
  W->>S: POST /api/wardrobe/analyze
  S->>M: CLIP 零样本识别
  S-->>W: 名称、类别、主色、季节建议
  U->>W: 确认或修改（手动填写的字段不会被覆盖）
  W->>S: PUT /api/files?path=users/账号ID/…
  S->>DB: 校验图片内容后写入 files
  W->>S: POST /api/records（table=wardrobe_items，mode=insert）
  S->>DB: 校验必填项与图片归属后写入 records
```

- 图片先上传、记录后写入：服务端会拒绝引用不存在或不属于当前账号的图片。
- 本机同一时间只处理一张照片；忙时返回 429 并带 `Retry-After`，`cutout.js` 会自动重试识别。
- 两个模型需先用 `setup-*` 脚本下载；登录后 `GET /api/status` 会报告模型是否就绪。识别只在本机进行，季节仅按可见款式估计。

### 2.2 看天穿衣（规则搭配）

```mermaid
flowchart TD
  A["选择季节、温度、天气、场合<br/>可预选单品"] --> B["POST /api/outfits/generate"]
  B --> C["outfit-service.cjs<br/>读取本账号衣橱与档案"]
  C --> D{"已配置文字 AI？"}
  D -->|否| E["outfit-plan.js suggest()<br/>按 6 档温度挑选，过滤不适温单品"]
  D -->|是| F["调用兼容 OpenAI 的 /chat/completions"]
  F --> G{"通过本地校验？<br/>温度 · 度假风格 · 保留预选单品"}
  G -->|是| H["返回 AI 方案"]
  G -->|否或调用失败| E
  E --> I["返回规则方案<br/>单品、缺少的单品、提示与提醒"]
```

- AI 方案不合规时自动回退为规则方案，并在提醒中说明，用户总能拿到可用结果。
- 温度档位、季节默认温度等规则见 [TECHNICAL_OUTLINE.md 第 9 节](TECHNICAL_OUTLINE.md#9-搭配规则引擎)。

### 2.3 自己滑着搭

1. 三行分别来自「上装 / 外套」「下装」「鞋履」，左右滑动只更换对应一行。
2. 选定后调用 `POST /api/outfits/manual`，`itemIds` 必须按上装、下装、鞋子的顺序给出三件本账号单品。
3. 服务端用同一套规则检查温度，只给提醒（不适温、外套需另配内搭、雨雪天防滑），不替换用户的选择。

### 2.4 收藏与参考图

- 收藏写入 `outfits` 表（`POST /api/records`），方案中引用的私有图片必须属于当前账号。
- 参考图与海报由 `look.js` 和 `look-reference.js` 生成：自有单品用本人照片，待补单品用参考图或轮廓示意。

### 2.5 补购

- 每件待补单品都有「去淘宝搜索这款」，按完整款式关键词打开淘宝搜索，不需要应用凭证。
- 配置淘宝联盟应用（`TAOBAO_APP_KEY`、`TAOBAO_APP_SECRET`、`TAOBAO_ADZONE_ID`）后，页面经 `POST /api/shopping/search` 调用 `taobao.tbk.dg.material.optional.upgrade`，每件最多展示 3 个候选。
- 查询只发送单品关键词，不发送照片、档案或衣橱图片；价格以接口返回的普通售价为准。

### 2.6 本人全身穿搭图

1. `GET /api/tryon/status` 返回是否可用、本机还是远程、服务商主机名和模型。
2. 使用远程图像服务前，用户必须确认同意发送面部照片、身材资料和衣服参考图；本机 FASHN 不需要外发。
3. `POST /api/tryon`：同一账号同时只运行一个任务，每 10 分钟最多 3 次。

### 2.7 备份、迁移与恢复

```mermaid
flowchart LR
  A["旧电脑<br/>个人档案 → 导出备份"] --> B["outfit-backup.json<br/>含照片，离线保管"]
  B --> C["新电脑<br/>注册空账号"]
  C --> D{"POST /api/import<br/>逐项校验"}
  D -->|全部通过| E["事务写入<br/>图片路径改写到新账号"]
  D -->|任一失败| F["整体回滚"]
```

- 导入要求：支持的备份格式、账号为空、同一份备份未导入过、每张图片通过内容校验；大于 64MB 的备份需拆分。
- 旧网站数据可用 `scripts/prepare-import.cjs` 转为同一备份格式。
- 数据库级备份：`npm run backup`（写入 `data/backups/`）；启动器在当天还没有备份时会自动备份。
- 忘记密码：在这台电脑的交互终端运行 `npm run recover-account`，重设前自动备份，并让该账号在所有设备退出。

### 2.8 账号、会话与多标签页

- 登录后签发 7 天有效的 HttpOnly 会话；修改密码后该账号所有会话失效。
- 同一浏览器的另一个标签页切换账号时，`local-api.js` 会中止旧账号的请求；每个私有请求都带 `x-outfit-owner`，服务端发现账号不一致时返回 409，页面提示刷新。

## 3. 开发工作流

### 3.1 准备环境

```sh
cd outfit-independent
npm install                              # 含 devDependencies（测试需要 jsdom）
node scripts/setup-garment-model.cjs     # 可选：衣物分割模型
node scripts/setup-item-recognizer.cjs   # 可选：单品识别模型
npm start                                # 或 node launch.cjs（显示局域网地址）
```

需要可选服务时，把 `.env.example` 复制为 `.env` 后在本机填写；`.env` 已被 `.gitignore` 排除。

### 3.2 修改原则

每次改动遵循：先找已有实现 → 定位根因 → 选最小改动 → 复用已有模块 → 审查实际 diff → 运行相关检查 → 如实记录结果。本项目的具体约定：

| 内容 | 唯一维护位置 | 使用方 |
| --- | --- | --- |
| 温度 / 季节 / 场合规则 | `outfit-independent/public/outfit-plan.js` | 后台 `outfit-service.cjs`、App 前端、项目主页 |
| 风格词库与搭配风格 | `outfit-independent/public/style-guide.js` | 规则引擎、App、主页 |
| 单品颜色、轮廓示意、搭配板 | `outfit-independent/public/look-reference.js` | App、主页（待补单品） |
| 主页面料质感渲染 | `homepage/fabric.js` | 仅项目主页 |
| 记录字段校验与衣物类别 | `outfit-independent/validation.cjs` | 后台接口 |

- 不要在主页或其他文件复制一份规则；规则改动同时影响后台、App 和主页，改后运行 `npm test` 并打开主页确认。
- 新增接口：在 `server.cjs` 的方法表登记允许的请求方式，设置请求体上限和 `rate()` 限流（`/api/` 默认要求登录），并在 `test/` 补测试。
- `public/` 中的静态文件按扩展名白名单提供，新增文件后需重启服务；需要离线缓存的文件同时加入 `sw.js` 的 `STATIC` 列表。

### 3.3 运行与调试

| 手段 | 用途 |
| --- | --- |
| `npm run diagnose` | 检查 Node 版本、依赖和本机模型是否就绪 |
| `data/logs/server.log` | 启动器写入的后台日志（不会作为网页公开） |
| `GET /api/status`（登录后） | 版本、存储、规则、模型与可选服务的就绪状态 |
| `GET /api/health` | 不需要登录的健康检查 |

### 3.4 测试

| 命令 | 内容 |
| --- | --- |
| `npm test` | `node --test test/*.test.cjs`：接口、账号隔离、校验、规则、搭配服务、识别、补购、试穿、Service Worker 等 |
| `npm run test:all` | `scripts/run-checks.cjs`：上述测试 + `test/ui-check.cjs`（jsdom 界面流程）+ `test/account-switch-check.cjs`（多标签页账号切换） |

`run-checks.cjs` 会清空全部外部服务密钥再运行，测试不会调用真实的 AI、图像服务或淘宝接口，并使用独立的临时数据。

### 3.5 项目主页开发

1. 主页由 `index.html`、`homepage/home.css`、`homepage/home.js`、`homepage/fabric.js` 组成，并加载 App 的 `style-guide.js`、`outfit-plan.js`、`look-reference.js` 和 `icon.svg`。
2. 在仓库根目录启动静态服务器预览：

   ```sh
   python -m http.server 8765
   ```

   打开 `http://127.0.0.1:8765/`。用静态服务器预览最接近 Pages 的实际环境。
3. 至少检查：桌面宽度与 375px 手机宽度没有横向滚动；开柜动画、点选单品放进魔镜、三行滑动、温度预报都能使用；系统开启「减少动态效果」时动画收敛；控制台没有报错。
4. 示例单品只写在 `home.js` 的示例衣橱里，主页不读取任何个人数据。

### 3.6 发布 GitHub Pages

```sh
node scripts/build-pages.cjs
git add index.html homepage docs
git commit -m "Update project homepage"
git push
```

- `build-pages.cjs` 会重建 `docs/homepage/` 和 `docs/outfit-independent/`，复制主页及其依赖的公开脚本，并写入 `.nojekyll`；`docs/` 中的其他文件保持不变。
- 仓库 Settings → Pages 选择 Deploy from a branch，分支 `main`，目录 `/docs`。
- 发布目录不包含 `data/`、`.env`、模型或任何个人照片。

### 3.7 版本号与缓存

- App 版本记录在 `outfit-independent/package.json`，`GET /api/status` 返回的版本写在 `server.cjs`，发版时两处保持一致。
- `sw.js` 对静态文件采用网络优先、离线回退缓存。修改 `STATIC` 列表或希望清理旧缓存时，更新 `CACHE` 名称（当前为 `outfit-mirror-independent-v25`）；新版本激活时会删除旧缓存。

### 3.8 提交前检查清单

- [ ] `git status` 和 `git diff` 已逐项审查，没有混入无关改动
- [ ] 提交中没有 `data/`、`.env`、`*.sqlite`、`models/`、`node_modules/`、日志或个人照片
- [ ] 改动了后台或规则：`npm test` 通过；改动了界面：`npm run test:all` 通过
- [ ] 改动了主页：已在浏览器检查桌面与手机宽度，并运行 `node scripts/build-pages.cjs`
- [ ] 需要时已更新版本号与 `sw.js` 缓存名
- [ ] README、WORKFLOW、TECHNICAL_OUTLINE 中受影响的描述已同步

## 4. 数据与密钥规则

- 密钥只写在本机 `outfit-independent/.env`，由后台读取，不发送到浏览器，也不写入备份。
- 数据库、日志和备份都在 `data/`，已被 `.gitignore` 排除；推送时不要用 `git add -f` 强制添加。
- 完整备份 JSON 含本人照片，请离线保管，不要上传到仓库或公开网盘。
- 公网测试入口默认停用；如需用域名访问，先配置 HTTPS 反向代理、`APP_HOSTS` 和 `COOKIE_SECURE=1`，部署注意事项见 [outfit-independent/README.txt](outfit-independent/README.txt)。
