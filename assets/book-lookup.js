// 本文件封装 ISBN 查书，优先使用配置的 Supabase 函数，再尝试公开图书接口。
import { CONFIG, normalizeBook, normalizeIsbn } from "./utils.js";

// 为外部请求设置超时，避免移动网络下长时间停留在加载状态。
async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 调用 Supabase Edge Function，公开密钥放在 apikey 请求头中。
async function lookupByBackend(isbn, accessToken = "") {
  if (!CONFIG.supabaseUrl || !CONFIG.supabasePublishableKey) return null;
  const endpoint = `${CONFIG.supabaseUrl.replace(/\/$/, "")}/functions/v1/book-lookup?isbn=${encodeURIComponent(isbn)}`;
  const headers = { apikey: CONFIG.supabasePublishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetchWithTimeout(endpoint, { headers });
  if (!response.ok) throw new Error(`云端查书返回 ${response.status}`);
  const result = await response.json();
  return result.found ? normalizeBook({ ...result.book, source: result.source }) : null;
}

// 直接查询 Google Books，作为未配置 Supabase 时的零成本后备来源。
async function lookupGoogleBooks(isbn) {
  const response = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
  if (!response.ok) return null;
  const volume = (await response.json()).items?.[0]?.volumeInfo;
  if (!volume?.title) return null;
  return normalizeBook({
    isbn,
    title: volume.title,
    authors: volume.authors || [],
    publisher: volume.publisher || "",
    published_date: volume.publishedDate || "",
    cover_url: String(volume.imageLinks?.thumbnail || "").replace("http://", "https://"),
    source: "Google Books"
  });
}

// 直接查询 Open Library，补充 Google Books 未覆盖的 ISBN。
async function lookupOpenLibrary(isbn) {
  const response = await fetchWithTimeout(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.title) return null;
  return normalizeBook({
    isbn,
    title: data.title,
    authors: [],
    publisher: data.publishers?.[0] || "",
    published_date: data.publish_date || "",
    cover_url: data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg` : "",
    source: "Open Library"
  });
}

// 按优先级查询各数据源，失败时返回可继续手动填写的书籍骨架。
export async function lookupBookByIsbn(rawIsbn, accessToken = "") {
  const isbn = normalizeIsbn(rawIsbn);
  const errors = [];
  for (const lookup of [(value) => lookupByBackend(value, accessToken), lookupGoogleBooks, lookupOpenLibrary]) {
    try {
      const book = await lookup(isbn);
      if (book?.title) return book;
    } catch (error) {
      errors.push(error.name === "AbortError" ? "查询超时" : error.message);
    }
  }
  return normalizeBook({ isbn, source: "手动录入", errors });
}
