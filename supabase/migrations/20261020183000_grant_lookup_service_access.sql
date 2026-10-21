-- 本迁移仅允许 Edge Function 使用 service_role 读写 ISBN 缓存；浏览器角色仍无权直接访问。
grant select, insert, update, delete
on table public.book_lookup_cache
to service_role;

grant select, insert, update, delete
on table public.book_lookup_rate_limits
to service_role;
