
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef = true
  loop
    execute format('revoke execute on function %s from anon, public', f.sig);
  end loop;
end $$;
