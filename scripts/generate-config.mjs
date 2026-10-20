// 本文件把部署环境变量转换为浏览器可读取的公开配置，不处理任何服务端密钥。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const envPath = resolve(projectRoot, ".env");
const outputPath = resolve(projectRoot, "assets/config.js");

// 解析简单 KEY=VALUE 格式，并保留值中的等号。
function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

// 从进程变量优先读取配置，本地缺少时回退到 .env。
function readConfigValue(name, fileEnv) {
  return process.env[name] || fileEnv[name] || "";
}

const fileEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const config = {
  supabaseUrl: readConfigValue("SUPABASE_URL", fileEnv),
  supabasePublishableKey: readConfigValue("SUPABASE_PUBLISHABLE_KEY", fileEnv),
  appUrl: readConfigValue("APP_URL", fileEnv)
};

writeFileSync(outputPath, `// 本文件由 scripts/generate-config.mjs 生成，不应提交到 Git。\nwindow.ISBN_BOOKSHELF_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log(config.supabaseUrl && config.supabasePublishableKey ? "已生成云端配置。" : "已生成本机模式配置；未填写 Supabase 变量。 ");
