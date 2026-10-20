// 本文件协调扫码、查书、登录、存储、书架筛选、阅读看板和导出交互。
import { lookupBookByIsbn } from "./book-lookup.js?v=11";
import { exportBooks } from "./csv-export.js?v=11";
import { DemoStore } from "./demo-store.js?v=11";
import { applyTranslations, sourceLabel, t, toggleLanguage } from "./i18n.js?v=11";
import { LocalStore } from "./local-store.js?v=11";
import { CameraScanner } from "./scanner.js?v=11";
import { SupabaseStore } from "./supabase-store.js?v=11";
import { fillBookForm, renderBoard, renderCoverPreview, renderShelf, renderTagFilters } from "./ui.js?v=11";
import { hasCloudConfig, isValidIsbn, normalizeBook, normalizeIsbn, normalizeTags } from "./utils.js?v=11";

const $ = (selector) => document.querySelector(selector);
const elements = {
  navButtons: [...document.querySelectorAll(".nav-button")],
  views: [...document.querySelectorAll(".view")],
  modeBadge: $("#modeBadge"), authButton: $("#authButton"), languageButton: $("#languageButton"), totalCount: $("#totalCount"),
  isbnForm: $("#isbnForm"), isbnInput: $("#isbnInput"), lookupHint: $("#lookupHint"), cameraButton: $("#cameraButton"),
  bookForm: $("#bookForm"), cancelEditButton: $("#cancelEditButton"),
  bookGrid: $("#bookGrid"), shelfEmpty: $("#shelfEmpty"), searchInput: $("#searchInput"), tagFilter: $("#tagFilter"), sortSelect: $("#sortSelect"),
  readingBoard: $("#readingBoard"), boardTagFilter: $("#boardTagFilter"), exportButton: $("#exportButton"), storageNote: $("#storageNote"),
  scannerDialog: $("#scannerDialog"), scannerVideo: $("#scannerVideo"), scannerHint: $("#scannerHint"), closeScannerButton: $("#closeScannerButton"),
  authDialog: $("#authDialog"), signedOutPanel: $("#signedOutPanel"), signedInPanel: $("#signedInPanel"),
  loginForm: $("#loginForm"), loginEmail: $("#loginEmail"), codeField: $("#codeField"), loginCode: $("#loginCode"), loginButton: $("#loginButton"), authHint: $("#authHint"), accountEmail: $("#accountEmail"), signOutButton: $("#signOutButton"),
  editDialog: $("#editDialog"), editForm: $("#editForm"), closeEditButton: $("#closeEditButton"), deleteBookButton: $("#deleteBookButton"),
  editId: $("#editId"), editTitle: $("#editTitle"), editAuthors: $("#editAuthors"), editTags: $("#editTags"), editStatus: $("#editStatus"), editNotes: $("#editNotes"), toast: $("#toast")
};
const bookFields = {
  title: $("#bookTitle"), isbn: $("#bookIsbn"), authors: $("#bookAuthors"), publisher: $("#bookPublisher"),
  publishedDate: $("#bookPublishedDate"), coverUrl: $("#bookCoverUrl"), tags: $("#bookTags"), status: $("#bookStatus"), notes: $("#bookNotes"),
  source: $("#sourceBadge"), coverPreview: $("#coverPreview")
};

const demoMode = new URLSearchParams(location.search).get("demo") === "1";
const state = { books: [], store: new LocalStore(), localStore: null, cloudStore: null, demoStore: null, lookupBook: null, lookupStatus: "idle", toastTimer: null };
state.localStore = state.store;

const scanner = new CameraScanner({
  dialog: elements.scannerDialog,
  video: elements.scannerVideo,
  hint: elements.scannerHint,
  onResult: (isbn) => {
    elements.isbnInput.value = isbn;
    handleLookup().catch(showError);
  }
});

// 显示短时操作结果或错误信息。
function toast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

