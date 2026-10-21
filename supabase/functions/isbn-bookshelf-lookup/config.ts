// 本文件集中保存 ISBN 查书函数的封面代理配置，供代理模块读取。
export const COVER_PROXY_CONFIG = {
  functionName: "isbn-bookshelf-lookup",
  allowedHosts: [
    "neodb.social",
    "covers.openlibrary.org",
    "books.google.com",
  ],
  allowedHostSuffixes: [
    ".doubanio.com",
    ".googleusercontent.com",
  ],
  allowedContentTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
  ],
  maxBytes: 5 * 1024 * 1024,
  maxRedirects: 2,
  timeoutMs: 8000,
  rateLimitPerMinute: 120,
  browserCacheSeconds: 60 * 60 * 24,
  edgeCacheSeconds: 60 * 60 * 24 * 7,
} as const;
