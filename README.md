# 穿搭魔镜 · Weave Fit

整理自己的衣橱，按季节、温度和场合寻找搭配灵感。支持上装、下装、鞋子三行独立滑动，自己组合并收藏。

仓库根目录的 [index.html](index.html) 是可直接展示的项目主页，包含手机适配和不需要登录的搭配演示。示例图片为 AI 款式参考或服装轮廓示意，不是真实商品或本人试穿图。

## 项目结构

```text
index.html             项目主页
homepage/              主页样式和演示交互
docs/                  GitHub Pages 发布目录
outfit-independent/    完整 App 前端、Node.js 后台和测试
启动独立版.cmd          Windows 启动入口
```

## 运行完整 App

安装 Node.js 24 或更新版本，在下载的项目中执行：

```sh
cd outfit-independent
npm install
node launch.cjs
```

启动器会显示电脑地址及同一 Wi-Fi 的手机地址。安装依赖后，Windows 也可双击根目录的「启动独立版.cmd」。

首次使用需注册本地账号。已有独立版用户要迁移到另一台电脑时，应从旧版个人档案导出自己的备份，再导入新电脑的空账号；本仓库不包含任何真实账号、衣橱数据库或个人照片。

上传单品照片后，完整 App 会自动建议名称、类别、主色和季节；可修改后保存，手动填写过的内容不会被自动结果覆盖。识别在本机进行，季节仅按可见款式估计。

如需本机衣物分割和自动填写，另行下载两个模型：

```sh
node scripts/setup-garment-model.cjs
node scripts/setup-item-recognizer.cjs
```

按温度生成规则搭配、手动组合、衣橱管理与收藏不需要外部 AI。自动本人全身穿搭图、文字 AI 和淘宝真实商品卡需要分别配置服务，见 [完整说明](outfit-independent/README.txt) 与 [环境配置示例](outfit-independent/.env.example)。密钥仅在本机配置。

## GitHub Pages 项目主页

Pages 发布来源为 `main` 分支的 `/docs`。修改主页后运行：

```sh
node scripts/build-pages.cjs
```

将更新后的根目录主页和 `docs/` 一起提交即可。发布目录只包含主页、示例图片和演示代码。

GitHub Pages 是静态托管：可以展示本主页与搭配演示，不能运行 Node.js、SQLite、账号登录、照片上传或本机模型。完整 App 需要上述本地后台，或另行部署到支持持久存储的服务器。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 验证与数据保护

完整检查在 `outfit-independent/` 中执行 `node scripts/run-checks.cjs`，测试使用独立临时数据。

`data/`、`.env`、数据库、模型、依赖和本机工具已排除；上传或推送时不要强制添加这些文件。当前保留本地独立版，公网测试启动入口默认停用。
