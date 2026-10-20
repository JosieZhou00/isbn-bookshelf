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
  lookupSupabaseUrl: readConfigValue("LOOKUP_SUPABASE_URL", fileEnv),
  lookupSupabasePublishableKey: readConfigValue("LOOKUP_SUPABASE_PUBLISHABLE_KEY", fileEnv),
  lookupFunctionName: readConfigValue("LOOKUP_FUNCTION_NAME", fileEnv) || "isbn-bookshelf-lookup",
  appUrl: readConfigValue("APP_URL", fileEnv)
};

writeFileSync(outputPath, `// 本文件由 scripts/generate-config.mjs 生成，不应提交到 Git。\nwindow.ISBN_BOOKSHELF_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
const storageMessage = config.supabaseUrl && config.supabasePublishableKey ? "云端书架已配置" : "本机书架模式";
const lookupMessage = config.lookupSupabaseUrl && config.lookupSupabasePublishableKey ? "聚合查书代理已配置" : "使用公开中文书目（未配置聚合代理）";
console.log(`已生成配置：${storageMessage}，${lookupMessage}。`);
