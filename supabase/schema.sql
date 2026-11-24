-- =====================================================================
--  SISTEM PENGURUSAN KUNCI (NFC) - SKEMA SUPABASE
--  Backend sistem kunci (jadual + fungsi RPC).
--
--  Cara guna: Supabase Dashboard > SQL Editor > New query > tampal fail ini > Run.
--  Selamat dijalankan semula (idempotent): data sedia ada TIDAK dipadam.
--
--  Reka bentuk: semua logik berjalan di dalam pangkalan data sebagai fungsi RPC
--  (api_daftar, api_login, api_logout, api_dashboard, api_imbas). PWA memanggil
--  /rest/v1/rpc/<fungsi> dengan kunci publishable (anon). Jadual TIDAK boleh dibaca
--  terus oleh anon (RLS aktif tanpa polisi + semua kebenaran dicabut), jadi hash kata
--  laluan dan sesi tidak pernah terdedah. Setiap tindakan = SATU panggilan rangkaian.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;                 -- fungsi dalaman (tidak didedahkan melalui API)
revoke all on schema app from public;

-- ---------------------------------------------------------------------
--  JADUAL
-- ---------------------------------------------------------------------
-- Senarai bilik/kunci (ganti tab Nama_Bilik). Tambah/ubah bilik melalui Table Editor.
create table if not exists public.bilik (
  id_kunci   text primary key,
  nama_bilik text not null,
  dicipta    timestamptz not null default now()
);

-- Sejarah imbasan (ganti tab Log_Imbas). Status semasa dikira daripada rekod terakhir.
create table if not exists public.log_imbas (
  id        bigint generated always as identity primary key,
  masa      timestamptz not null default now(),
  id_kunci  text not null,
  nama_guru text not null,
  tindakan  text not null check (tindakan in ('Ambil', 'Pulang'))
);
create index if not exists log_imbas_kunci_idx on public.log_imbas (id_kunci, id desc);
-- ID unik imbasan daripada telefon (elak rekod berganda apabila penghantaran diulang)
alter table public.log_imbas add column if not exists idem text;
create unique index if not exists log_imbas_idem_uq on public.log_imbas (idem) where idem is not null;

-- Akaun guru (ganti tab Pengguna). Hash bcrypt (garam terkandung dalam hash).
-- Untuk menyekat akaun: tukar status kepada selain 'Aktif' (cth 'Digantung').
create table if not exists public.pengguna (
  username      text primary key,
  nama_penuh    text not null,
  hash          text not null,
  peranan       text not null default 'Pentadbir',
  status        text not null default 'Aktif',
  tarikh_daftar timestamptz not null default now()
);

-- Sesi log masuk (ganti Script Properties). Hanya cincangan token disimpan.
create table if not exists public.sesi (
  token_hash text primary key,
  username   text not null references public.pengguna (username) on delete cascade on update cascade,
  tamat      timestamptz not null
);
create index if not exists sesi_tamat_idx on public.sesi (tamat);

-- Kiraan cubaan log masuk gagal (ganti CacheService)
create table if not exists public.gagal_login (
  username text primary key,
  kiraan   int not null default 0,
  mula     timestamptz not null default now()
);

-- Kunci sentiasa HURUF BESAR tanpa ruang tepi, supaya ?kunci=makmal-1 sepadan MAKMAL-1
create or replace function app.normalkan_kunci() returns trigger language plpgsql as $$
begin
  new.id_kunci := upper(trim(new.id_kunci));
  return new;
end $$;
drop trigger if exists bilik_normal on public.bilik;
create trigger bilik_normal before insert or update on public.bilik for each row execute function app.normalkan_kunci();
drop trigger if exists log_normal on public.log_imbas;
create trigger log_normal before insert or update on public.log_imbas for each row execute function app.normalkan_kunci();