// 将未知异常转换为可读提示。
function showError(error) {
  console.error(error);
  toast(error?.message || t("error.generic"));
}

// 切换主要视图，并同步导航按钮状态。
function activateView(viewId) {
  elements.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  elements.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  history.replaceState(null, "", `#${viewId}`);
}

// 切换当前使用的本机或云端数据源。
async function switchStore(store) {
  state.store = store;
  await refreshBooks();
  renderAccountState();
}

// 从当前数据源重新读取书籍并刷新全部视图。
async function refreshBooks() {
  state.books = await state.store.listBooks();
  elements.totalCount.textContent = String(state.books.length);
  renderTagFilters(state.books, elements.tagFilter, elements.boardTagFilter);
  renderCurrentShelf();
  renderCurrentBoard();
}

// 按当前控件值刷新书架列表。
function renderCurrentShelf() {
  renderShelf({ books: state.books, container: elements.bookGrid, empty: elements.shelfEmpty, query: elements.searchInput.value, tag: elements.tagFilter.value, sort: elements.sortSelect.value });
}

// 按当前标签筛选刷新阅读看板。
function renderCurrentBoard() {
  renderBoard({ books: state.books, container: elements.readingBoard, tag: elements.boardTagFilter.value });
}

// 刷新登录按钮、模式说明和账号弹窗内容。
function renderAccountState() {
  const session = state.cloudStore?.session;
  const demo = state.store.mode === "demo";
  const cloud = state.store.mode === "cloud" && session;
  elements.modeBadge.textContent = demo ? t("mode.demo") : cloud ? t("mode.cloud") : t("mode.local");
  elements.authButton.textContent = demo ? t("auth.exitDemo") : cloud ? t("auth.account") : t("auth.emailLogin");
  elements.signedOutPanel.classList.toggle("hidden", Boolean(session));
  elements.signedInPanel.classList.toggle("hidden", !session);
  elements.accountEmail.textContent = session ? t("auth.current", { email: session.user.email }) : "";
  elements.storageNote.textContent = demo ? t("storage.demo") : cloud ? t("storage.cloud") : t("storage.local");
  const waitingForCode = !elements.codeField.classList.contains("hidden");
  elements.loginButton.textContent = waitingForCode ? t("auth.verify") : t("auth.send");
  elements.authHint.textContent = waitingForCode ? t("auth.sent") : t("auth.hint");
}

// 根据当前查询阶段刷新可切换语言的提示文字。
function renderLookupHint() {
  const key = {
    idle: "lookup.idle",
    existing: "lookup.existing",
    loading: "lookup.loading",
    found: "lookup.found",
    sourceError: "lookup.sourceError",
    partialError: "lookup.partialError",
    notFound: "lookup.notFound"
  }[state.lookupStatus] || "lookup.idle";
  const values = key === "lookup.found" ? { source: sourceLabel(state.lookupBook?.source || "书架") } : {};
  elements.lookupHint.textContent = t(key, values);
}

// 查询 ISBN 并展开资料确认表单。
async function handleLookup() {
  const isbn = normalizeIsbn(elements.isbnInput.value);
  if (!isValidIsbn(isbn)) throw new Error(t("lookup.invalid"));
  elements.isbnInput.value = isbn;
  const existing = state.books.find((book) => book.isbn === isbn);
  state.lookupStatus = existing ? "existing" : "loading";
  renderLookupHint();
  const book = existing || await lookupBookByIsbn(isbn, state.cloudStore?.session?.access_token || "");
  state.lookupBook = book;
  fillBookForm(book, bookFields);
  elements.bookForm.classList.remove("hidden");
  if (book.title) state.lookupStatus = "found";
  else if (book.lookup_status === "source-error") state.lookupStatus = "sourceError";
  else if (book.unavailable_sources?.length) state.lookupStatus = "partialError";
  else state.lookupStatus = "notFound";
  renderLookupHint();
  bookFields.title.focus();
}

