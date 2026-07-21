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
cat > /home/claude/agendamento/atualizar_dominio_email.sql << 'EOF' 
  update settings 
  set company_email_domain = 'conexaorastreadores.com.br' 
   where id = 1; 

EOF cat /home/claude/agendamento/atualizar_dominio_email.sql

  insert into settings (id, company_email_domain, days_ahead) values (1, 'conexaorastreadores.com.br', 30);

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

update settings 
  set company_email_domain = 'conexaorastreadores.com.br' 
  where id = 1;
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