-- Kunci pintu jadual: anon/authenticated tidak boleh baca atau tulis terus.
alter table public.bilik       enable row level security;
alter table public.log_imbas   enable row level security;
alter table public.pengguna    enable row level security;
alter table public.sesi        enable row level security;
alter table public.gagal_login enable row level security;
revoke all on public.bilik, public.log_imbas, public.pengguna, public.sesi, public.gagal_login from anon, authenticated, public;

-- ---------------------------------------------------------------------
--  FUNGSI DALAMAN (schema app)
-- ---------------------------------------------------------------------
create or replace function app.ralat(msg text) returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', msg)
$$;

-- ISO 8601 zon Malaysia: 2026-11-21T20:05:00+08:00
create or replace function app.iso(t timestamptz) returns text language sql immutable as $$
  select case when t is null then '' else
    to_char(t at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI:SS') || '+08:00' end
$$;

-- Paparan 12 jam dengan waktu: "21/11/2026 8:05 pagi"
create or replace function app.masa12(t timestamptz) returns text language plpgsql immutable as $$
declare
  l timestamp := t at time zone 'Asia/Kuala_Lumpur';
  j int := extract(hour from l);
begin
  return to_char(l, 'DD/MM/YYYY') || ' ' || coalesce(nullif(j % 12, 0), 12) || ':' || to_char(l, 'MI') || ' ' ||
    case when j < 12 then 'pagi' when j < 14 then 'T/hari' when j < 19 then 'petang' else 'malam' end;
end $$;

-- Pengguna bagi token sesi yang sah & akaun masih Aktif (tiada baris jika tidak sah)
create or replace function app.sesi_pengguna(p_token text)
returns table (username text, nama text, peranan text)
language sql stable security definer set search_path = public, extensions as $$
  select p.username, p.nama_penuh, p.peranan
  from public.sesi s join public.pengguna p on p.username = s.username
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.tamat > now() and p.status = 'Aktif'
$$;

create or replace function app.buat_sesi(p_username text, p_ingat boolean) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  delete from public.sesi where tamat < now();
  insert into public.sesi (token_hash, username, tamat)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), p_username,
          now() + case when p_ingat then interval '90 days' else interval '7 days' end);
  return tok;
end $$;

revoke all on function app.sesi_pengguna(text), app.buat_sesi(text, boolean) from public, anon, authenticated;

-- Rekod berpasangan: setiap Ambil digandingkan dengan Pulang seterusnya bagi kunci yang sama;
-- Pulang tanpa Ambil sebelumnya menjadi entri berasingan. ids = id baris log yang membentuk entri.
create or replace function app.entri_log()
returns table (id bigint, urut timestamptz, ids bigint[], obj jsonb)
language sql stable as $$
  with l as (
    select id, masa, id_kunci, nama_guru, tindakan,
           lead(id)        over w as n_id, lead(tindakan) over w as n_t,
           lead(masa)      over w as n_m,  lead(nama_guru) over w as n_g,
           lag(tindakan)   over w as p_t
    from public.log_imbas
    window w as (partition by id_kunci order by id)
  )
  select l.id, l.masa,
         case when l.n_t = 'Pulang' then array[l.id, l.n_id] else array[l.id] end,
         jsonb_build_object('ids', case when l.n_t = 'Pulang' then jsonb_build_array(l.id, l.n_id) else jsonb_build_array(l.id) end,
           'idKunci', l.id_kunci, 'bilik', coalesce(b.nama_bilik, l.id_kunci), 'guru', l.nama_guru,
           'masaAmbil', app.iso(l.masa),
           'masaPulang', case when l.n_t = 'Pulang' then app.iso(l.n_m) else '' end,
           'guruPulang', case when l.n_t = 'Pulang' then l.n_g else '' end,
           'status', case when l.n_t = 'Pulang' then 'Sudah Pulang' else 'Belum Pulang' end)
  from l left join public.bilik b on b.id_kunci = l.id_kunci
  where l.tindakan = 'Ambil'
  union all
  select l.id, l.masa, array[l.id],
         jsonb_build_object('ids', jsonb_build_array(l.id), 'idKunci', l.id_kunci, 'bilik', coalesce(b.nama_bilik, l.id_kunci),
           'guru', l.nama_guru, 'masaAmbil', '', 'masaPulang', app.iso(l.masa), 'guruPulang', l.nama_guru, 'status', 'Sudah Pulang')
  from l left join public.bilik b on b.id_kunci = l.id_kunci
  where l.tindakan = 'Pulang' and l.p_t is distinct from 'Ambil'
