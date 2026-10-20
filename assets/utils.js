// 本文件提供 ISBN 校验、标签整理、日期格式化和安全输出等通用函数。
export const CONFIG = typeof window === "undefined" ? {} : (window.ISBN_BOOKSHELF_CONFIG || {});

export const READING_STATUSES = [
  { value: "want", label: "想读" },
  { value: "reading", label: "在读" },
  { value: "read", label: "已读" }
];

// 判断前端是否已经填写 Supabase 公开配置。
export function hasCloudConfig() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabasePublishableKey);
}

// 清理 ISBN 中的空格和不同形式的连字符。
export function normalizeIsbn(value) {
  return String(value || "").replace(/[\s\-–—]/g, "").trim();
}

// 校验 ISBN-10 或 ISBN-13 的长度与校验位。
export function isValidIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }
  if (/^\d{9}[\dXx]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + (digit.toUpperCase() === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  return false;
}

// 将逗号、顿号或数组形式的标签整理为去重数组。
export function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
  const seen = new Set();
  return source.map((tag) => String(tag).trim()).filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 将未知阅读状态约束到三个允许值。
export function normalizeStatus(value) {
  return READING_STATUSES.some((status) => status.value === value) ? value : "want";
}

// 返回阅读状态对应的中文名称。
export function statusLabel(value) {
  return READING_STATUSES.find((status) => status.value === normalizeStatus(value))?.label || "想读";
}

// 生成浏览器和测试环境都可使用的轻量 ID。
export function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 将书籍字段整理为统一的数据结构。
export function normalizeBook(book = {}) {
  const now = new Date().toISOString();
  return {
    id: book.id || createId(),
    isbn: normalizeIsbn(book.isbn),
    title: String(book.title || "").trim(),
    authors: Array.isArray(book.authors) ? book.authors.map(String).filter(Boolean) : String(book.authors || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    publisher: String(book.publisher || "").trim(),
    published_date: String(book.published_date || "").trim(),
    cover_url: String(book.cover_url || "").trim(),
    tags: normalizeTags(book.tags),
    reading_status: normalizeStatus(book.reading_status),
    notes: String(book.notes || "").trim(),
    source: String(book.source || "手动录入"),
    created_at: book.created_at || now,
    updated_at: book.updated_at || now
  };
}

// 转义插入 HTML 模板的文本，防止书名或标签破坏页面结构。
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

// 把时间转换为简短的中文日期。
export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

// 生成适合导出文件名使用的本地日期戳。
export function dateStamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// 保存文本文件，优先调用系统文件选择器或分享面板。
export async function saveTextFile(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff", text], { type });
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "CSV 文件", accept: { "text/csv": [".csv"] } }] });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "已保存到选择的位置";
  }
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return "已打开系统保存或分享面板";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return "已下载 CSV 文件";
}
