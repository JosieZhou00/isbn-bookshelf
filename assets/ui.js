// 本文件负责书架卡片、筛选项和阅读看板的安全渲染，不直接访问数据源。
import { READING_STATUSES, escapeHtml, formatDate, normalizeTags, statusLabel } from "./utils.js?v=11";
import { getLocale, sourceLabel, t } from "./i18n.js?v=11";

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
  const title = book.title || t("book.untitled");
  return url ? `<img class="${className}" src="${url}" alt="${escapeHtml(t("book.coverAlt", { title }))}" loading="lazy" referrerpolicy="no-referrer" />` : `<span aria-hidden="true">${escapeHtml(book.title?.slice(0, 1) || t("brand.mark"))}</span>`;
}

// 生成阅读状态下拉选项。
function statusOptions(current) {
  return READING_STATUSES.map((status) => `<option value="${status.value}" ${status.value === current ? "selected" : ""}>${t(`status.${status.value}`)}</option>`).join("");
}

// 汇总全部标签并更新书架与看板筛选框。
export function renderTagFilters(books, shelfSelect, boardSelect) {
  const currentShelf = shelfSelect.value;
  const currentBoard = boardSelect.value;
  const tags = normalizeTags(books.flatMap((book) => book.tags || [])).sort((a, b) => a.localeCompare(b, getLocale()));
  const options = `<option value="">${t("shelf.allTags")}</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
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
    if (sort === "title") return a.title.localeCompare(b.title, getLocale());
    return b.created_at.localeCompare(a.created_at);
  });
  container.innerHTML = filtered.map((book) => `
    <article class="book-card">
      <div class="book-card-cover">
        ${coverMarkup(book)}
        <span class="status-pill">${statusLabel(book.reading_status)}</span>
      </div>
      <div class="book-card-body">
        <h3>${escapeHtml(book.title || t("book.untitled"))}</h3>
        <p class="book-meta">${escapeHtml((book.authors || []).join(", ") || t("book.unknownAuthor"))}</p>
        <p class="book-meta">ISBN ${escapeHtml(book.isbn)} · ${escapeHtml(t("book.added", { date: formatDate(book.created_at) }))}</p>
        <div class="tags">${(book.tags || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
        <div class="card-actions">
          <select class="status-select" data-status-id="${escapeHtml(book.id)}" aria-label="${escapeHtml(t("book.statusAria", { title: book.title }))}">${statusOptions(book.reading_status)}</select>
          <button type="button" data-edit-id="${escapeHtml(book.id)}">${t("book.edit")}</button>
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
        <div class="board-column-header"><h3 id="column-${status.value}">${t(`status.${status.value}`)}</h3><span class="board-count">${items.length}</span></div>
        <div class="board-list">
          ${items.length ? items.map((book) => `
            <article class="board-card">
              <div class="book-card-cover board-cover">${coverMarkup(book, "board-cover")}</div>
              <div>
                <h4>${escapeHtml(book.title || t("book.untitled"))}</h4>
                <select data-status-id="${escapeHtml(book.id)}" aria-label="${escapeHtml(t("book.statusAria", { title: book.title }))}">${statusOptions(book.reading_status)}</select>
              </div>
            </article>
          `).join("") : `<p class="board-empty">${t("board.empty")}</p>`}
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
  fields.source.dataset.source = book.source || "手动录入";
  fields.source.textContent = sourceLabel(book.source);
  renderCoverPreview(book.cover_url, book.title, fields.coverPreview);
}

// 刷新新增表单的封面预览。
export function renderCoverPreview(url, title, container) {
  const safeUrl = safeImageUrl(url);
  const bookTitle = title || t("book.untitled");
  container.innerHTML = safeUrl ? `<img src="${safeUrl}" alt="${escapeHtml(t("book.coverAlt", { title: bookTitle }))}" referrerpolicy="no-referrer" />` : `<span>${t("book.noCover")}</span>`;
}
