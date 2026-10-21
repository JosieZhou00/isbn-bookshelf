// 本文件生成 GitHub Pages 使用的纯静态 dist 目录，并写入只包含 publishable key 的公开配置。
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "dist");

// 将单个发布文件复制到 dist 中的对应位置。
function copyFile(relativePath) {
  const target = resolve(outputRoot, relativePath);
  mkdirSync(resolve(target, ".."), { recursive: true });
  cpSync(resolve(projectRoot, relativePath), target);
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(resolve(outputRoot, "assets"), { recursive: true });

const files = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "assets/app.js",
  "assets/book-lookup.js",
  "assets/csv-export.js",
  "assets/demo-store.js",
  "assets/i18n.js",
  "assets/icon.svg",
  "assets/local-store.js",
  "assets/scanner.js",
  "assets/styles.css",
  "assets/supabase-store.js",
  "assets/ui.js",
  "assets/utils.js",
  "assets/verified-books.js"
];

files.forEach(copyFile);
const publicConfig = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  lookupSupabaseUrl: process.env.LOOKUP_SUPABASE_URL || process.env.SUPABASE_URL || "",
  lookupSupabasePublishableKey: process.env.LOOKUP_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  lookupFunctionName: process.env.LOOKUP_FUNCTION_NAME || "isbn-bookshelf-lookup",
  appUrl: process.env.APP_URL || "https://josiezhou00.github.io/isbn-bookshelf/"
};
writeFileSync(
  resolve(outputRoot, "assets/config.js"),
  `// GitHub Pages 公开配置：只允许写入 Supabase publishable key。\nwindow.ISBN_BOOKSHELF_CONFIG = ${JSON.stringify(publicConfig, null, 2)};\n`
);
writeFileSync(resolve(outputRoot, ".nojekyll"), "");
console.log(`已生成 GitHub Pages 文件：${outputRoot}`);
