-- ===== TABELAS =====
create table professionals (
  id text primary key,
  tag text,
  name text,
  role text,
  description text,
  work_days int[],
  shifts jsonb,
  slot_minutes int
);

create table bookings (
  id text primary key,
  prof_id text references professionals(id),
  prof_name text,
  prof_role text,
  date text,
  time text,
  name text,
  email text,
  status text default 'pendente',
  created_at timestamptz default now(),
  unique (prof_id, date, time)
);

create table blocked_slots (
  id text primary key,
  prof_id text,
  date text,
  time text
);

create table extra_slots (
  id text primary key,
  prof_id text,
  date text,
  time text
);

create table retornos (
  id text primary key,
  booking_id text,
  prof_id text,
  prof_name text,
  employee_name text,
  employee_email text,
  motivo text,
  note text,
  due_date text,
  created_at timestamptz default now(),
  status text default 'pendente'
);

create table notifications (
  id text primary key,
  type text,
  message text,
  created_at timestamptz default now(),
  read boolean default false
);

create table settings (
  id int primary key default 1,
  company_email_domain text,
  days_ahead int
);

-- ===== DADOS INICIAIS =====
insert into settings (id, company_email_domain, days_ahead) values (1, 'suaempresa.com.br', 30);

insert into professionals (id, tag, name, role, description, work_days, shifts, slot_minutes) values
('medica', 'Saúde física', 'Dra. Fernanda Lima', 'Médica do trabalho',
 'Consultas clínicas gerais, atestados e exames periódicos.',
 '{1,2,3,4,5}', '[{"start":"08:00","end":"12:00"},{"start":"13:00","end":"17:00"}]', 30),
('psicologa', 'Saúde mental', 'Camila Rocha', 'Psicóloga',
 'Escuta psicológica e acompanhamento emocional individual.',
 '{1,2,3,4}', '[{"start":"09:00","end":"16:00"}]', 50),
('gestao', 'Acompanhamento com a gestão', 'Nome do Responsável', 'Gestão de Pessoas',
 'Conversas sobre carreira, desempenho e alinhamento com a liderança.',
 '{1,2,3,4,5}', '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', 30);

-- ===== TEMPO REAL (para todos verem mudanças na hora) =====
alter publication supabase_realtime add table
  professionals, bookings, blocked_slots, extra_slots, retornos, notifications, settings;

-- ===== ACESSO =====
-- Sem login de usuário final (colaboradores não se autenticam), então liberamos
-- leitura/escrita geral. Isso é equivalente ao aviso de segurança já feito antes:
-- quem tiver a URL e a chave (visíveis no código do navegador) consegue ler/escrever.
-- Aceitável para uso interno; não use para dados sigilosos de verdade.
alter table professionals enable row level security;
alter table bookings enable row level security;
alter table blocked_slots enable row level security;
alter table extra_slots enable row level security;
alter table retornos enable row level security;
alter table notifications enable row level security;
alter table settings enable row level security;

create policy "public access" on professionals for all using (true) with check (true);
create policy "public access" on bookings for all using (true) with check (true);
create policy "public access" on blocked_slots for all using (true) with check (true);
create policy "public access" on extra_slots for all using (true) with check (true);
create policy "public access" on retornos for all using (true) with check (true);
create policy "public access" on notifications for all using (true) with check (true);
create policy "public access" on settings for all using (true) with check (true);

-- ================================================================
-- MIGRAÇÃO: perfis de acesso (Administrador, Visualizador da
-- Agenda, Médico) com validação real no backend via Supabase Auth
-- + Row Level Security. Rode este script no SQL Editor do Supabase
-- DEPOIS de já ter rodado o supabase_schema.sql original.
--
-- O que muda: o login do painel admin passa a usar contas de
-- verdade (Supabase Auth) em vez de senha única no JavaScript.
-- O colaborador (index.html) continua exatamente igual, sem login.
-- ================================================================

-- ----------------------------------------------------------------
-- 1) Tabela de perfis: cada usuário do painel (admin, visualizador
--    ou médico) tem uma linha aqui, ligada à conta de login dele.
-- ----------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  role text not null check (role in ('admin','visualizador','medico')),
  prof_id text references professionals(id), -- só usado quando role = 'medico'
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- ----------------------------------------------------------------
-- 2) Funções auxiliares (SECURITY DEFINER = rodam com permissão
--    ampla internamente, mas só devolvem info do usuário logado —
--    necessário para evitar loop infinito nas regras de profiles).
-- ----------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function auth_role() returns text
language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function auth_prof_id() returns text
language sql security definer stable as $$
  select prof_id from profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------
