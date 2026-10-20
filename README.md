# 扫书架（ISBN Bookshelf）

一个适合手机使用的开源 ISBN 扫描书架。扫描书后的 ISBN 条码，或手动输入 ISBN，即可查询图书资料并放入“想读—在读—已读”看板。

项目保留两种互不混用的存储方式：

- **本机书架**：无需注册，数据保存在当前浏览器，可直接导出 CSV。
- **云端书架**：使用邮箱验证码登录，数据保存在自己的 Supabase 项目中，可以跨设备同步。

本项目由书店库存工具中可复用的 ISBN 扫描与查询能力精简而来，不包含入库、出库、价格、折扣、员工账号或经营报表。

## 功能

- 手机相机扫描 EAN-13 ISBN 条码，浏览器不支持 `BarcodeDetector` 时使用固定版本 ZXing。
- 手动输入并校验 ISBN-10、ISBN-13。
- 免配置直接查询 NeoDB 中文书目、Google Books 和 Open Library；也可部署独立 Supabase 聚合代理，增加豆瓣或自有国内 ISBN 接口。
- 检索不到时允许手动填写书名、作者、出版社、出版时间和封面。
- 本机或云端保存，单个书架内同一 ISBN 不重复创建。
- 添加多个标签，按标签筛选。
- 按最近添加、最早添加或书名排序。
- “想读—在读—已读”阅读状态看板。
- 导出带 UTF-8 BOM 的 CSV，可用 Excel 和 Numbers 打开。
- PWA 应用外壳，部署到 HTTPS 后可添加到手机主屏幕。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules
- 浏览器 `localStorage`
- Supabase Auth、Postgres、RLS、Edge Functions
- 静态托管平台，例如 Cloudflare Pages、Netlify 或 Vercel
- Node.js 内置测试运行器

没有前端构建框架，也没有必须安装的运行时依赖。

## 本地运行

```bash
git clone https://github.com/你的账号/isbn-bookshelf.git
cd isbn-bookshelf
npm run start
```

打开 <http://localhost:5174>。没有 Supabase 配置时，应用自动进入本机模式。

运行检查：

```bash
npm run check
```

## 可选：启用邮箱云端书架和聚合代理

1. 新建 Supabase 项目。
2. 使用 `supabase db push` 应用迁移。
3. 如需聚合代理，部署 `isbn-bookshelf-lookup` Edge Function；只使用公开中文书目时可跳过。
4. 启用邮箱登录，并将邮件模板配置为显示 `{{ .Token }}`。
5. 分别设置书架存储和查书后端的公开变量；两者可以使用不同的 Supabase 项目。
6. 执行 `npm run build:config` 生成浏览器公开配置。

完整步骤见 [部署说明](docs/部署说明.md)。

## 项目结构

```text
assets/
  app.js                 页面交互协调
  book-lookup.js         ISBN 查询适配
  local-store.js         免注册本机数据源
  supabase-store.js      邮箱登录和云端数据源
  scanner.js             手机条码识别
  ui.js                  书架与看板渲染
  csv-export.js          CSV 导出
supabase/
  migrations/            书架表和 RLS
  functions/isbn-bookshelf-lookup/ ISBN 聚合查询函数
docs/                    部署与隐私说明
tests/                   核心逻辑测试
```

## 数据与安全

- 前端只使用 Supabase publishable key；它本身是公开配置，书架数据权限由 RLS 控制。
- 查书后端与云端书架分开配置；免注册本机模式默认可直接查询 NeoDB 中文书目。
- 云端表只向 `authenticated` 角色开放，并在每个操作中校验 `auth.uid() = user_id`。
- `.env`、`assets/config.js`、Supabase 临时目录已加入 `.gitignore`。
- 第三方图书接口密钥只放在 Edge Function secrets 中。
- 本机模式不会自动把书架上传到云端。

详细说明见 [隐私说明](docs/隐私说明.md)。

## 已知限制

- 免费图书接口对中文图书的覆盖仍可能不完整，聚合结果需要用户确认。
- iPhone 和大部分手机浏览器只允许 HTTPS 页面访问相机。
- 本机模式依赖浏览器网站数据；清除数据或更换设备前应先导出。
- 首版看板通过状态选择框移动图书，没有实现触屏拖拽。

## 参考文档

- [Supabase 邮箱验证码登录](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Edge Functions 鉴权请求头](https://supabase.com/docs/guides/functions/auth-headers)
- [NeoDB API 开发者入口](https://neodb.social/developer/)

## License

[MIT](LICENSE)
