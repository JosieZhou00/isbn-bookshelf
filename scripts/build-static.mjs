// 本文件生成 GitHub Pages 使用的纯静态 dist 目录，并写入不含密钥的公开配置。
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
writeFileSync(resolve(outputRoot, "assets/config.js"), "// GitHub Pages 公开配置：默认使用免注册本机书架。\nwindow.ISBN_BOOKSHELF_CONFIG = {};\n");
writeFileSync(resolve(outputRoot, ".nojekyll"), "");
console.log(`已生成 GitHub Pages 文件：${outputRoot}`);
