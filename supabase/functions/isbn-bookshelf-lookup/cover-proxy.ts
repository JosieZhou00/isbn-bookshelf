// 本文件安全读取可信图书图片域名的封面，并返回可缓存的二进制响应。
import { COVER_PROXY_CONFIG } from "./config.ts";

// 判断封面地址是否使用 HTTPS 且属于允许的图书图片域名。
export function isAllowedCoverUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      COVER_PROXY_CONFIG.allowedHosts.includes(hostname as typeof COVER_PROXY_CONFIG.allowedHosts[number])
      || COVER_PROXY_CONFIG.allowedHostSuffixes.some((suffix) => hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

// 在每次跳转前重新校验目标域名，避免代理被重定向到任意地址。
async function fetchAllowedUrl(url: URL, redirectsLeft: number): Promise<Response> {
  if (!isAllowedCoverUrl(url.href)) throw new Error("封面地址不在允许列表中");
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(COVER_PROXY_CONFIG.timeoutMs),
    headers: { Accept: COVER_PROXY_CONFIG.allowedContentTypes.join(", ") },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirectsLeft <= 0) throw new Error("封面重定向次数过多");
    return fetchAllowedUrl(new URL(location, url), redirectsLeft - 1);
  }
  if (!response.ok) throw new Error(`封面来源返回 ${response.status}`);
  return response;
}

// 读取并校验封面内容，限制图片类型和体积后返回浏览器响应。
export async function fetchCoverImage(value: string): Promise<Response> {
  const upstream = await fetchAllowedUrl(new URL(value), COVER_PROXY_CONFIG.maxRedirects);
  const contentType = String(upstream.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!COVER_PROXY_CONFIG.allowedContentTypes.includes(contentType as typeof COVER_PROXY_CONFIG.allowedContentTypes[number])) {
    await upstream.body?.cancel();
    throw new Error("封面来源返回了不支持的文件类型");
  }
  const declaredSize = Number(upstream.headers.get("content-length") || 0);
  if (declaredSize > COVER_PROXY_CONFIG.maxBytes) {
    await upstream.body?.cancel();
    throw new Error("封面文件超过大小限制");
  }
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > COVER_PROXY_CONFIG.maxBytes) throw new Error("封面文件超过大小限制");
  return new Response(bytes, {
    status: 200,
    headers: {
      "Cache-Control": `public, max-age=${COVER_PROXY_CONFIG.browserCacheSeconds}, s-maxage=${COVER_PROXY_CONFIG.edgeCacheSeconds}`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
