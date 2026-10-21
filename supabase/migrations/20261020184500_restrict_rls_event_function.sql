-- 本迁移禁止网页角色直接调用托管项目的 RLS 事件函数；未提供该函数的本地环境会安全跳过。
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
