// 本文件保存经出版社等权威页面核对的 ISBN 纠错记录，供查书流程优先使用。
import { normalizeBook, normalizeIsbn } from "./utils.js";

const VERIFIED_BOOKS = {
  "9787519791551": {
    title: "司法裁判过程中的人工智能应用研究",
    authors: ["彭中礼"],
    publisher: "法律出版社",
    published_date: "2024",
    cover_url: "https://books.google.com/books/content?id=0ncL0QEACAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api",
    source: "Google Books（精确 ISBN）"
  },
  "9787522206042": {
    title: "你好，我是阿斯伯格女孩",
    authors: ["露迪·西蒙"],
    publisher: "华夏出版社",
    published_date: "2024-06-01",
    source: "华夏出版社官网（核验）"
  }
};

// 按精确 ISBN 返回已核验书目，未收录时返回空值。
export function getVerifiedBookByIsbn(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  const book = VERIFIED_BOOKS[isbn];
  return book ? normalizeBook({ ...book, isbn }) : null;
}
