// 本文件运行在 Supabase Edge Functions，按 ISBN 聚合图书数据，并提供缓存、来源限制与频率保护。
const DEFAULT_ALLOWED_ORIGINS = [
  "https://josiezhou00.github.io",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
];
const DEFAULT_RATE_LIMIT = 30;
const FOUND_CACHE_SECONDS = 60 * 60 * 24 * 30;
const NOT_FOUND_CACHE_SECONDS = 60 * 60 * 6;

type CacheRecord = {
  found: boolean;
  source: string;
  book: BookPayload | null;
};

type BookPayload = {
  isbn: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  published_date?: string;
  cover_url?: string;
};

// 读取允许访问函数的网页来源，部署时可通过逗号分隔的环境变量覆盖。
function getAllowedOrigins(): Set<string> {
  const configured = String(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

// 判断请求来源是否允许；没有 Origin 的服务端诊断请求仍需通过 API key 和限流。
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || getAllowedOrigins().has(origin);
}

// 按请求来源生成跨域响应头，避免任意网页直接消耗查询额度。
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && getAllowedOrigins().has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// 清理 ISBN 中的空格和不同形式的连字符。
function normalizeIsbn(value: string | null): string {
  return String(value || "").replace(/[\s\-–—]/g, "").trim();
}

// 校验 ISBN-10 或 ISBN-13 的校验位。
function isValidIsbn(value: string): boolean {
  if (/^\d{13}$/.test(value)) {
    const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(value[12]);
  }
  if (/^\d{9}[\dXx]$/.test(value)) {
    const sum = [...value].reduce((total, digit, index) => total + (digit.toUpperCase() === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  return false;
}

// 返回带跨域响应头的 JSON。
function json(request: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), ...extraHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

// 读取托管环境提供的公开 API key，兼容新 publishable key 与 legacy anon key。
function getAllowedPublicKeys(): Set<string> {
  const keys = new Set<string>();
  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyKey) keys.add(legacyKey);
  try {
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    Object.values(publishableKeys).forEach((key) => {
      if (typeof key === "string" && key) keys.add(key);
    });
  } catch (error) {
    console.warn("无法解析 SUPABASE_PUBLISHABLE_KEYS", error);
  }
  return keys;
}

// 仅允许携带当前项目公开 key 的浏览器请求进入查询逻辑。
function hasValidPublicKey(request: Request): boolean {
  const requestKey = request.headers.get("apikey") || "";
  return Boolean(requestKey && getAllowedPublicKeys().has(requestKey));
}

// 读取只存在于 Edge Function 环境的服务端密钥，用于访问受 RLS 保护的缓存和限流表。
function getServerSecretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
    const firstKey = Object.values(keys).find((value) => typeof value === "string" && value);
    if (typeof firstKey === "string") return firstKey;
  } catch (error) {
    console.warn("无法解析 SUPABASE_SECRET_KEYS", error);
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

// 生成服务端调用 Supabase REST API 所需的请求头。
function getAdminHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> | null {
  const key = getServerSecretKey();
  if (!key) return null;
  const headers: Record<string, string> = { apikey: key, ...extraHeaders };
  if (/^eyJ[^.]+\.[^.]+\.[^.]+$/.test(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

// 对客户端网络标识做不可逆哈希，限流表不保存原始 IP。
async function getClientHash(request: Request): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  const salt = Deno.env.get("RATE_LIMIT_SALT") || Deno.env.get("SUPABASE_URL") || "isbn-bookshelf";
  const bytes = new TextEncoder().encode(`${salt}:${client}:${agent.slice(0, 160)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

// 调用数据库中的原子计数函数，限制同一客户端每分钟的查询次数。
async function consumeLookupQuota(request: Request): Promise<boolean> {
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const headers = getAdminHeaders({ "Content-Type": "application/json" });
  if (!projectUrl || !headers) return true;
  const configuredLimit = Number(Deno.env.get("LOOKUP_RATE_LIMIT_PER_MINUTE") || DEFAULT_RATE_LIMIT);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(configuredLimit, 300)) : DEFAULT_RATE_LIMIT;
  const response = await fetch(`${projectUrl.replace(/\/$/, "")}/rest/v1/rpc/consume_book_lookup_quota`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_client_hash: await getClientHash(request),
      p_window_start: new Date().toISOString(),
      p_limit: limit,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    console.warn("ISBN 查询限流检查失败", response.status);
    return true;
  }
  return Boolean(await response.json());
}

// 读取仍在有效期内的 ISBN 查询缓存。
async function readLookupCache(isbn: string): Promise<CacheRecord | null> {
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const headers = getAdminHeaders();
  if (!projectUrl || !headers) return null;
  const params = new URLSearchParams({
    select: "found,source,book",
    isbn: `eq.${isbn}`,
    expires_at: `gt.${new Date().toISOString()}`,
    limit: "1",
  });
  const response = await fetch(`${projectUrl.replace(/\/$/, "")}/rest/v1/book_lookup_cache?${params}`, {
    headers,
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    console.warn("ISBN 查询缓存读取失败", response.status);
    return null;
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as CacheRecord : null;
}

// 写入查询结果；已找到的书缓存三十天，未找到的 ISBN 缓存六小时。
async function writeLookupCache(isbn: string, value: CacheRecord): Promise<void> {
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const headers = getAdminHeaders({
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
  });
  if (!projectUrl || !headers) return;
  const maxAge = value.found ? FOUND_CACHE_SECONDS : NOT_FOUND_CACHE_SECONDS;
  const response = await fetch(`${projectUrl.replace(/\/$/, "")}/rest/v1/book_lookup_cache?on_conflict=isbn`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      isbn,
      found: value.found,
      source: value.source,
      book: value.book,
      expires_at: new Date(Date.now() + maxAge * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) console.warn("ISBN 查询缓存写入失败", response.status);
}

// 去掉作者名前容易出错的国籍前缀，保留可检索的人名主体。
function cleanAuthor(value: unknown): string {
  return String(value || "").replace(/^[（(][^）)]{1,12}[）)]\s*/, "").trim();
}

// 查询 NeoDB 公共目录，优先补充中文书名、作者、出版社与封面。
async function lookupNeoDb(isbn: string): Promise<BookPayload | null> {
  const params = new URLSearchParams({ category: "book", query: isbn });
  const response = await fetch(`https://neodb.social/api/catalog/search?${params}`, {
    signal: AbortSignal.timeout(7000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const result = await response.json();
  const items = Array.isArray(result?.data) ? result.data as Array<Record<string, unknown>> : [];
  const item = items.find((entry) => normalizeIsbn(String(entry.isbn || "")) === isbn);
  if (!item?.title && !item?.display_title) return null;
  const title = String(item.display_title || item.title || "").trim();
  const subtitle = String(item.subtitle || "").trim();
  const authors = Array.isArray(item.author) ? item.author.map(cleanAuthor).filter(Boolean) : [];
  return {
    isbn,
    title: subtitle && !title.includes(subtitle) ? `${title}：${subtitle}` : title,
    authors,
    publisher: String(item.pub_house || ""),
    published_date: String(item.pub_year || ""),
    cover_url: String(item.cover_image_url || ""),
  };
}

// 从豆瓣搜索摘要中拆出作者、出版社和出版时间。
function parseDoubanAbstract(abstract: string): Partial<BookPayload> {
  const parts = abstract.split("/").map((part) => part.trim()).filter(Boolean);
  const dateIndex = parts.findIndex((part) => /^\d{4}(?:[-年.]\d{1,2})?/.test(part));
  return {
    authors: parts[0] ? [parts[0]] : [],
    publisher: parts[dateIndex > 0 ? dateIndex - 1 : 1] || "",
    published_date: dateIndex >= 0 ? parts[dateIndex] : "",
  };
}

// 从豆瓣搜索页内嵌数据中读取结果。
function parseDoubanSearchData(html: string): Record<string, unknown> | null {
  const match = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\});/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// 查询豆瓣公开搜索页，作为中文书目的后备来源。
async function lookupDoubanWeb(isbn: string): Promise<BookPayload | null> {
  const params = new URLSearchParams({ search_text: isbn });
  const response = await fetch(`https://search.douban.com/book/subject_search?${params}`, {
    signal: AbortSignal.timeout(6000),
    headers: {
      "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
  });
  if (!response.ok) return null;
  const data = parseDoubanSearchData(await response.text());
  const items = Array.isArray(data?.items) ? data.items as Array<Record<string, unknown>> : [];
  const item = items.find((entry) => normalizeIsbn(String(entry.isbn || "")) === isbn);
  if (!item?.title) return null;
  const meta = parseDoubanAbstract(String(item.abstract || ""));
  return {
    isbn,
    title: String(item.title).replace(/\s+:\s+$/, "").trim(),
    authors: meta.authors || [],
    publisher: meta.publisher || "",
    published_date: meta.published_date || "",
    cover_url: String(item.cover_url || ""),
  };
}

// 把常见国内 ISBN API 字段整理为统一结构。
function normalizeDomesticBook(isbn: string, data: Record<string, unknown>): BookPayload | null {
  const title = data.title || data.bookname || data.name;
  if (!title) return null;
  const authorValue = data.author || data.authors;
  return {
    isbn,
    title: String(title),
    authors: Array.isArray(authorValue) ? authorValue.map(String) : String(authorValue || "").split(/[,，、]/).filter(Boolean),
    publisher: String(data.publisher || data.press || ""),
    published_date: String(data.pubdate || data.published_date || data.publishdate || ""),
    cover_url: String(data.pic || data.image || data.cover || data.cover_url || ""),
  };
}

// 调用用户自行配置的豆瓣 API 或兼容代理。
async function lookupDoubanApi(isbn: string): Promise<BookPayload | null> {
  const proxyUrl = Deno.env.get("DOUBAN_PROXY_URL");
  const apiKey = Deno.env.get("DOUBAN_API_KEY");
  let endpoint = "";
  if (proxyUrl) endpoint = proxyUrl.includes("{isbn}") ? proxyUrl.replace("{isbn}", encodeURIComponent(isbn)) : `${proxyUrl.replace(/\/$/, "")}/isbn/${encodeURIComponent(isbn)}`;
  if (!proxyUrl && apiKey) endpoint = `https://api.douban.com/v2/book/isbn/${encodeURIComponent(isbn)}?apikey=${encodeURIComponent(apiKey)}`;
  if (!endpoint) return null;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;
  const result = await response.json();
  return normalizeDomesticBook(isbn, result.book || result.data || result);
}

// 调用可选的极速数据 ISBN API。
async function lookupJisu(isbn: string): Promise<BookPayload | null> {
  const appKey = Deno.env.get("JISU_API_KEY");
  if (!appKey) return null;
  const params = new URLSearchParams({ appkey: appKey, isbn });
  const response = await fetch(`https://api.jisuapi.com/isbn/query?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;
  const result = await response.json();
  if (result.status !== "0" && result.status !== 0) return null;
  return normalizeDomesticBook(isbn, result.result || {});
}

// 调用用户自行配置的通用国内 ISBN API 代理。
async function lookupDomesticProxy(isbn: string): Promise<BookPayload | null> {
  const proxyUrl = Deno.env.get("DOMESTIC_ISBN_PROXY_URL");
  if (!proxyUrl) return null;
  const endpoint = proxyUrl.includes("{isbn}") ? proxyUrl.replace("{isbn}", encodeURIComponent(isbn)) : `${proxyUrl.replace(/\/$/, "")}/isbn/${encodeURIComponent(isbn)}`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;
  const result = await response.json();
  return normalizeDomesticBook(isbn, result.book || result.result || result.data || result);
}

// 查询 Google Books ISBN 接口。
async function lookupGoogleBooks(isbn: string): Promise<BookPayload | null> {
  const params = new URLSearchParams({ q: `isbn:${isbn}` });
  const apiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
  if (apiKey) params.set("key", apiKey);
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) return null;
  const volume = (await response.json()).items?.[0]?.volumeInfo;
  if (!volume?.title) return null;
  return {
    isbn,
    title: volume.title,
    authors: volume.authors || [],
    publisher: volume.publisher || "",
    published_date: volume.publishedDate || "",
    cover_url: String(volume.imageLinks?.thumbnail || "").replace("http://", "https://"),
  };
}

// 查询 Open Library ISBN 接口。
async function lookupOpenLibrary(isbn: string): Promise<BookPayload | null> {
  const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.title) return null;
  return {
    isbn,
    title: data.title,
    authors: [],
    publisher: data.publishers?.[0] || "",
    published_date: data.publish_date || "",
    cover_url: data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg` : "",
  };
}

// 执行单个查询来源，将来源异常转换为空结果并保留服务端日志。
async function tryLookup(source: string, lookup: (value: string) => Promise<BookPayload | null>, isbn: string): Promise<{ source: string; book: BookPayload } | null> {
  try {
    const book = await lookup(isbn);
    return book?.title ? { source, book } : null;
  } catch (error) {
    console.warn(`${source} 查询失败`, error);
    return null;
  }
}

// 优先查询 NeoDB；失败后并行查询其他来源，缩短移动端等待时间。
async function lookupBook(isbn: string): Promise<{ source: string; book: BookPayload } | null> {
  const sources: Array<[string, (value: string) => Promise<BookPayload | null>]> = [
    ["NeoDB 中文书目", lookupNeoDb],
    ["豆瓣网页检索", lookupDoubanWeb],
    ["豆瓣 API", lookupDoubanApi],
    ["极速数据", lookupJisu],
    ["国内 ISBN API", lookupDomesticProxy],
    ["Google Books", lookupGoogleBooks],
    ["Open Library", lookupOpenLibrary],
  ];
  const primary = await tryLookup(sources[0][0], sources[0][1], isbn);
  if (primary) return primary;
  const fallbackResults = await Promise.all(sources.slice(1).map(([source, lookup]) => tryLookup(source, lookup, isbn)));
  return fallbackResults.find(Boolean) || null;
}

// 处理跨域预检和 ISBN 查询请求。
Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) return json(request, { found: false, message: "该网页来源无权调用查书服务" }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(request) });
  if (!hasValidPublicKey(request)) return json(request, { found: false, message: "缺少有效的公开 API key" }, 401);
  if (request.method !== "GET") return json(request, { found: false, message: "仅支持 GET 请求" }, 405);
  const isbn = normalizeIsbn(new URL(request.url).searchParams.get("isbn"));
  if (!isValidIsbn(isbn)) return json(request, { found: false, message: "ISBN 格式或校验位不正确" }, 400);
  try {
    if (!await consumeLookupQuota(request)) {
      return json(request, { found: false, message: "查询过于频繁，请一分钟后再试" }, 429, { "Retry-After": "60" });
    }
  } catch (error) {
    console.warn("ISBN 查询限流服务暂时不可用", error);
  }
  try {
    const cached = await readLookupCache(isbn);
    if (cached) {
      return json(request, { found: cached.found, source: cached.source, book: cached.book || { isbn }, cached: true }, 200, {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      });
    }
  } catch (error) {
    console.warn("ISBN 查询缓存暂时不可用", error);
  }
  const result = await lookupBook(isbn);
  const cacheValue: CacheRecord = result
    ? { found: true, source: result.source, book: result.book }
    : { found: false, source: "manual", book: { isbn } };
  try {
    await writeLookupCache(isbn, cacheValue);
  } catch (error) {
    console.warn("ISBN 查询结果未能写入缓存", error);
  }
  return json(request, { found: cacheValue.found, source: cacheValue.source, book: cacheValue.book, cached: false }, 200, {
    "Cache-Control": "public, max-age=300, s-maxage=3600",
  });
});