-- 3) Regras da tabela profiles: cada um vê o próprio perfil;
--    o admin vê e gerencia todos.
-- ----------------------------------------------------------------
create policy "ver proprio perfil" on profiles for select to authenticated
  using (id = auth.uid() or is_admin());
create policy "admin gerencia usuarios" on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------
-- 4) Repõe as políticas das tabelas já existentes, agora
--    diferenciando "anon" (colaborador, sem login — continua
--    exatamente como está hoje) de "authenticated" (painel admin,
--    agora com regra por papel).
-- ----------------------------------------------------------------

-- Remove as políticas antigas "liberado pra todo mundo"
drop policy if exists "public access" on professionals;
drop policy if exists "public access" on settings;
drop policy if exists "public access" on bookings;
drop policy if exists "public access" on blocked_slots;
drop policy if exists "public access" on extra_slots;
drop policy if exists "public access" on retornos;
drop policy if exists "public access" on notifications;

-- ===== professionals =====
-- leitura livre pra todo mundo (colaborador precisa ver a lista)
create policy "leitura geral" on professionals for select using (true);
-- escrita só pelo admin (cadastro de profissionais continua admin-only)
create policy "admin escreve" on professionals for all to authenticated
  using (is_admin()) with check (is_admin());

-- ===== settings =====
create policy "leitura geral" on settings for select using (true);
create policy "admin escreve" on settings for all to authenticated
  using (is_admin()) with check (is_admin());

-- ===== bookings =====
create policy "leitura geral" on bookings for select using (true);
-- colaborador (anon) continua podendo criar e cancelar agendamentos, como hoje
create policy "colaborador cria" on bookings for insert to anon with check (true);
create policy "colaborador cancela" on bookings for delete to anon using (true);
-- admin: tudo
create policy "admin escreve" on bookings for all to authenticated
  using (is_admin()) with check (is_admin());
-- médico: só na agenda dele (não inclui bloqueio, que é outra tabela)
create policy "medico gerencia propria agenda" on bookings for all to authenticated
  using (auth_role() = 'medico' and prof_id = auth_prof_id())
  with check (auth_role() = 'medico' and prof_id = auth_prof_id());
-- visualizador: nenhuma política de escrita casa com ele → só a leitura acima se aplica

-- ===== blocked_slots (bloqueios) — médico NÃO pode mexer aqui =====
create policy "leitura geral" on blocked_slots for select using (true);
create policy "admin escreve" on blocked_slots for all to authenticated
  using (is_admin()) with check (is_admin());

-- ===== extra_slots (criar/editar/excluir horário) =====
create policy "leitura geral" on extra_slots for select using (true);
create policy "admin escreve" on extra_slots for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "medico gerencia propria agenda" on extra_slots for all to authenticated
  using (auth_role() = 'medico' and prof_id = auth_prof_id())
  with check (auth_role() = 'medico' and prof_id = auth_prof_id());

-- ===== retornos =====
create policy "leitura geral" on retornos for select using (true);
create policy "admin escreve" on retornos for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "medico gerencia propria agenda" on retornos for all to authenticated
  using (auth_role() = 'medico' and prof_id = auth_prof_id())
  with check (auth_role() = 'medico' and prof_id = auth_prof_id());

-- ===== notifications =====
create policy "leitura geral" on notifications for select using (true);
create policy "colaborador cria" on notifications for insert to anon with check (true);
create policy "admin escreve" on notifications for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "medico registra" on notifications for insert to authenticated
  with check (auth_role() = 'medico');
create policy "medico marca lida" on notifications for update to authenticated
  using (auth_role() = 'medico') with check (auth_role() = 'medico');

-- ================================================================
-- 5) BOOTSTRAP: criar o primeiro usuário Administrador
-- ================================================================
-- Passo A — no painel do Supabase: Authentication > Users > Add user
--   (email + senha, marque "Auto Confirm User" para não precisar
--   confirmar por e-mail).
-- Passo B — copie o UUID desse usuário criado (aparece na lista) e
--   rode o comando abaixo, substituindo os valores:
--
-- insert into profiles (id, username, role)
-- values ('COLE_O_UUID_AQUI', 'admin', 'admin');
--
-- A partir daí, esse usuário já consegue entrar no painel como
-- Administrador e cadastrar os demais (visualizador/médico) direto
-- pela tela de Usuários do sistema.
