// 本文件封装 Supabase 邮箱验证码登录和个人书架的数据访问。
import { CONFIG, normalizeBook, normalizeStatus } from "./utils.js";

const AUTH_STORAGE_KEY = "isbn-bookshelf-auth";
const SUPABASE_MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm",
  "https://esm.sh/@supabase/supabase-js@2.57.4"
];

// 从固定版本 CDN 加载 Supabase 客户端，主来源失败时使用后备来源。
async function loadSupabaseClient() {
  let lastError;
  for (const url of SUPABASE_MODULE_URLS) {
    try {
      const module = await import(url);
      if (module.createClient) return module.createClient;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`无法加载云端组件：${lastError?.message || "请检查网络"}`);
}

export class SupabaseStore {
  // 创建尚未连接的云端数据源。
  constructor() {
    this.mode = "cloud";
    this.client = null;
    this.session = null;
  }

  // 初始化客户端，恢复已有登录状态并监听后续变化。
  async init() {
    const createClient = await loadSupabaseClient();
    this.client = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
      auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true, storageKey: AUTH_STORAGE_KEY }
    });
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    this.session = data.session;
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session = session;
      window.dispatchEvent(new CustomEvent("bookshelf:session-change", { detail: session }));
    });
    return { needsAuth: !this.session };
  }

  // 向邮箱发送一次性验证码，首次使用时允许自动创建账号。
  async signIn(email) {
    const redirectTo = CONFIG.appUrl || `${location.origin}${location.pathname}`;
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) throw new Error(/rate limit/i.test(error.message || "") ? "验证码发送过于频繁，请稍后再试。" : error.message);
    return true;
  }

  // 校验用户输入的邮箱验证码并建立会话。
  async verifyOtp(email, token) {
    const { data, error } = await this.client.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
    this.session = data.session;
    return this.session;
  }

  // 退出云端账号并清除本项目的本地会话。
  async signOut() {
    const { error } = await this.client.auth.signOut();
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.session = null;
    if (error) throw error;
    return true;
  }

  // 返回当前用户的全部云端图书。
  async listBooks() {
    const { data, error } = await this.client.from("books").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeBook);
  }

  // 新增或更新当前用户的书籍，ISBN 在单个账号内保持唯一。
  async saveBook(bookPayload) {
    const userId = this.session?.user?.id;
    if (!userId) throw new Error("登录已失效，请重新登录。");
    const book = normalizeBook(bookPayload);
    const payload = { ...book, user_id: userId, updated_at: new Date().toISOString() };
    if (!bookPayload.id) delete payload.id;
    const { data, error } = await this.client.from("books").upsert(payload, { onConflict: "user_id,isbn" }).select().single();
    if (error) throw error;
    return normalizeBook(data);
  }

  // 更新指定图书的阅读状态，RLS 会限定为当前用户记录。
  async updateStatus(id, readingStatus) {
    const { data, error } = await this.client.from("books").update({ reading_status: normalizeStatus(readingStatus), updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return normalizeBook(data);
  }

  // 删除当前用户拥有的指定图书。
  async deleteBook(id) {
    const { error } = await this.client.from("books").delete().eq("id", id);
    if (error) throw error;
    return true;
  }
}
