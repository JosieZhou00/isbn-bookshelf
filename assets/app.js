// 本文件协调扫码、查书、登录、存储、书架筛选、阅读看板和导出交互。
import { lookupBookByIsbn } from "./book-lookup.js";
import { exportBooks } from "./csv-export.js";
import { LocalStore } from "./local-store.js";
import { CameraScanner } from "./scanner.js";
import { SupabaseStore } from "./supabase-store.js";
import { fillBookForm, renderBoard, renderCoverPreview, renderShelf, renderTagFilters } from "./ui.js";
import { hasCloudConfig, isValidIsbn, normalizeBook, normalizeIsbn, normalizeTags } from "./utils.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  navButtons: [...document.querySelectorAll(".nav-button")],
  views: [...document.querySelectorAll(".view")],
  modeBadge: $("#modeBadge"), authButton: $("#authButton"), totalCount: $("#totalCount"),
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

const state = { books: [], store: new LocalStore(), localStore: null, cloudStore: null, lookupBook: null, toastTimer: null };
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
  toast(error?.message || "操作失败，请稍后重试。");
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
  const cloud = state.store.mode === "cloud" && session;
  elements.modeBadge.textContent = cloud ? "云端书架" : "本机书架";
  elements.authButton.textContent = cloud ? "账号" : "邮箱登录";
  elements.signedOutPanel.classList.toggle("hidden", Boolean(session));
  elements.signedInPanel.classList.toggle("hidden", !session);
  elements.accountEmail.textContent = session ? `当前账号：${session.user.email}` : "";
  elements.storageNote.textContent = cloud ? "云端数据与当前邮箱账号绑定，导出文件仍会保存在你选择的位置。" : "本机模式的数据只保存在当前浏览器中，请定期导出备份。";
}

// 查询 ISBN 并展开资料确认表单。
async function handleLookup() {
  const isbn = normalizeIsbn(elements.isbnInput.value);
  if (!isValidIsbn(isbn)) throw new Error("ISBN 格式或校验位不正确，请重新检查。");
  elements.isbnInput.value = isbn;
  const existing = state.books.find((book) => book.isbn === isbn);
  elements.lookupHint.textContent = existing ? "这本书已在当前书架中，可以修改后保存。" : "正在查询图书资料……";
  const book = existing || await lookupBookByIsbn(isbn, state.cloudStore?.session?.access_token || "");
  state.lookupBook = book;
  fillBookForm(book, bookFields);
  elements.bookForm.classList.remove("hidden");
  if (book.title) elements.lookupHint.textContent = `已从${book.source || "书架"}取得资料，请确认后保存。`;
  else if (book.lookup_status === "source-error") elements.lookupHint.textContent = `部分查书来源暂时不可用；请稍后重试或手动填写。${book.errors?.[0] ? `（${book.errors[0]}）` : ""}`;
  else elements.lookupHint.textContent = "已查询可用数据源，但没有找到完整资料；请手动填写书名后保存。";
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
    source: bookFields.source.textContent
  });
}

// 保存新增或重复 ISBN 图书并返回书架视图。
async function handleSaveBook(event) {
  event.preventDefault();
  const book = collectBookForm();
  if (!book.title) throw new Error("请填写书名。");
  await state.store.saveBook(book);
  elements.bookForm.classList.add("hidden");
  elements.isbnForm.reset();
  state.lookupBook = null;
  await refreshBooks();
  activateView("shelf");
  toast("已保存到书架。");
}

// 更新卡片或看板中的阅读状态。
async function handleStatusChange(event) {
  const id = event.target.dataset.statusId;
  if (!id) return;
  await state.store.updateStatus(id, event.target.value);
  await refreshBooks();
  toast("阅读状态已更新。");
}

// 打开指定图书的编辑弹窗。
function openEditDialog(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) throw new Error("没有找到这本书。");
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
  if (!existing) throw new Error("没有找到要修改的图书。");
  await state.store.saveBook({ ...existing, title: elements.editTitle.value, authors: elements.editAuthors.value, tags: elements.editTags.value, reading_status: elements.editStatus.value, notes: elements.editNotes.value });
  elements.editDialog.close();
  await refreshBooks();
  toast("修改已保存。");
}

// 经用户确认后删除当前编辑的图书。
async function handleDeleteBook() {
  const book = state.books.find((item) => item.id === elements.editId.value);
  if (!book) throw new Error("没有找到要删除的图书。");
  if (!window.confirm(`确认从书架删除《${book.title}》？`)) return;
  await state.store.deleteBook(book.id);
  elements.editDialog.close();
  await refreshBooks();
  toast("图书已删除。");
}

// 发送或验证邮箱验证码。
async function handleLogin(event) {
  event.preventDefault();
  if (!state.cloudStore) throw new Error("尚未配置 Supabase，当前只能使用本机书架。");
  const email = elements.loginEmail.value.trim();
  const waitingForCode = !elements.codeField.classList.contains("hidden");
  elements.loginButton.disabled = true;
  try {
    if (!waitingForCode) {
      await state.cloudStore.signIn(email);
      elements.codeField.classList.remove("hidden");
      elements.loginCode.required = true;
      elements.loginButton.textContent = "验证并登录";
      elements.authHint.textContent = "验证码已发送。请查看邮箱，并在此输入六位验证码。";
      elements.loginCode.focus();
      return;
    }
    await state.cloudStore.verifyOtp(email, elements.loginCode.value.trim());
    await switchStore(state.cloudStore);
    elements.authDialog.close();
    toast("登录成功，已切换到云端书架。");
  } finally {
    elements.loginButton.disabled = false;
  }
}

// 退出云端账号并切回当前设备的本机书架。
async function handleSignOut() {
  await state.cloudStore.signOut();
  await switchStore(state.localStore);
  elements.authDialog.close();
  toast("已退出，当前显示本机书架。");
}

// 绑定静态页面的所有用户交互。
function bindEvents() {
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
    if (!hasCloudConfig()) return toast("云端功能尚未配置，当前可以继续使用本机书架。");
    renderAccountState();
    elements.authDialog.showModal();
  });
  elements.loginForm.addEventListener("submit", (event) => handleLogin(event).catch(showError));
  elements.signOutButton.addEventListener("click", () => handleSignOut().catch(showError));
  window.addEventListener("bookshelf:session-change", async (event) => {
    if (event.detail && state.store.mode !== "cloud") await switchStore(state.cloudStore);
    if (!event.detail && state.store.mode === "cloud") await switchStore(state.localStore);
  });
}

// 初始化本机书架、可选云端客户端、路由和 Service Worker。
async function init() {
  bindEvents();
  await state.localStore.init();
  if (hasCloudConfig()) {
    state.cloudStore = new SupabaseStore();
    await state.cloudStore.init();
    if (state.cloudStore.session) state.store = state.cloudStore;
  }
  await refreshBooks();
  renderAccountState();
  const initialView = location.hash.slice(1);
  if (["add", "shelf", "board", "export"].includes(initialView)) activateView(initialView);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service Worker 注册失败", error));
}

init().catch(showError);