// 从新增表单读取并规范化书籍数据。
function collectBookForm() {
  return normalizeBook({
    ...state.lookupBook,
    title: bookFields.title.value,
    isbn: bookFields.isbn.value,
    authors: bookFields.authors.value,
    publisher: bookFields.publisher.value,
    published_date: bookFields.publishedDate.value,
    cover_url: bookFields.coverUrl.value,
    tags: normalizeTags(bookFields.tags.value),
    reading_status: bookFields.status.value,
    notes: bookFields.notes.value,
    source: bookFields.source.dataset.source || state.lookupBook?.source || "手动录入"
  });
}

// 保存新增或重复 ISBN 图书并返回书架视图。
async function handleSaveBook(event) {
  event.preventDefault();
  const book = collectBookForm();
  if (!book.title) throw new Error(t("error.titleRequired"));
  await state.store.saveBook(book);
  elements.bookForm.classList.add("hidden");
  elements.isbnForm.reset();
  state.lookupBook = null;
  state.lookupStatus = "idle";
  renderLookupHint();
  await refreshBooks();
  activateView("shelf");
  toast(t("toast.saved"));
}

// 更新卡片或看板中的阅读状态。
async function handleStatusChange(event) {
  const id = event.target.dataset.statusId;
  if (!id) return;
  await state.store.updateStatus(id, event.target.value);
  await refreshBooks();
  toast(t("toast.statusUpdated"));
}

// 打开指定图书的编辑弹窗。
function openEditDialog(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) throw new Error(t("error.bookMissing"));
  elements.editId.value = book.id;
  elements.editTitle.value = book.title;
  elements.editAuthors.value = (book.authors || []).join("，");
  elements.editTags.value = (book.tags || []).join("，");
  elements.editStatus.value = book.reading_status;
  elements.editNotes.value = book.notes;
  elements.editDialog.showModal();
}

// 保存编辑弹窗中的标题、作者、标签、状态和备注。
async function handleEditSave(event) {
  event.preventDefault();
  const existing = state.books.find((book) => book.id === elements.editId.value);
  if (!existing) throw new Error(t("error.editMissing"));
  await state.store.saveBook({ ...existing, title: elements.editTitle.value, authors: elements.editAuthors.value, tags: elements.editTags.value, reading_status: elements.editStatus.value, notes: elements.editNotes.value });
  elements.editDialog.close();
  await refreshBooks();
  toast(t("toast.edited"));
}

// 经用户确认后删除当前编辑的图书。
async function handleDeleteBook() {
  const book = state.books.find((item) => item.id === elements.editId.value);
  if (!book) throw new Error(t("error.deleteMissing"));
  if (!window.confirm(t("confirm.delete", { title: book.title }))) return;
  await state.store.deleteBook(book.id);
  elements.editDialog.close();
  await refreshBooks();
  toast(t("toast.deleted"));
}

// 发送或验证邮箱验证码。
async function handleLogin(event) {
  event.preventDefault();
  if (!state.cloudStore) throw new Error(t("error.cloudNotConfigured"));
  const email = elements.loginEmail.value.trim();
  const waitingForCode = !elements.codeField.classList.contains("hidden");
  elements.loginButton.disabled = true;
  try {
    if (!waitingForCode) {
      await state.cloudStore.signIn(email);
      elements.codeField.classList.remove("hidden");
      elements.loginCode.required = true;
      elements.loginButton.textContent = t("auth.verify");
      elements.authHint.textContent = t("auth.sent");
      elements.loginCode.focus();
      return;
    }
    await state.cloudStore.verifyOtp(email, elements.loginCode.value.trim());
    await switchStore(state.cloudStore);
    elements.authDialog.close();
    toast(t("toast.signedIn"));
  } finally {
    elements.loginButton.disabled = false;
  }
}

// 退出云端账号并切回当前设备的本机书架。
async function handleSignOut() {
  await state.cloudStore.signOut();
  await switchStore(state.localStore);
  elements.authDialog.close();
  toast(t("toast.signedOut"));
}

