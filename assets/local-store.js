// 本文件实现免注册书架，全部数据只写入当前浏览器的 localStorage。
import { normalizeBook, normalizeStatus } from "./utils.js?v=11";
import { t } from "./i18n.js?v=11";

const STORAGE_KEY = "isbn-bookshelf-local-v1";

export class LocalStore {
  // 创建本地数据源，并允许测试传入替代存储对象。
  constructor(storage = globalThis.localStorage) {
    this.mode = "local";
    this.storage = storage;
    this.session = null;
  }

  // 本地数据源无需异步登录，初始化后直接可用。
  async init() {
    this.readData();
    return { needsAuth: false };
  }

  // 读取并校验本地书架数据。
  readData() {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (!raw) return { books: [] };
    try {
      const data = JSON.parse(raw);
      return { books: Array.isArray(data.books) ? data.books.map(normalizeBook) : [] };
    } catch {
      throw new Error(t("error.localRead"));
    }
  }

  // 将完整书架写回浏览器存储。
  writeData(data) {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      throw new Error(t("error.localSave", { message: error.message }));
    }
  }

  // 按最近更新时间返回本地全部图书。
  async listBooks() {
    return this.readData().books.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  // 以 ISBN 为唯一键新增图书，重复保存时更新原记录。
  async saveBook(bookPayload) {
    const data = this.readData();
    const now = new Date().toISOString();
    const incoming = normalizeBook(bookPayload);
    const index = data.books.findIndex((book) => book.id === incoming.id || book.isbn === incoming.isbn);
    if (index >= 0) {
      incoming.id = data.books[index].id;
      incoming.created_at = data.books[index].created_at;
      incoming.updated_at = now;
      data.books[index] = incoming;
    } else {
      incoming.created_at = now;
      incoming.updated_at = now;
      data.books.push(incoming);
    }
    this.writeData(data);
    return incoming;
  }

  // 更新一本书的阅读状态。
  async updateStatus(id, readingStatus) {
    const data = this.readData();
    const book = data.books.find((item) => item.id === id);
    if (!book) throw new Error(t("error.bookMissing"));
    book.reading_status = normalizeStatus(readingStatus);
    book.updated_at = new Date().toISOString();
    this.writeData(data);
    return book;
  }

  // 从本机书架删除指定图书。
  async deleteBook(id) {
    const data = this.readData();
    const nextBooks = data.books.filter((book) => book.id !== id);
    if (nextBooks.length === data.books.length) throw new Error(t("error.deleteMissing"));
    this.writeData({ books: nextBooks });
    return true;
  }
}
