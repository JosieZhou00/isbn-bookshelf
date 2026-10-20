// 本文件把当前书架转换为 Excel 和 Numbers 可直接打开的 UTF-8 CSV。
import { dateStamp, saveTextFile, statusLabel } from "./utils.js";

// 转义 CSV 单元格中的引号和换行。
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 将二维数组拼接为标准 CSV 文本。
export function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// 导出书架的核心字段和阅读状态。
export async function exportBooks(books) {
  const rows = [
    ["书名", "ISBN", "作者", "出版社", "出版时间", "阅读状态", "标签", "备注", "封面地址", "添加时间", "更新时间"],
    ...books.map((book) => [
      book.title,
      book.isbn,
      (book.authors || []).join("；"),
      book.publisher,
      book.published_date,
      statusLabel(book.reading_status),
      (book.tags || []).join("；"),
      book.notes,
      book.cover_url,
      book.created_at,
      book.updated_at
    ])
  ];
  const filename = `扫书架_${dateStamp()}.csv`;
  const result = await saveTextFile(filename, rowsToCsv(rows));
  return { filename, result };
}
