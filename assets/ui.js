// 本文件负责书架卡片、筛选项和阅读看板的安全渲染，不直接访问数据源。
import { READING_STATUSES, escapeHtml, formatDate, normalizeTags, statusLabel } from "./utils.js";

// 仅允许 http 和 https 封面地址进入页面属性。
function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}

// 生成封面图片或文字占位。
function coverMarkup(book, className = "") {
  const url = safeImageUrl(book.cover_url);
  return url ? `<img class="${className}" src="${url}" alt="${escapeHtml(book.title)}封面" loading="lazy" referrerpolicy="no-referrer" />` : `<span aria-hidden="true">${escapeHtml(book.title?.slice(0, 1) || "书")}</span>`;
}

// 生成阅读状态下拉选项。
function statusOptions(current) {
  return READING_STATUSES.map((status) => `<option value="${status.value}" ${status.value === current ? "selected" : ""}>${status.label}</option>`).join("");
}

// 汇总全部标签并更新书架与看板筛选框。
export function renderTagFilters(books, shelfSelect, boardSelect) {
  const currentShelf = shelfSelect.value;
  const currentBoard = boardSelect.value;
  const tags = normalizeTags(books.flatMap((book) => book.tags || [])).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const options = `<option value="">全部标签</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
  shelfSelect.innerHTML = options;
  boardSelect.innerHTML = options;
  shelfSelect.value = tags.includes(currentShelf) ? currentShelf : "";
  boardSelect.value = tags.includes(currentBoard) ? currentBoard : "";
}

// 根据搜索、标签和排序条件生成书架卡片。
export function renderShelf({ books, container, empty, query = "", tag = "", sort = "newest" }) {
  const keyword = query.trim().toLowerCase();
  const filtered = books.filter((book) => {
    const haystack = [book.title, book.isbn, book.publisher, ...(book.authors || []), ...(book.tags || [])].join(" ").toLowerCase();
    return (!keyword || haystack.includes(keyword)) && (!tag || book.tags.includes(tag));
  });
  filtered.sort((a, b) => {
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
    if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
    return b.created_at.localeCompare(a.created_at);
  });
  container.innerHTML = filtered.map((book) => `
    <article class="book-card">
      <div class="book-card-cover">
        ${coverMarkup(book)}
        <span class="status-pill">${statusLabel(book.reading_status)}</span>
      </div>
      <div class="book-card-body">
        <h3>${escapeHtml(book.title || "未命名图书")}</h3>
        <p class="book-meta">${escapeHtml((book.authors || []).join("，") || "作者未录入")}</p>
        <p class="book-meta">ISBN ${escapeHtml(book.isbn)} · ${formatDate(book.created_at)}添加</p>
        <div class="tags">${(book.tags || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
        <div class="card-actions">
          <select class="status-select" data-status-id="${escapeHtml(book.id)}" aria-label="更改《${escapeHtml(book.title)}》的阅读状态">${statusOptions(book.reading_status)}</select>
          <button type="button" data-edit-id="${escapeHtml(book.id)}">编辑</button>
        </div>
      </div>
    </article>
  `).join("");
  empty.classList.toggle("hidden", filtered.length > 0);
}

// 生成想读、在读和已读三列阅读看板。
export function renderBoard({ books, container, tag = "" }) {
  const filtered = tag ? books.filter((book) => book.tags.includes(tag)) : books;
  container.innerHTML = READING_STATUSES.map((status) => {
    const items = filtered.filter((book) => book.reading_status === status.value);
    return `
      <section class="board-column" aria-labelledby="column-${status.value}">
        <div class="board-column-header"><h3 id="column-${status.value}">${status.label}</h3><span class="board-count">${items.length}</span></div>
        <div class="board-list">
          ${items.length ? items.map((book) => `
            <article class="board-card">
              <div class="book-card-cover board-cover">${coverMarkup(book, "board-cover")}</div>
              <div>
                <h4>${escapeHtml(book.title || "未命名图书")}</h4>
                <select data-status-id="${escapeHtml(book.id)}" aria-label="更改《${escapeHtml(book.title)}》的阅读状态">${statusOptions(book.reading_status)}</select>
              </div>
            </article>
          `).join("") : `<p class="board-empty">这里还没有书</p>`}
        </div>
      </section>
    `;
  }).join("");
}

// 用查询结果填充新增图书表单和封面预览。
export function fillBookForm(book, fields) {
  fields.title.value = book.title || "";
  fields.isbn.value = book.isbn || "";
  fields.authors.value = (book.authors || []).join("，");
  fields.publisher.value = book.publisher || "";
  fields.publishedDate.value = book.published_date || "";
  fields.coverUrl.value = book.cover_url || "";
  fields.tags.value = (book.tags || []).join("，");
  fields.status.value = book.reading_status || "want";
  fields.notes.value = book.notes || "";
  fields.source.textContent = book.source || "手动录入";
  renderCoverPreview(book.cover_url, book.title, fields.coverPreview);
}

// 刷新新增表单的封面预览。
export function renderCoverPreview(url, title, container) {
  const safeUrl = safeImageUrl(url);
  container.innerHTML = safeUrl ? `<img src="${safeUrl}" alt="${escapeHtml(title || "图书")}封面" referrerpolicy="no-referrer" />` : "<span>暂无封面</span>";
}
