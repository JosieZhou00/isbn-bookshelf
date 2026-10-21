# 书迹 ISBN Bookshelf

[English](README.md) | [中文](README.zh-CN.md)

[![核心检查](https://github.com/JosieZhou00/isbn-bookshelf/actions/workflows/pages.yml/badge.svg)](https://github.com/JosieZhou00/isbn-bookshelf/actions/workflows/pages.yml)
[![在线使用](https://img.shields.io/badge/GitHub%20Pages-在线使用-23483e)](https://josiezhou00.github.io/isbn-bookshelf/)
[![License: MIT](https://img.shields.io/badge/License-MIT-c8754f.svg)](LICENSE)

一个适合手机使用的开源 ISBN 阅读书架。扫描书后的 ISBN 条码，或手动输入 ISBN，即可查询图书资料，并通过“想读—在读—已读”看板管理阅读状态。

> [直接使用个人书架](https://josiezhou00.github.io/isbn-bookshelf/) · [查看两本书的演示书架](https://josiezhou00.github.io/isbn-bookshelf/?demo=1#shelf)

网页默认使用英文。点击页首的 `中文` 按钮可以切换为中文，浏览器会记住语言选择。

演示模式使用项目作者授权的两本书作为展示数据，只包含公开书目信息和阅读状态，不包含私人备注。演示操作只保存在当前页面会话，不会写入访客的个人书架。

## 页面展示

演示书架当前包含：

| 阅读状态 | 书名 | 作者 | ISBN |
| --- | --- | --- | --- |
| 想读 | 四开01：工作，就要不拘一格：向会工作的人请教，不拘一格的工作术 | 王牧之 主编 | 9787574002067 |
| 想读 | 看见她们：ADHD女性的困境 | 洛塔·博里·斯科格隆 | 9787522208183 |

打开演示后可以体验书架排序、阅读状态切换、看板、编辑和 CSV 导出。点击右上角“退出演示”即可返回自己的本机书架。

## 主要功能

- 使用手机相机扫描 EAN-13 ISBN 条码；浏览器不支持 `BarcodeDetector` 时加载固定版本 ZXing。
- 支持手动输入并校验 ISBN-10、ISBN-13。
- 依次查询 NeoDB 中文书目、Google Books 和 Open Library，只接受 ISBN 完全一致的记录。
- 未检索到书目时保留 ISBN 并打开手动填写表单，不使用相似 ISBN 代替。
- 无需注册即可使用本机书架，数据保存在当前浏览器。
- 可选 Supabase 邮箱登录链接，实现不同设备同步。
- 添加标签，按标签筛选，并按添加时间或书名排序。
- 使用“想读—在读—已读”看板管理阅读状态。
- 导出带 UTF-8 BOM 的 CSV，可使用 Excel 或 Numbers 打开。
- 支持 PWA；通过 HTTPS 访问时可添加到手机主屏幕。
- 支持英文与中文切换，不修改书名、作者、备注和标签等原始数据。

## 数据模式

| 模式 | 是否登录 | 保存位置 | 用途 |
| --- | --- | --- | --- |
| 本机书架 | 否 | 当前浏览器 `localStorage` | 默认个人使用 |
| 演示书架 | 否 | 当前页面内存 | 公开展示，不影响个人数据 |
| 云端书架 | 邮箱登录链接 | 自己的 Supabase 项目 | 跨设备同步 |

三种模式互不自动迁移。使用本机书架时，请定期导出 CSV；清除浏览器网站数据会同时删除本机书架。

## 本地运行

```bash
git clone https://github.com/JosieZhou00/isbn-bookshelf.git
cd isbn-bookshelf
npm run start
```

打开 <http://localhost:5174>。没有 Supabase 配置时，应用自动进入免注册本机模式。

运行核心检查：

```bash
npm run check
```

生成与 GitHub Pages 相同的静态文件：

```bash
npm run build
```

输出目录为 `dist/`，其中的公开配置不包含密钥。

## GitHub Pages 发布

仓库使用 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 自动发布：

1. `main` 分支更新后运行语法检查和测试。
2. 执行 `npm run build` 生成纯静态 `dist/`。
3. 仅上传 `dist/`，不会上传 `.env`、本地配置或 Supabase 临时文件。
4. 检查通过后更新 GitHub Pages。

如首次发布未自动启用 Pages，可在仓库 `Settings → Pages` 中将 Source 设为 `GitHub Actions`，再重新运行工作流。

## 可选：邮箱云端书架与聚合查书后端

1. 新建 Supabase 项目。
2. 使用 `supabase db push` 应用迁移。
3. 启用邮箱登录，并将正式站点加入允许的回调地址。免费版使用 Supabase 默认邮件登录链接。
4. 部署 `isbn-bookshelf-lookup` Edge Function，让手机通过聚合后端查询中文书目；函数包含缓存、来源限制和频率保护。
5. 将公开配置写入 `.env`，执行 `npm run build:config`。

完整步骤见 [部署说明](docs/部署说明.md)。第三方接口密钥只能存放在 Edge Function secrets 中，不应写入前端或提交到 GitHub。

## 项目结构

```text
assets/
  app.js                 页面交互协调
  i18n.js                中英文界面文本与语言切换
  book-lookup.js         ISBN 查询与查无结果处理
  local-store.js         免注册本机数据源
  demo-store.js          两本书的内存演示数据源
  supabase-store.js      邮箱登录和云端数据源
  scanner.js             手机条码识别
  ui.js                  书架与阅读看板渲染
  csv-export.js          CSV 导出
scripts/
  build-static.mjs       生成 GitHub Pages 静态文件
supabase/
  migrations/            书架表和 RLS
  functions/             ISBN 聚合查询函数
tests/                   核心逻辑测试
```

## 隐私与安全

- 默认本机模式不会把书架上传到项目作者或第三方数据库。
- 查询 ISBN 时会向相应书目服务发送 ISBN，不会发送本机书架、标签或备注。
- 演示数据不含用户备注，也不会读取访客的个人书架。
- 云端表只向 `authenticated` 角色开放，并校验 `auth.uid() = user_id`。
- `.env`、`assets/config.js`、`dist/` 和 Supabase 临时目录均不提交到仓库；网页只接收 Supabase publishable key。

更多说明见 [隐私说明](docs/隐私说明.md)。

## 已知限制

- 免费图书接口对中文图书的覆盖不完整；未找到精确书目时需要手动填写。
- iPhone 和多数手机浏览器只允许 HTTPS 页面访问相机。
- 本机模式依赖浏览器网站数据，更换浏览器或清除数据前应先导出。
- 阅读看板通过状态选择框移动书籍，暂未提供触屏拖拽。

## License

[MIT](LICENSE)
