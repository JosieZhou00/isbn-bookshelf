-- 本迁移创建个人书架表，并以 RLS 将每条记录限制给所属邮箱账号。
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default (select auth.uid()) references auth.users(id) on delete cascade,
  isbn text not null,
  title text not null,
  authors text[] not null default '{}',
  publisher text not null default '',
  published_date text not null default '',
  cover_url text not null default '',
  tags text[] not null default '{}',
  reading_status text not null default 'want' check (reading_status in ('want', 'reading', 'read')),
  notes text not null default '',
  source text not null default '手动录入',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, isbn),
  check (isbn ~ '^[0-9]{13}$|^[0-9]{9}[0-9Xx]$'),
  check (char_length(title) between 1 and 500)
);

create index if not exists books_user_created_idx on public.books(user_id, created_at desc);
create index if not exists books_user_status_idx on public.books(user_id, reading_status);
create index if not exists books_tags_idx on public.books using gin(tags);

alter table public.books enable row level security;

revoke all on table public.books from anon, authenticated;
grant select, insert, update, delete on table public.books to authenticated;

create policy "用户可读取自己的书架"
on public.books for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "用户可添加自己的图书"
on public.books for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "用户可修改自己的图书"
on public.books for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "用户可删除自己的图书"
on public.books for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

comment on table public.books is '邮箱账号拥有的个人书架图书';
comment on column public.books.reading_status is '阅读状态：want 想读、reading 在读、read 已读';