$$;
revoke all on function app.entri_log() from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  API (dipanggil PWA melalui /rest/v1/rpc/<nama>, badan: {"b": {...}})
--  Ralat dipulangkan sebagai {ok:false,error} (bukan exception) supaya
--  kiraan cubaan gagal kekal disimpan.
-- ---------------------------------------------------------------------
create or replace function public.api_daftar(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uname text := lower(trim(coalesce(b->>'username', '')));
  nm    text := trim(coalesce(b->>'nama', ''));
  pw    text := coalesce(b->>'password', '');
  tok   text;
begin
  if uname !~ '^[a-z0-9._@-]{3,60}$' then return app.ralat('Nama pengguna mesti 3-60 aksara (huruf, nombor, . _ @ -).'); end if;
  if nm = '' or length(nm) > 80 then return app.ralat('Nama penuh diperlukan (maksimum 80 aksara).'); end if;
  if nm ~ '^[=+@-]' then return app.ralat('Nama penuh tidak boleh bermula dengan = + - @'); end if;
  if length(pw) < 8 then return app.ralat('Kata laluan mesti sekurang-kurangnya 8 aksara.'); end if;
  if octet_length(pw) > 72 then return app.ralat('Kata laluan terlalu panjang (maksimum 72 aksara).'); end if;

  begin
    insert into public.pengguna (username, nama_penuh, hash)
    values (uname, nm, crypt(pw, gen_salt('bf', 8)));
  exception when unique_violation then
    return app.ralat('Nama pengguna sudah wujud.');
  end;

  tok := app.buat_sesi(uname, coalesce((b->>'ingat')::boolean, false));
  return jsonb_build_object('ok', true, 'token', tok, 'mesej', 'Pendaftaran berjaya.',
    'pengguna', jsonb_build_object('username', uname, 'nama', nm, 'peranan', 'Pentadbir'));
end $$;

create or replace function public.api_login(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uname text := left(lower(trim(coalesce(b->>'username', ''))), 60);
  pw    text := coalesce(b->>'password', '');
  g     public.gagal_login;
  u     public.pengguna;
  tok   text;
begin
  if uname = '' or pw = '' then return app.ralat('Sila isi nama pengguna dan kata laluan.'); end if;

  select * into g from public.gagal_login where username = uname;
  if found and g.kiraan >= 5 and g.mula > now() - interval '15 minutes' then
    return app.ralat('Terlalu banyak cubaan gagal. Cuba lagi selepas 15 minit.');
  end if;

  select * into u from public.pengguna where username = uname;
  if not found or u.hash <> crypt(pw, u.hash) then
    delete from public.gagal_login where mula < now() - interval '15 minutes';
    insert into public.gagal_login as t (username, kiraan, mula) values (uname, 1, now())
    on conflict (username) do update set
      kiraan = case when t.mula > now() - interval '15 minutes' then t.kiraan + 1 else 1 end,
      mula   = case when t.mula > now() - interval '15 minutes' then t.mula else now() end;
    return app.ralat('Nama pengguna atau kata laluan salah.');
  end if;

  delete from public.gagal_login where username = uname;
  if u.status <> 'Aktif' then return app.ralat('Akaun anda telah disekat. Sila hubungi admin.'); end if;

  tok := app.buat_sesi(uname, coalesce((b->>'ingat')::boolean, false));
  return jsonb_build_object('ok', true, 'token', tok,
    'pengguna', jsonb_build_object('username', u.username, 'nama', u.nama_penuh, 'peranan', u.peranan));
end $$;

create or replace function public.api_logout(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.sesi
  where token_hash = encode(extensions.digest(coalesce(b->>'token', ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_dashboard(b jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  u   record;
  res jsonb;
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Sesi tamat atau tidak sah. Sila log masuk semula.');
  end if;

  select jsonb_build_object(
    'ok', true,
    'dijana', app.iso(now()),
    'bilik', coalesce((
      select jsonb_agg(jsonb_build_object(
               'idKunci', b.id_kunci, 'nama', b.nama_bilik,
               'status', case when t.tindakan = 'Ambil' then 'Ambil' else 'Pulang' end,
               'pemegang', case when t.tindakan = 'Ambil' then t.nama_guru else '-' end,
               'masaAmbil', case when t.tindakan = 'Ambil' then app.iso(t.masa) else '' end)
             order by b.dicipta, b.id_kunci)
      from public.bilik b
      left join lateral (select x.tindakan, x.nama_guru, x.masa from public.log_imbas x
                         where x.id_kunci = b.id_kunci order by x.id desc limit 1) t on true
    ), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(x.obj order by x.urut desc, x.id desc)
                     from (select * from app.entri_log() order by urut desc, id desc limit 300) x), '[]'::jsonb),
    'jumlahLog', (select count(*) from app.entri_log()),
    'pengguna', jsonb_build_object('username', u.username, 'nama', u.nama, 'peranan', u.peranan)
  ) into res;
  return res;
end $$;

-- Rekod imbasan. Parameter pilihan:
--   idem : ID unik imbasan daripada telefon. Penghantaran semula (respons hilang / baris gilir luar talian)
--          tidak mencipta rekod kedua; rekod asal dipulangkan.
--   masa : masa tap sebenar (ISO) bagi imbasan yang disimpan semasa tiada internet.
--          Hanya diterima jika dalam 24 jam lepas; selainnya masa pelayan digunakan.
create or replace function public.api_imbas(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u    record;
  kid  text := upper(trim(coalesce(b->>'kunci', '')));
  idm  text := nullif(left(coalesce(b->>'idem', ''), 64), '');
  bk   public.bilik;
  lst  public.log_imbas;
  tind text;
  now_ timestamptz := clock_timestamp();
  m    timestamptz := clock_timestamp();
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Hanya guru berdaftar boleh merekod kunci. Sila log masuk.');
  end if;
  if kid = '' then return app.ralat('ID kunci kosong. Semak URL tag NFC (mesti berakhir dengan ?kunci=ID_KUNCI).'); end if;
  select * into bk from public.bilik where id_kunci = kid;
  if not found then return app.ralat('ID kunci "' || left(coalesce(b->>'kunci', ''), 80) || '" tiada dalam senarai bilik.'); end if;

  if b ? 'masa' then
    begin
      m := (b->>'masa')::timestamptz;
      if m < now_ - interval '24 hours' or m > now_ + interval '2 minutes' then m := now_; end if;
    exception when others then m := now_;
    end;
  end if;

  -- Serialkan imbasan bagi kunci yang sama (dua tap serentak tidak menghasilkan dua rekod)
  perform pg_advisory_xact_lock(hashtext('imbas:' || kid));

  if idm is not null then
    select * into lst from public.log_imbas where idem = idm;
    if found then
      return jsonb_build_object('ok', true, 'ulang', true, 'bilik', bk.nama_bilik,
        'tindakan', lst.tindakan, 'guru', lst.nama_guru, 'masa', app.masa12(lst.masa));
    end if;
  end if;

  select * into lst from public.log_imbas where id_kunci = kid order by id desc limit 1;

  -- Imbasan berganda oleh guru yang sama dalam 60 saat: pulangkan rekod sedia ada
  if found and lower(lst.nama_guru) = lower(u.nama) and abs(extract(epoch from (m - lst.masa))) < 60 then
    return jsonb_build_object('ok', true, 'ulang', true, 'bilik', bk.nama_bilik,
      'tindakan', lst.tindakan, 'guru', lst.nama_guru, 'masa', app.masa12(lst.masa));
  end if;

  tind := case when found and lst.tindakan = 'Ambil' then 'Pulang' else 'Ambil' end;
  insert into public.log_imbas (masa, id_kunci, nama_guru, tindakan, idem) values (m, kid, u.nama, tind, idm);
  return jsonb_build_object('ok', true, 'bilik', bk.nama_bilik, 'tindakan', tind, 'guru', u.nama, 'masa', app.masa12(m));
end $$;

-- Padam rekod (hanya peranan 'Admin'). b.ids = senarai id baris log_imbas.
create or replace function public.api_padam_log(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u record;
  ids bigint[];
  n int;
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Sesi tamat atau tidak sah. Sila log masuk semula.');
  end if;
  if u.peranan <> 'Admin' then return app.ralat('Hanya Admin boleh memadam rekod.'); end if;
  begin
    select array_agg(x::bigint) into ids from jsonb_array_elements_text(coalesce(b->'ids', '[]'::jsonb)) x;
  exception when others then
    return app.ralat('Senarai rekod tidak sah.');
  end;
  if ids is null or cardinality(ids) = 0 or cardinality(ids) > 10 then return app.ralat('Senarai rekod tidak sah.'); end if;
  delete from public.log_imbas where id = any(ids);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'dipadam', n);
end $$;

-- Data laporan PDF: rekod berpasangan (mengikut tarikh ambil) dari b.dari hingga b.hingga (YYYY-MM-DD, waktu Malaysia)
create or replace function public.api_eksport(b jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  u record;
  d1 date;
  d2 date;
  jml int;
  rows_ jsonb;
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Sesi tamat atau tidak sah. Sila log masuk semula.');
  end if;
  begin
    d1 := (b->>'dari')::date; d2 := (b->>'hingga')::date;
  exception when others then
    return app.ralat('Tarikh tidak sah.');
  end;
  if d1 is null or d2 is null or d2 < d1 then return app.ralat('Tarikh tidak sah.'); end if;
  if d2 - d1 > 366 then return app.ralat('Julat tarikh maksimum 1 tahun.'); end if;

  select count(*) into jml from app.entri_log() e
   where (e.urut at time zone 'Asia/Kuala_Lumpur')::date between d1 and d2;
  select coalesce(jsonb_agg(x.obj order by x.urut, x.id), '[]'::jsonb) into rows_
   from (select e.* from app.entri_log() e
          where (e.urut at time zone 'Asia/Kuala_Lumpur')::date between d1 and d2
          order by e.urut, e.id limit 5000) x;
  return jsonb_build_object('ok', true, 'dari', d1, 'hingga', d2, 'jumlah', jml, 'dipotong', jml > 5000,
    'rows', rows_, 'pengguna', jsonb_build_object('username', u.username, 'nama', u.nama));
end $$;

-- Denyut: dipanggil berkala (GitHub Actions) supaya projek percuma tidak dijeda kerana tidak aktif
create or replace function public.api_ping(b jsonb) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('ok', true, 'bilik', (select count(*) from public.bilik), 'masa', app.iso(now()))
$$;

-- Hanya fungsi API didedahkan kepada PWA
revoke all on function public.api_daftar(jsonb), public.api_login(jsonb), public.api_logout(jsonb),
                       public.api_dashboard(jsonb), public.api_imbas(jsonb), public.api_padam_log(jsonb),
                       public.api_eksport(jsonb), public.api_ping(jsonb) from public;
grant execute on function public.api_daftar(jsonb), public.api_login(jsonb), public.api_logout(jsonb),
                          public.api_dashboard(jsonb), public.api_imbas(jsonb), public.api_padam_log(jsonb),
                          public.api_eksport(jsonb), public.api_ping(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
--  ADMIN: urus bilik & akaun guru (semua memerlukan peranan 'Admin')
-- ---------------------------------------------------------------------
create or replace function app.senarai_bilik() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('idKunci', id_kunci, 'nama', nama_bilik) order by dicipta, id_kunci), '[]'::jsonb)
  from public.bilik
$$;

create or replace function app.senarai_pengguna() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', username, 'nama', nama_penuh, 'peranan', peranan,
                                               'status', status, 'daftar', app.iso(tarikh_daftar))
                            order by tarikh_daftar desc, username), '[]'::jsonb)
  from (select * from public.pengguna order by tarikh_daftar desc, username limit 1000) x
$$;
revoke all on function app.senarai_bilik(), app.senarai_pengguna() from public, anon, authenticated;

-- op: 'tambah' (id, nama) | 'namakan' (id, nama) | 'padam' (id). ID kunci tidak boleh diubah (tag NFC merujuknya).
create or replace function public.api_admin_bilik(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u   record;
  op  text := b->>'op';
  kid text := upper(trim(coalesce(b->>'id', '')));
  nm  text := trim(coalesce(b->>'nama', ''));
  n   int;
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Sesi tamat atau tidak sah. Sila log masuk semula.');
  end if;
  if u.peranan <> 'Admin' then return app.ralat('Hanya Admin boleh mengurus bilik.'); end if;

  if op = 'tambah' then
    if kid !~ '^[A-Z0-9][A-Z0-9-]{1,59}$' then return app.ralat('ID kunci mesti 2-60 aksara: huruf, nombor dan sempang (-).'); end if;
    if nm = '' or length(nm) > 80 then return app.ralat('Nama bilik diperlukan (maksimum 80 aksara).'); end if;
    begin
      insert into public.bilik (id_kunci, nama_bilik) values (kid, nm);
    exception when unique_violation then
      return app.ralat('ID kunci "' || kid || '" sudah wujud.');
    end;
  elsif op = 'namakan' then
    if nm = '' or length(nm) > 80 then return app.ralat('Nama bilik diperlukan (maksimum 80 aksara).'); end if;
    update public.bilik set nama_bilik = nm where id_kunci = kid;
    get diagnostics n = row_count;
    if n = 0 then return app.ralat('Bilik tidak dijumpai.'); end if;
  elsif op = 'padam' then
    if exists (select 1 from (select tindakan from public.log_imbas where id_kunci = kid order by id desc limit 1) x
               where x.tindakan = 'Ambil') then
      return app.ralat('Kunci ini sedang diambil. Pulangkan dahulu sebelum memadam bilik.');
    end if;
    delete from public.bilik where id_kunci = kid;
    get diagnostics n = row_count;
    if n = 0 then return app.ralat('Bilik tidak dijumpai.'); end if;
  else
    return app.ralat('Tindakan tidak dikenali.');
  end if;
  return jsonb_build_object('ok', true, 'bilik', app.senarai_bilik());
end $$;

create or replace function public.api_admin_pengguna_senarai(b jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  u record;
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Sesi tamat atau tidak sah. Sila log masuk semula.');
  end if;
  if u.peranan <> 'Admin' then return app.ralat('Hanya Admin boleh mengurus akaun.'); end if;
  return jsonb_build_object('ok', true, 'saya', u.username, 'pengguna', app.senarai_pengguna());
end $$;

-- op: 'status' (nilai: Aktif|Digantung) | 'peranan' (nilai: Admin|Pentadbir) | 'katalaluan' (nilai: kata laluan baharu)
-- Admin tidak boleh menyekat atau menurunkan akaunnya sendiri (sentiasa ada sekurang-kurangnya seorang Admin).
create or replace function public.api_admin_pengguna(b jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u   record;
  op  text := b->>'op';
  tgt text := lower(trim(coalesce(b->>'sasaran', '')));
  v   text := coalesce(b->>'nilai', '');
begin
  select * into u from app.sesi_pengguna(b->>'token');
  if not found then
    return jsonb_build_object('ok', false, 'auth', false, 'error', 'Sesi tamat atau tidak sah. Sila log masuk semula.');
  end if;
  if u.peranan <> 'Admin' then return app.ralat('Hanya Admin boleh mengurus akaun.'); end if;
  if not exists (select 1 from public.pengguna where username = tgt) then return app.ralat('Pengguna tidak dijumpai.'); end if;

  if op = 'status' then
    if v not in ('Aktif', 'Digantung') then return app.ralat('Status tidak sah.'); end if;
    if tgt = u.username then return app.ralat('Anda tidak boleh menyekat akaun sendiri.'); end if;
    update public.pengguna set status = v where username = tgt;
    if v <> 'Aktif' then delete from public.sesi where username = tgt; end if;
  elsif op = 'peranan' then
    if v not in ('Admin', 'Pentadbir') then return app.ralat('Peranan tidak sah.'); end if;
    if tgt = u.username then return app.ralat('Anda tidak boleh menukar peranan sendiri.'); end if;
    update public.pengguna set peranan = v where username = tgt;
  elsif op = 'katalaluan' then
    if length(v) < 8 then return app.ralat('Kata laluan mesti sekurang-kurangnya 8 aksara.'); end if;
    if octet_length(v) > 72 then return app.ralat('Kata laluan terlalu panjang (maksimum 72 aksara).'); end if;
    update public.pengguna set hash = crypt(v, gen_salt('bf', 8)) where username = tgt;
    -- Log keluar semua peranti guru itu (kecuali sesi Admin ini jika menukar kata laluan sendiri) & buka kunci cubaan gagal
    delete from public.sesi where username = tgt
      and token_hash <> encode(extensions.digest(coalesce(b->>'token', ''), 'sha256'), 'hex');
    delete from public.gagal_login where username = tgt;
  else
    return app.ralat('Tindakan tidak dikenali.');
  end if;
  return jsonb_build_object('ok', true, 'saya', u.username, 'pengguna', app.senarai_pengguna());
end $$;

revoke all on function public.api_admin_bilik(jsonb), public.api_admin_pengguna_senarai(jsonb), public.api_admin_pengguna(jsonb) from public;
grant execute on function public.api_admin_bilik(jsonb), public.api_admin_pengguna_senarai(jsonb), public.api_admin_pengguna(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
--  REALTIME: dashboard dikemas kini serta-merta apabila ada imbasan baharu / rekod dipadam.
--  Hanya isyarat kosong dihantar melalui saluran awam "kunci-log" (tiada data peribadi);
--  PWA kemudian memanggil api_dashboard dengan tokennya. Jika Realtime tidak tersedia,
--  imbasan tetap direkod (ralat ditelan) dan PWA kembali kepada pemuatan berkala.
-- ---------------------------------------------------------------------
create or replace function app.isyarat_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'ubah', 'kunci-log', false);
  exception when others then
    null;
  end;
  return null;
end $$;
revoke all on function app.isyarat_log() from public, anon, authenticated;
drop trigger if exists log_isyarat on public.log_imbas;
create trigger log_isyarat after insert or delete on public.log_imbas for each statement execute function app.isyarat_log();

-- ---------------------------------------------------------------------
--  DATA CONTOH (buang tanda komen & ubah mengikut bilik sebenar)
--  ID_Kunci mesti sama dengan ?kunci=ID pada tag NFC.
-- ---------------------------------------------------------------------
-- insert into public.bilik (id_kunci, nama_bilik) values
--   ('MAKMAL-KOMPUTER-1', 'Makmal Komputer 1'),
--   ('BILIK-PENDIDIKAN-SENI', 'Bilik Pendidikan Seni'),
--   ('BILIK-MUZIK', 'Bilik Muzik')
-- on conflict (id_kunci) do nothing;
