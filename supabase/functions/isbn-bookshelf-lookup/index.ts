// 本文件运行在 Supabase Edge Functions，按 ISBN 聚合中文与公开图书数据源。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BookPayload = {
  isbn: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  published_date?: string;
  cover_url?: string;
};

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
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
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
  const item = items.find((entry) => normalizeIsbn(String(entry.isbn || "")) === isbn) || items[0];
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
  const item = items.find((entry) => String(entry.url || "").includes("book.douban.com/subject/")) || items[0];
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

// 依次查询数据源，并返回首个包含书名的结果。
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
  for (const [source, lookup] of sources) {
    try {
      const book = await lookup(isbn);
      if (book?.title) return { source, book };
    } catch (error) {
      console.warn(`${source} 查询失败`, error);
    }
  }
  return null;
}

// 处理跨域预检和 ISBN 查询请求。
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!hasValidPublicKey(request)) return json({ found: false, message: "缺少有效的公开 API key" }, 401);
  if (request.method !== "GET") return json({ found: false, message: "仅支持 GET 请求" }, 405);
  const isbn = normalizeIsbn(new URL(request.url).searchParams.get("isbn"));
  if (!isValidIsbn(isbn)) return json({ found: false, message: "ISBN 格式或校验位不正确" }, 400);
  const result = await lookupBook(isbn);
  return result ? json({ found: true, ...result }) : json({ found: false, source: "manual", book: { isbn } });
});
