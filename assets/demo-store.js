// 本文件提供只在内存中运行的公开演示书架，不读取或写入访客的本机数据。
import { normalizeBook, normalizeStatus } from "./utils.js";

const DEMO_BOOKS = [
  {
    id: "demo-work-without-limits",
    isbn: "9787574002067",
    title: "四开01：工作，就要不拘一格：向会工作的人请教，不拘一格的工作术",
    authors: ["王牧之 主编"],
    publisher: "四川美术出版社",
    published_date: "2022",
    cover_url: "https://neodb.social/m/item/doubanbook/2023/02/08/b02083ca-db2c-4e79-92ee-01e756a07cee.jpg",
    tags: [],
    reading_status: "want",
    notes: "",
    source: "公开演示数据",
    created_at: "2026-10-21T00:00:00.000Z",
    updated_at: "2026-10-21T00:00:00.000Z"
  },
  {
    id: "demo-adhd-women",
    isbn: "9787522208183",
    title: "看见她们：ADHD女性的困境",
    authors: ["洛塔·博里·斯科格隆"],
    publisher: "华夏出版社",
    published_date: "2025",
    cover_url: "https://neodb.social/m/item/doubanbook/2025/03/12/c1f9f1fe-5b34-48b2-a45d-9f9d8f4c9564.jpg",
    tags: [],
    reading_status: "want",
    notes: "",
    source: "公开演示数据",
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-20T00:00:00.000Z"
  }
];

// 深拷贝书籍，避免演示操作修改初始常量。
function cloneBook(book) {
  return normalizeBook(JSON.parse(JSON.stringify(book)));
}

export class DemoStore {
  // 创建本次页面会话使用的内存书架。
  constructor() {
    this.mode = "demo";
    this.session = null;
    this.books = DEMO_BOOKS.map(cloneBook);
  }

  // 演示数据不需要登录或持久化初始化。
  async init() {
    return { needsAuth: false };
  }

  // 按更新时间返回演示书籍副本。
  async listBooks() {
    return this.books.map(cloneBook).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  // 在当前页面会话内新增或更新演示书籍。
  async saveBook(bookPayload) {
    const incoming = normalizeBook(bookPayload);
    const index = this.books.findIndex((book) => book.id === incoming.id || book.isbn === incoming.isbn);
    const now = new Date().toISOString();
    if (index >= 0) {
      incoming.id = this.books[index].id;
      incoming.created_at = this.books[index].created_at;
      incoming.updated_at = now;
      this.books[index] = incoming;
    } else {
      incoming.created_at = now;
      incoming.updated_at = now;
      this.books.push(incoming);
    }
    return cloneBook(incoming);
  }

  // 在当前页面会话内切换阅读状态。
  async updateStatus(id, readingStatus) {
    const book = this.books.find((item) => item.id === id);
    if (!book) throw new Error("没有找到这本演示书籍。");
    book.reading_status = normalizeStatus(readingStatus);
    book.updated_at = new Date().toISOString();
    return cloneBook(book);
  }

  // 在当前页面会话内删除演示书籍。
  async deleteBook(id) {
    const nextBooks = this.books.filter((book) => book.id !== id);
    if (nextBooks.length === this.books.length) throw new Error("没有找到要删除的演示书籍。");
    this.books = nextBooks;
    return true;
  }
}
