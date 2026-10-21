-- 本迁移为公开 ISBN 查询增加服务端缓存和按客户端计数的频率限制，仅允许 service_role 访问。
create table if not exists public.book_lookup_cache (
  isbn text primary key,
  found boolean not null,
  source text not null default 'manual',
  book jsonb,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (isbn ~ '^[0-9]{13}$|^[0-9]{9}[0-9Xx]$')
);

create index if not exists book_lookup_cache_expiry_idx
on public.book_lookup_cache(expires_at);

alter table public.book_lookup_cache enable row level security;
revoke all on table public.book_lookup_cache from anon, authenticated;

create table if not exists public.book_lookup_rate_limits (
  client_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (client_hash, window_start)
);

create index if not exists book_lookup_rate_limits_updated_idx
on public.book_lookup_rate_limits(updated_at);

alter table public.book_lookup_rate_limits enable row level security;
revoke all on table public.book_lookup_rate_limits from anon, authenticated;

-- 原子增加当前客户端在一分钟窗口内的计数，并返回是否仍在限制内。
create or replace function public.consume_book_lookup_quota(
  p_client_hash text,
  p_window_start timestamptz,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 30), 300));
begin
  if p_client_hash is null or char_length(p_client_hash) <> 64 then
    return false;
  end if;

  insert into public.book_lookup_rate_limits (client_hash, window_start, request_count)
  values (p_client_hash, date_trunc('minute', p_window_start), 1)
  on conflict (client_hash, window_start)
  do update set
    request_count = public.book_lookup_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into current_count;

  -- 低频清理过期窗口，避免限流表长期增长。
  if random() < 0.02 then
    delete from public.book_lookup_rate_limits where updated_at < now() - interval '2 days';
  end if;

  return current_count <= safe_limit;
end;
$$;

revoke all on function public.consume_book_lookup_quota(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_book_lookup_quota(text, timestamptz, integer) to service_role;

comment on table public.book_lookup_cache is 'ISBN 聚合查询缓存，不向浏览器角色开放';
comment on table public.book_lookup_rate_limits is 'ISBN 查询按客户端哈希记录的一分钟频率窗口';
