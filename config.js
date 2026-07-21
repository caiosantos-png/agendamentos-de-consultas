/* =========================================================
   CONFIGURAÇÃO PADRÃO
   Usada apenas se as tabelas do Supabase ainda estiverem vazias
   na primeira execução (fallback de segurança). O normal é que
   os dados já venham do banco, semeados pelo supabase_schema.sql.
   ========================================================= */
const DEFAULT_SETTINGS = {
  companyEmailDomain: "suaempresa.com.br",
  daysAhead: 30
};

const DEFAULT_PROFESSIONALS = [
  {
    id: "medica", tag: "Saúde física", name: "Dra. Fernanda Lima", role: "Médica do trabalho",
    description: "Consultas clínicas gerais, atestados e exames periódicos.",
    workDays: [1, 2, 3, 4, 5],
    shifts: [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "17:00" }],
    slotMinutes: 30
  },
  {
    id: "psicologa", tag: "Saúde mental", name: "Camila Rocha", role: "Psicóloga",
    description: "Escuta psicológica e acompanhamento emocional individual.",
    workDays: [1, 2, 3, 4],
    shifts: [{ start: "09:00", end: "16:00" }],
    slotMinutes: 50
  },
  {
    id: "gestao", tag: "Acompanhamento com a gestão", name: "Nome do Responsável", role: "Gestão de Pessoas",
    description: "Conversas sobre carreira, desempenho e alinhamento com a liderança.",
    workDays: [1, 2, 3, 4, 5],
    shifts: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }],
    slotMinutes: 30
  }
];

/* =========================================================
   CACHES EM MEMÓRIA
   -----------------------------------------------------------
   O resto do sistema (script.js, admin.js) lê e grava os dados
   através das funções get.../save... abaixo, exatamente como
   fazia com o localStorage. A diferença é que agora, por baixo
   dos panos, cada save... também envia a mudança para o Supabase,
   e os caches são atualizados automaticamente em tempo real
   quando qualquer outra pessoa (colaborador ou admin) muda algo,
   em qualquer computador.
   ========================================================= */
let professionalsCache = [];
let settingsCache = { ...DEFAULT_SETTINGS };
let bookingsCache = [];
let blockedSlotsCache = [];
let extraSlotsCache = [];
let retornosCache = [];
let notificationsCache = [];

/* =========================================================
   MAPEAMENTO JS (camelCase) <-> COLUNAS DO BANCO (snake_case)
   ========================================================= */
const M = {
  profToRow: p => ({ id: p.id, tag: p.tag, name: p.name, role: p.role, description: p.description, work_days: p.workDays, shifts: p.shifts, slot_minutes: p.slotMinutes }),
  profFromRow: r => ({ id: r.id, tag: r.tag, name: r.name, role: r.role, description: r.description, workDays: r.work_days, shifts: r.shifts, slotMinutes: r.slot_minutes }),

  bookingToRow: b => ({ id: b.id, prof_id: b.profId, prof_name: b.profName, prof_role: b.profRole, date: b.date, time: b.time, name: b.name, email: b.email, status: b.status, created_at: b.createdAt }),
  bookingFromRow: r => ({ id: r.id, profId: r.prof_id, profName: r.prof_name, profRole: r.prof_role, date: r.date, time: r.time, name: r.name, email: r.email, status: r.status, createdAt: r.created_at }),

  slotToRow: s => ({ id: s.id, prof_id: s.profId, date: s.date, time: s.time }),
  slotFromRow: r => ({ id: r.id, profId: r.prof_id, date: r.date, time: r.time }),

  retornoToRow: r => ({ id: r.id, booking_id: r.bookingId, prof_id: r.profId, prof_name: r.profName, employee_name: r.employeeName, employee_email: r.employeeEmail, motivo: r.motivo, note: r.note, due_date: r.dueDate, created_at: r.createdAt, status: r.status }),
  retornoFromRow: r => ({ id: r.id, bookingId: r.booking_id, profId: r.prof_id, profName: r.prof_name, employeeName: r.employee_name, employeeEmail: r.employee_email, motivo: r.motivo, note: r.note, dueDate: r.due_date, createdAt: r.created_at, status: r.status }),

  notifToRow: n => ({ id: n.id, type: n.type, message: n.message, created_at: n.createdAt, read: n.read }),
  notifFromRow: r => ({ id: r.id, type: r.type, message: r.message, createdAt: r.created_at, read: r.read })
};

/* =========================================================
   SINCRONIZAÇÃO GENÉRICA (grava a diferença entre a lista antiga
   e a nova no Supabase: insere o que é novo, atualiza o que mudou,
   remove o que sumiu)
   ========================================================= */
