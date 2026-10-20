// 本文件验证 ISBN、标签、本机保存、状态变更和 CSV 转义等核心逻辑。
import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore } from "../assets/local-store.js";
import { rowsToCsv } from "../assets/csv-export.js";
import { normalizeNeoDbBook } from "../assets/book-lookup.js";
import { isValidIsbn, normalizeIsbn, normalizeTags } from "../assets/utils.js";

class MemoryStorage {
  // 创建用于测试的内存键值存储。
  constructor() { this.data = new Map(); }
  // 读取指定键。
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  // 写入指定键。
  setItem(key, value) { this.data.set(key, String(value)); }
}

// 验证 ISBN 清理和校验位规则。
test("ISBN 清理和校验", () => {
  assert.equal(normalizeIsbn("978-7-5057-5685-4"), "9787505756854");
  assert.equal(isValidIsbn("9787505756854"), true);
  assert.equal(isValidIsbn("0306406152"), true);
  assert.equal(isValidIsbn("9787505756855"), false);
});

// 验证中文书目接口字段能够组成完整的新增表单资料。
test("NeoDB 中文书目字段映射", () => {
  const book = normalizeNeoDbBook("9787522208183", {
    display_title: "看见她们",
    subtitle: "ADHD女性的困境",
    author: ["(瑞士) 洛塔·博里·斯科格隆"],
    pub_house: "华夏出版社",
    pub_year: 2025,
    cover_image_url: "https://example.com/cover.jpg"
  });
  assert.equal(book.title, "看见她们：ADHD女性的困境");
  assert.deepEqual(book.authors, ["洛塔·博里·斯科格隆"]);
  assert.equal(book.publisher, "华夏出版社");
  assert.equal(book.published_date, "2025");
  assert.equal(book.source, "NeoDB 中文书目");
});

// 验证标签去空白和不区分大小写去重。
test("标签规范化", () => {
  assert.deepEqual(normalizeTags("文学， 法律,文学,AI,ai"), ["文学", "法律", "AI"]);
});

// 验证本机书架按 ISBN 更新并支持状态切换。
test("本机书架保存和状态切换", async () => {
  const store = new LocalStore(new MemoryStorage());
  await store.init();
  const first = await store.saveBook({ isbn: "9787505756854", title: "第一版", reading_status: "want" });
  await store.saveBook({ isbn: "9787505756854", title: "修订版", reading_status: "want" });
  assert.equal((await store.listBooks()).length, 1);
  assert.equal((await store.listBooks())[0].title, "修订版");
  await store.updateStatus(first.id, "read");
  assert.equal((await store.listBooks())[0].reading_status, "read");
});

// 验证 CSV 对逗号、引号和换行的转义。
test("CSV 转义", () => {
  assert.equal(rowsToCsv([["书名", "备注"], ["A, B", "他说\"好\"\n第二行"]]), "书名,备注\r\n\"A, B\",\"他说\"\"好\"\"\n第二行\"");
});