// 绑定静态页面的所有用户交互。
function bindEvents() {
  elements.languageButton.addEventListener("click", toggleLanguage);
  elements.navButtons.forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));
  elements.isbnForm.addEventListener("submit", (event) => { event.preventDefault(); handleLookup().catch(showError); });
  elements.bookForm.addEventListener("submit", (event) => handleSaveBook(event).catch(showError));
  elements.cancelEditButton.addEventListener("click", () => elements.bookForm.classList.add("hidden"));
  bookFields.coverUrl.addEventListener("input", () => renderCoverPreview(bookFields.coverUrl.value, bookFields.title.value, bookFields.coverPreview));
  elements.cameraButton.addEventListener("click", () => scanner.start().catch(showError));
  elements.closeScannerButton.addEventListener("click", () => scanner.stop());
  elements.searchInput.addEventListener("input", renderCurrentShelf);
  elements.tagFilter.addEventListener("change", renderCurrentShelf);
  elements.sortSelect.addEventListener("change", renderCurrentShelf);
  elements.boardTagFilter.addEventListener("change", renderCurrentBoard);
  elements.bookGrid.addEventListener("change", (event) => handleStatusChange(event).catch(showError));
  elements.readingBoard.addEventListener("change", (event) => handleStatusChange(event).catch(showError));
  elements.bookGrid.addEventListener("click", (event) => { if (event.target.dataset.editId) openEditDialog(event.target.dataset.editId); });
  elements.editForm.addEventListener("submit", (event) => handleEditSave(event).catch(showError));
  elements.closeEditButton.addEventListener("click", () => elements.editDialog.close());
  elements.deleteBookButton.addEventListener("click", () => handleDeleteBook().catch(showError));
  elements.exportButton.addEventListener("click", () => exportBooks(state.books).then(({ result }) => toast(result)).catch(showError));
  elements.authButton.addEventListener("click", () => {
    if (state.store.mode === "demo") {
      const url = new URL(location.href);
      url.searchParams.delete("demo");
      url.hash = "";
      location.href = url.toString();
      return;
    }
    if (!hasCloudConfig()) return toast(t("toast.cloudUnavailable"));
    renderAccountState();
    elements.authDialog.showModal();
  });
  elements.loginForm.addEventListener("submit", (event) => handleLogin(event).catch(showError));
  elements.signOutButton.addEventListener("click", () => handleSignOut().catch(showError));
  window.addEventListener("bookshelf:session-change", async (event) => {
    if (event.detail && state.store.mode !== "cloud") await switchStore(state.cloudStore);
    if (!event.detail && state.store.mode === "cloud") await switchStore(state.localStore);
  });
  window.addEventListener("bookshelf:language-change", () => {
    renderAccountState();
    renderLookupHint();
    if (state.lookupBook) {
      bookFields.source.textContent = sourceLabel(state.lookupBook.source);
      renderCoverPreview(bookFields.coverUrl.value, bookFields.title.value, bookFields.coverPreview);
    }
    scanner.updateLanguage();
    refreshBooks().catch(showError);
  });
}

// 初始化本机书架、可选云端客户端、路由和 Service Worker。
async function init() {
  applyTranslations();
  bindEvents();
  await state.localStore.init();
  if (demoMode) {
    state.demoStore = new DemoStore();
    await state.demoStore.init();
    state.store = state.demoStore;
  } else if (hasCloudConfig()) {
    state.cloudStore = new SupabaseStore();
    await state.cloudStore.init();
    if (state.cloudStore.session) state.store = state.cloudStore;
  }
  await refreshBooks();
  renderAccountState();
  const initialView = location.hash.slice(1);
  if (["add", "shelf", "board", "export"].includes(initialView)) activateView(initialView);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch((error) => console.warn(t("log.serviceWorker"), error));
}

init().catch(showError);