async function syncArrayDiff(table, prevList, newList, toRow) {
  const newIds = new Set(newList.map(x => x.id));
  for (const old of prevList) {
    if (!newIds.has(old.id)) {
      const { error } = await supabaseClient.from(table).delete().eq("id", old.id);
      if (error) console.error(`Erro ao excluir em ${table}:`, error);
    }
  }
  for (const item of newList) {
    const prev = prevList.find(x => x.id === item.id);
    if (!prev) {
      const { error } = await supabaseClient.from(table).insert(toRow(item));
      if (error) console.error(`Erro ao inserir em ${table}:`, error);
    } else if (JSON.stringify(prev) !== JSON.stringify(item)) {
      const { error } = await supabaseClient.from(table).update(toRow(item)).eq("id", item.id);
      if (error) console.error(`Erro ao atualizar em ${table}:`, error);
    }
  }
}

/* =========================================================
   PROFISSIONAIS
   ========================================================= */
function getProfessionals() { return professionalsCache; }
function saveProfessionals(list) {
  const prev = professionalsCache;
  professionalsCache = list;
  syncArrayDiff("professionals", prev, list, M.profToRow);
}
function getProfessionalById(id) { return professionalsCache.find(p => p.id === id) || null; }
function addProfessional(prof) { saveProfessionals([...professionalsCache, prof]); }
function updateProfessional(id, changes) {
  saveProfessionals(professionalsCache.map(p => (p.id === id ? { ...p, ...changes } : p)));
}
function deleteProfessional(id) { saveProfessionals(professionalsCache.filter(p => p.id !== id)); }

/* =========================================================
   AGENDAMENTOS
   ========================================================= */
function getBookings() { return bookingsCache; }
function saveBookings(list) {
  const prev = bookingsCache;
  bookingsCache = list;
  syncArrayDiff("bookings", prev, list, M.bookingToRow);
}
function isSlotTaken(profId, date, time, ignoreId) {
  return bookingsCache.some(b => b.profId === profId && b.date === date && b.time === time && b.id !== ignoreId);
}

// Criação "segura" de agendamento: usa o INSERT direto no Supabase (não o diff
// genérico) para conseguir capturar, na hora, se o horário já foi ocupado por
// outra pessoa nos últimos segundos — o banco tem uma restrição UNIQUE que
// impede duas pessoas ocuparem o mesmo horário, mesmo clicando ao mesmo tempo.
async function createBookingSafely(booking) {
  const { error } = await supabaseClient.from("bookings").insert(M.bookingToRow(booking));
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "taken" };
    console.error("Erro ao criar agendamento:", error);
    return { ok: false, reason: "error" };
  }
  bookingsCache = [...bookingsCache, booking];
  return { ok: true };
}

/* =========================================================
   BLOQUEIOS PONTUAIS
   ========================================================= */
function getBlockedSlots() { return blockedSlotsCache; }
function saveBlockedSlots(list) {
  const prev = blockedSlotsCache;
  blockedSlotsCache = list;
  syncArrayDiff("blocked_slots", prev, list, M.slotToRow);
}
function isSlotBlocked(profId, date, time) {
  return blockedSlotsCache.some(b => b.profId === profId && b.date === date && b.time === time);
}

/* =========================================================
   HORÁRIOS EXTRAS
   ========================================================= */
function getExtraSlots() { return extraSlotsCache; }
function saveExtraSlots(list) {
  const prev = extraSlotsCache;
  extraSlotsCache = list;
  syncArrayDiff("extra_slots", prev, list, M.slotToRow);
}

/* =========================================================
   RETORNOS
   ========================================================= */
function getRetornos() { return retornosCache; }
function saveRetornos(list) {
  const prev = retornosCache;
  retornosCache = list;
  syncArrayDiff("retornos", prev, list, M.retornoToRow);
}

/* =========================================================
   NOTIFICAÇÕES
   ========================================================= */
function getNotifications() { return notificationsCache; }
function saveNotifications(list) {
  const prev = notificationsCache;
  notificationsCache = list;
  syncArrayDiff("notifications", prev, list, M.notifToRow);
}
function addNotification(type, message) {
  const n = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type, message, createdAt: new Date().toISOString(), read: false
  };
  saveNotifications([n, ...notificationsCache].slice(0, 200));
}

/* =========================================================
   CONFIGURAÇÕES GERAIS
   ========================================================= */
function getSettings() { return settingsCache; }
function saveSettings(settings) {
  settingsCache = settings;
  supabaseClient.from("settings")
    .update({ company_email_domain: settings.companyEmailDomain, days_ahead: settings.daysAhead })
    .eq("id", 1)
    .then(({ error }) => { if (error) console.error("Erro ao salvar configurações:", error); });
}

/* =========================================================
   CARGA INICIAL + TEMPO REAL
   -----------------------------------------------------------
   Ao abrir a página, busca todos os dados do Supabase uma vez.
   Depois, fica ouvindo mudanças em tempo real: se um colega
   agenda em outro computador, ou a médica bloqueia um horário
   pelo painel, a tela de todo mundo atualiza sozinha.
   ========================================================= */
let dataChangeListeners = [];
function onDataChange(fn) { dataChangeListeners.push(fn); }
function notifyDataChange() { dataChangeListeners.forEach(fn => fn()); }

