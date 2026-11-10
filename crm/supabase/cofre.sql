-- Cofre do CRM Fortaleza Move (retrato cifrado da pasta data/). Aplicar num projeto Supabase novo.
-- O CRM chama só as duas funções abaixo (PostgREST /rest/v1/rpc/...), com a chave publicável e o SNAPSHOT_TOKEN.
-- O conteúdo chega cifrado (AES-256-GCM, chave SNAPSHOT_KEY que só o servidor conhece): o Supabase nunca vê os dados.
-- Depois de aplicar, cadastrar o hash do token:
--   insert into cofre.acesso (token_hash) values (encode(sha256(convert_to('<SNAPSHOT_TOKEN>', 'UTF8')), 'hex'));
-- Durante uma troca de token, os dois hashes podem coexistir; depois, apagar o antigo.

create schema if not exists cofre;
revoke all on schema cofre from public, anon, authenticated;

create table if not exists cofre.acesso (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists cofre.snapshot (
  id int primary key check (id = 1),
  dados text,
  versao bigint not null default 0,
  dono text,
  atualizado_em timestamptz not null default now()
);

-- Versões antigas: 1 por hora nas últimas 48 h e 1 por dia até 15 dias. Não há função de apagar exposta.
-- Restaurar: update cofre.snapshot set dados = (select dados from cofre.historico where id = <ID>) where id = 1;
create table if not exists cofre.historico (
  id bigint generated always as identity primary key,
  versao bigint not null,
  dados text not null,
  criado_em timestamptz not null default now()
);
create index if not exists historico_criado on cofre.historico (criado_em);

alter table cofre.acesso enable row level security;
alter table cofre.snapshot enable row level security;
alter table cofre.historico enable row level security;
revoke all on all tables in schema cofre from public, anon, authenticated;

create or replace function cofre._confere(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from cofre.acesso where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
end $$;
revoke all on function cofre._confere(text) from public, anon, authenticated;

-- Novo processo (deploy/reinício) assume o cofre: daqui em diante só ele grava.
create or replace function public.crm_snapshot_assumir(p_token text, p_dono text) returns json
language plpgsql security definer set search_path = '' as $$
declare r cofre.snapshot;
begin
  perform cofre._confere(p_token);
  if p_dono is null or length(p_dono) > 200 then raise exception 'dono_invalido'; end if;
  insert into cofre.snapshot (id, dono) values (1, p_dono)
    on conflict (id) do update set dono = excluded.dono, atualizado_em = now()
    returning * into r;
  return json_build_object('dados', r.dados, 'versao', r.versao);
end $$;

create or replace function public.crm_snapshot_gravar(p_token text, p_dono text, p_dados text) returns json
language plpgsql security definer set search_path = '' as $$
declare r cofre.snapshot;
begin
  perform cofre._confere(p_token);
  if p_dados is null or length(p_dados) > 60000000 or left(p_dados, 4) <> 'Rk1T' then raise exception 'dados_invalidos'; end if;
  update cofre.snapshot set dados = p_dados, versao = versao + 1, atualizado_em = now()
    where id = 1 and dono = p_dono returning * into r;
  if not found then raise exception 'outro_dono'; end if;
  if not exists (select 1 from cofre.historico where criado_em > now() - interval '1 hour') then
    insert into cofre.historico (versao, dados) values (r.versao, r.dados);
    delete from cofre.historico h where h.criado_em < now() - interval '15 days';
    delete from cofre.historico h where h.criado_em < now() - interval '48 hours'
      and exists (select 1 from cofre.historico o where date_trunc('day', o.criado_em) = date_trunc('day', h.criado_em) and o.id < h.id);
  end if;
  return json_build_object('versao', r.versao);
end $$;

revoke all on function public.crm_snapshot_assumir(text, text) from public, authenticated;
revoke all on function public.crm_snapshot_gravar(text, text, text) from public, authenticated;
grant execute on function public.crm_snapshot_assumir(text, text) to anon;
grant execute on function public.crm_snapshot_gravar(text, text, text) to anon;
