// 本文件封装 ISBN 查书，优先使用配置的 Supabase 函数，再尝试公开图书接口。
import { CONFIG, normalizeBook, normalizeIsbn } from "./utils.js";
import { getVerifiedBookByIsbn } from "./verified-books.js";

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

// 读取独立查书配置；未单独填写时兼容使用云端书架项目。
export function getLookupBackendConfig() {
  return {
    url: CONFIG.lookupSupabaseUrl || CONFIG.supabaseUrl || "",
    key: CONFIG.lookupSupabasePublishableKey || CONFIG.supabasePublishableKey || "",
    functionName: CONFIG.lookupFunctionName || "isbn-bookshelf-lookup"
  };
}

// 调用 Supabase Edge Function，公开密钥放在 apikey 请求头中。
async function lookupByBackend(isbn, accessToken = "") {
  const backend = getLookupBackendConfig();
  if (!backend.url || !backend.key) return null;
  const endpoint = `${backend.url.replace(/\/$/, "")}/functions/v1/${encodeURIComponent(backend.functionName)}?isbn=${encodeURIComponent(isbn)}`;
  const headers = { apikey: backend.key };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  else if (/^eyJ[^.]+\.[^.]+\.[^.]+$/.test(backend.key)) headers.Authorization = `Bearer ${backend.key}`;
  const response = await fetchWithTimeout(endpoint, { headers });
  if (!response.ok) throw new Error(`云端查书返回 ${response.status}`);
  const result = await response.json();
  return result.found ? normalizeBook({ ...result.book, source: result.source }) : null;
}

// 去掉作者名前容易出错的国籍前缀，保留可检索的人名主体。
function cleanAuthor(value) {
  return String(value || "").replace(/^[（(][^）)]{1,12}[）)]\s*/, "").trim();
}

// 把 NeoDB 返回的中文书目字段整理为应用内部结构。
export function normalizeNeoDbBook(isbn, item = {}) {
  if (!item.title && !item.display_title) return null;
  const title = String(item.display_title || item.title || "").trim();
  const subtitle = String(item.subtitle || "").trim();
  return normalizeBook({
    isbn,
    title: subtitle && !title.includes(subtitle) ? `${title}：${subtitle}` : title,
    authors: Array.isArray(item.author) ? item.author.map(cleanAuthor).filter(Boolean) : [],
    publisher: item.pub_house || "",
    published_date: item.pub_year || "",
    cover_url: item.cover_image_url || "",
    source: "NeoDB 中文书目"
  });
}

// 直接查询 NeoDB 公共目录，为免注册模式提供中文书目资料。
async function lookupNeoDb(isbn) {
  const params = new URLSearchParams({ category: "book", query: isbn });
  const response = await fetchWithTimeout(`https://neodb.social/api/catalog/search?${params}`);
  if (!response.ok) return null;
  const result = await response.json();
  const items = Array.isArray(result?.data) ? result.data : [];
  const item = selectExactNeoDbItem(isbn, items);
  return normalizeNeoDbBook(isbn, item);
}

// 只接受 ISBN 完全一致的 NeoDB 结果，避免把相似号码的第一条结果当作目标书籍。
export function selectExactNeoDbItem(isbn, items = []) {
  return items.find((entry) => normalizeIsbn(entry.isbn) === normalizeIsbn(isbn)) || null;
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
  const verifiedBook = getVerifiedBookByIsbn(isbn);
  if (verifiedBook) return verifiedBook;
  for (const lookup of [(value) => lookupByBackend(value, accessToken), lookupNeoDb, lookupGoogleBooks, lookupOpenLibrary]) {
    try {
      const book = await lookup(isbn);
      if (book?.title) return book;
    } catch (error) {
      errors.push(error.name === "AbortError" ? "查询超时" : error.message);
    }
  }
  const lookupStatus = errors.length ? "source-error" : "not-found";
  return { ...normalizeBook({ isbn, source: "手动录入" }), lookup_status: lookupStatus, errors };
}