async function fetchAllTables() {
  const [profRes, settRes, bookRes, blockRes, extraRes, retRes, notifRes] = await Promise.all([
    supabaseClient.from("professionals").select("*"),
    supabaseClient.from("settings").select("*").eq("id", 1).maybeSingle(),
    supabaseClient.from("bookings").select("*"),
    supabaseClient.from("blocked_slots").select("*"),
    supabaseClient.from("extra_slots").select("*"),
    supabaseClient.from("retornos").select("*"),
    supabaseClient.from("notifications").select("*")
  ]);

  if (profRes.error) {
    console.error("Erro ao conectar ao Supabase:", profRes.error);
    return false;
  }

  professionalsCache = (profRes.data || []).map(M.profFromRow);
  if (professionalsCache.length === 0) {
    for (const p of DEFAULT_PROFESSIONALS) {
      await supabaseClient.from("professionals").insert(M.profToRow(p));
    }
    professionalsCache = DEFAULT_PROFESSIONALS;
  }

  if (settRes.data) {
    settingsCache = {
      companyEmailDomain: settRes.data.company_email_domain ?? DEFAULT_SETTINGS.companyEmailDomain,
      daysAhead: settRes.data.days_ahead ?? DEFAULT_SETTINGS.daysAhead
    };
  } else {
    await supabaseClient.from("settings").insert({ id: 1, company_email_domain: DEFAULT_SETTINGS.companyEmailDomain, days_ahead: DEFAULT_SETTINGS.daysAhead });
    settingsCache = { ...DEFAULT_SETTINGS };
  }

  bookingsCache = (bookRes.data || []).map(M.bookingFromRow);
  blockedSlotsCache = (blockRes.data || []).map(M.slotFromRow);
  extraSlotsCache = (extraRes.data || []).map(M.slotFromRow);
  retornosCache = (retRes.data || []).map(M.retornoFromRow);
  notificationsCache = (notifRes.data || []).map(M.notifFromRow);
  return true;
}

function subscribeRealtime() {
  supabaseClient.channel("public:all-tables")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      // Uma mudança em qualquer tabela chegou (de qualquer navegador) —
      // busca tudo de novo e avisa as telas para se redesenharem.
      fetchAllTables().then(notifyDataChange);
    })
    .subscribe();
}

const dataReadyPromise = (async () => {
  const ok = await fetchAllTables();
  subscribeRealtime();
  notifyDataChange();
  return ok;
})();

/* =========================================================
   GERAÇÃO DE HORÁRIOS (sem mudanças em relação à versão anterior)
   ========================================================= */
function pad(n) { return String(n).padStart(2, "0"); }

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
  const day = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return { weekday: weekday.replace(".", ""), day };
}

function getWorkingDates(professional) {
  const settings = getSettings();
  const dates = new Set();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= settings.daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (professional.workDays.includes(d.getDay())) dates.add(toISODate(d));
  }

  getExtraSlots().filter(s => s.profId === professional.id).forEach(s => dates.add(s.date));
  return Array.from(dates).sort();
}

function getAllSlotsForDate(professional, dateISO) {
  const slots = new Set();
  const d = new Date(dateISO + "T00:00:00");

  if (professional.workDays.includes(d.getDay())) {
    professional.shifts.forEach(shift => {
      let [h, m] = shift.start.split(":").map(Number);
      const [endH, endM] = shift.end.split(":").map(Number);
      const endTotal = endH * 60 + endM;
      while (h * 60 + m + professional.slotMinutes <= endTotal) {
        slots.add(`${pad(h)}:${pad(m)}`);
        m += professional.slotMinutes;
        while (m >= 60) { m -= 60; h += 1; }
      }
    });
  }

  getExtraSlots().filter(s => s.profId === professional.id && s.date === dateISO).forEach(s => slots.add(s.time));
  return Array.from(slots).sort();
}

function getFreeSlots(professional, dateISO, ignoreId) {
  const all = getAllSlotsForDate(professional, dateISO);
  const now = new Date();
  const isToday = dateISO === toISODate(now);

  return all.filter(time => {
    if (isSlotTaken(professional.id, dateISO, time, ignoreId)) return false;
    if (isSlotBlocked(professional.id, dateISO, time)) return false;
    if (isToday) {
      const [h, m] = time.split(":").map(Number);
      const slotDate = new Date(now);
      slotDate.setHours(h, m, 0, 0);
      if (slotDate <= now) return false;
    }
    return true;
  });
}

function getDatesWithAvailability(professional, ignoreId) {
  return getWorkingDates(professional).filter(dateISO => getFreeSlots(professional, dateISO, ignoreId).length > 0);
}

function isValidEmail(email) {
  const basic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!basic) return false;
  const domain = getSettings().companyEmailDomain;
  if (domain) return email.toLowerCase().endsWith("@" + domain.toLowerCase());
  return true;
}
