-- Bootstrap ONLY the new empty Supabase project for Ujian-daring-supabase.
-- Runtime access is server-only, using the application's existing PIN/HMAC auth.
begin;

create table if not exists public.app_rows (
  sheet text not null check (sheet in (
    'SISWA','UJIAN','SOAL','SESI','LOGIN_LIMIT','KELAS','RIWAYAT_KELAS',
    'ABSENSI_SESI','ABSENSI','ABSENSI_PESERTA','ABSENSI_DETAIL','MATERI',
    'TUGAS','PENGUMPULAN','PROFIL','GURU','PESERTA_UJIAN','JADWAL',
    'JADWAL_PENGECUALIAN','FOTO_PROFIL'
  )),
  row_num integer not null check (row_num >= 2),
  cells jsonb not null check (jsonb_typeof(cells) = 'array' and jsonb_array_length(cells) <= 64),
  primary key (sheet, row_num)
);
alter table public.app_rows enable row level security;
revoke all on public.app_rows from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on public.app_rows to service_role;

create or replace function public.app_append_rows(p_sheet text, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = ''
set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  first_row integer;
  next_row integer;
  item jsonb;
begin
  if p_sheet is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Invalid append payload';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Invalid row count'; end if;
  -- Serialize short write transactions for each logical dataset, never network I/O.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('app_rows:' || p_sheet, 0));
  select coalesce(max(row_num), 1) + 1 into first_row from public.app_rows where sheet = p_sheet;
  next_row := first_row;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'array' then raise exception 'Invalid row'; end if;
    if jsonb_array_length(item) not between 1 and 64 or exists (
      select 1 from jsonb_array_elements(item) cell where jsonb_typeof(cell) in ('array','object')
    ) then raise exception 'Invalid cells'; end if;
    insert into public.app_rows(sheet, row_num, cells) values (p_sheet, next_row, item);
    next_row := next_row + 1;
  end loop;
  -- Google values.append returned the FIRST appended row. Tickets rely on this.
  return first_row;
end;
$$;

create or replace function public.app_write_ranges(p_sheet text, p_ranges jsonb)
returns void language plpgsql security invoker set search_path = ''
set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  patch jsonb;
  input_rows jsonb;
  input_row jsonb;
  new_cells jsonb;
  start_row integer;
  start_col integer;
  row_offset integer;
  col_offset integer;
begin
  if p_sheet is null or jsonb_typeof(p_ranges) is distinct from 'array' then raise exception 'Invalid ranges'; end if;
  if jsonb_array_length(p_ranges) not between 1 and 1000 then raise exception 'Invalid range count'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('app_rows:' || p_sheet, 0));
  for patch in select value from jsonb_array_elements(p_ranges) loop
    if coalesce(patch->>'start_row','') !~ '^[0-9]+$' or coalesce(patch->>'start_col','') !~ '^[0-9]+$' then raise exception 'Invalid cell address'; end if;
    start_row := (patch->>'start_row')::integer;
    start_col := (patch->>'start_col')::integer;
    input_rows := patch->'values';
    if start_row < 2 or start_col not between 1 and 64 or jsonb_typeof(input_rows) is distinct from 'array' then raise exception 'Invalid cell payload'; end if;
    if jsonb_array_length(input_rows) not between 1 and 1000 then raise exception 'Invalid row count'; end if;
    for row_offset in 0 .. jsonb_array_length(input_rows) - 1 loop
      input_row := input_rows -> row_offset;
      if jsonb_typeof(input_row) is distinct from 'array' then raise exception 'Invalid row'; end if;
      if jsonb_array_length(input_row) not between 1 and 65 - start_col or exists (
        select 1 from jsonb_array_elements(input_row) cell where jsonb_typeof(cell) in ('array','object')
      ) then raise exception 'Invalid cells'; end if;
      select cells into new_cells from public.app_rows
        where sheet = p_sheet and row_num = start_row + row_offset for update;
      if not found then raise exception 'Application row not found'; end if;
      for col_offset in 0 .. jsonb_array_length(input_row) - 1 loop
        while jsonb_array_length(new_cells) < start_col + col_offset loop
          new_cells := new_cells || '[""]'::jsonb;
        end loop;
        new_cells := jsonb_set(new_cells, array[(start_col + col_offset - 1)::text], input_row -> col_offset);
      end loop;
      update public.app_rows set cells = new_cells
        where sheet = p_sheet and row_num = start_row + row_offset;
    end loop;
  end loop;
end;
$$;

-- Read-only preflight checks the RPCs, table privileges/RLS and bucket privacy.
create or replace function public.app_check_setup()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'rls', (select relrowsecurity from pg_catalog.pg_class where oid = 'public.app_rows'::regclass),
    'server_write', has_function_privilege(current_user,'public.app_append_rows(text,jsonb)','EXECUTE')
      and has_function_privilege(current_user,'public.app_write_ranges(text,jsonb)','EXECUTE'),
    'client_access', has_table_privilege('anon','public.app_rows','SELECT')
      or has_table_privilege('authenticated','public.app_rows','SELECT')
      or has_function_privilege('anon','public.app_append_rows(text,jsonb)','EXECUTE')
      or has_function_privilege('authenticated','public.app_append_rows(text,jsonb)','EXECUTE')
      or has_function_privilege('anon','public.app_write_ranges(text,jsonb)','EXECUTE')
      or has_function_privilege('authenticated','public.app_write_ranges(text,jsonb)','EXECUTE'),
    'private_buckets', (select count(*) from storage.buckets
      where id in ('assignment-submissions','exam-images') and public = false)
  );
$$;

revoke all on function public.app_append_rows(text,jsonb) from public, anon, authenticated;
revoke all on function public.app_write_ranges(text,jsonb) from public, anon, authenticated;
revoke all on function public.app_check_setup() from public, anon, authenticated;
grant execute on function public.app_append_rows(text,jsonb) to service_role;
grant execute on function public.app_write_ranges(text,jsonb) to service_role;
grant execute on function public.app_check_setup() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('assignment-submissions','assignment-submissions',false,2097152,
  array['image/jpeg','image/png','image/webp','application/pdf']),
  ('exam-images','exam-images',false,220000,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

commit;
