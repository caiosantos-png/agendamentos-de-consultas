/* =========================================================
   ESTADO GLOBAL DO PAINEL
   ========================================================= */
let adminInitDone = false;
const state = { availDate: null, notifFilter: "todas" };

/* =========================================================
   LOGIN
   ========================================================= */
async function showApp() {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("admin-app").hidden = false;

  const ok = await dataReadyPromise;
  if (!ok) {
    document.getElementById("admin-main").innerHTML =
      `<p class="empty-msg">Não foi possível conectar ao banco de dados. Verifique sua internet ou as credenciais em supabase-config.js.</p>`;
    return;
  }

  // Agora que estamos autenticados, busca de novo: o RLS libera informação
  // extra para quem está logado (ex.: a lista de usuários do sistema).
  await fetchAllTables();
  lastSnapshot = snapshotAllData();

  initAdminApp();
}

restoreSession().then(ok => { if (ok) showApp(); });

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("input-email").value.trim();
  const password = document.getElementById("input-password").value;
  const errorEl = document.getElementById("login-error");
  const submitBtn = e.target.querySelector("button[type=submit]");

  submitBtn.disabled = true;
  const result = await loginWithEmail(email, password);
  submitBtn.disabled = false;

  if (result.ok) {
    errorEl.hidden = true;
    showApp();
  } else {
    errorEl.textContent = result.message;
    errorEl.hidden = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await logout();
  document.getElementById("admin-app").hidden = true;
  document.getElementById("login-screen").hidden = false;
  document.getElementById("input-password").value = "";
  switchPage("dashboard"); // evita que o próximo login herde a aba em que ficamos
});

/* =========================================================
   INICIALIZAÇÃO / NAVEGAÇÃO ENTRE PÁGINAS
   ========================================================= */

function initAdminApp() {
  if (adminInitDone) {
    renderAll();
    return;
  }
  adminInitDone = true;

  document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });

  populateProfessionalSelects();
  populateUserProfSelect();
  updateUserFormProfField();
  populateTypeFilter();
  applyRolePermissions();

  document.getElementById("dash-go-agendamentos").addEventListener("click", () => switchPage("agendamentos"));
  document.getElementById("dash-go-upcoming").addEventListener("click", () => switchPage("agendamentos"));
  document.getElementById("dash-go-agenda").addEventListener("click", () => switchPage("agenda"));

  document.getElementById("filter-prof").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-status").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-search").addEventListener("input", renderBookingsTable);
  document.getElementById("filter-from").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-to").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-type").addEventListener("change", renderBookingsTable);
  document.getElementById("btn-clear-filters").addEventListener("click", clearBookingsFilters);

  document.getElementById("hist-filter-prof").addEventListener("change", renderHistoricoTable);
  document.getElementById("hist-filter-search").addEventListener("input", renderHistoricoTable);
  document.getElementById("hist-filter-from").addEventListener("change", renderHistoricoTable);
  document.getElementById("hist-filter-to").addEventListener("change", renderHistoricoTable);
  document.getElementById("btn-clear-filters-historico").addEventListener("click", clearHistoricoFilters);

  // Fecha qualquer menu "⋮" aberto ao clicar fora dele
  document.addEventListener("click", e => {
    if (!e.target.closest(".dropdown-wrap")) closeAllDropdowns();
  });

  document.getElementById("agenda-prof").addEventListener("change", () => {
    state.availDate = null;
    renderAvailDates();
  });
  document.getElementById("agenda-add-slot").addEventListener("click", handleAddExtraSlot);

  document.getElementById("btn-add-prof").addEventListener("click", () => openProfessionalForm(null));

  document.getElementById("btn-mark-all-read").addEventListener("click", () => {
    if (!can("markNotifRead")) return;
    saveNotifications(getNotifications().map(n => ({ ...n, read: true })));
    renderNotifications();
  });

  document.querySelectorAll("#notif-tabs .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#notif-tabs .chip").forEach(c => c.classList.remove("chip-current"));
      btn.classList.add("chip-current");
      state.notifFilter = btn.dataset.type;
      renderNotifications();
    });
  });

  document.getElementById("settings-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!can("manageSettings")) return;
    saveSettings({
      companyEmailDomain: document.getElementById("cfg-domain").value.trim(),
      daysAhead: Number(document.getElementById("cfg-days-ahead").value) || 30
    });
    document.getElementById("settings-ok").hidden = false;
    setTimeout(() => document.getElementById("settings-ok").hidden = true, 2500);
  });

  document.getElementById("password-form").addEventListener("submit", async e => {
    e.preventDefault();
    const newPassword = document.getElementById("cfg-password").value;
    if (!newPassword || newPassword.length < 6) return;
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) { alert("Não foi possível atualizar a senha: " + error.message); return; }
    document.getElementById("password-ok").hidden = false;
    document.getElementById("password-form").reset();
    setTimeout(() => document.getElementById("password-ok").hidden = true, 2500);
  });

  document.getElementById("us-role").addEventListener("change", updateUserFormProfField);

  document.getElementById("user-form").addEventListener("submit", handleCreateUser);

  document.getElementById("generic-modal-close").addEventListener("click", closeGenericModal);
  document.getElementById("generic-modal").addEventListener("click", e => {
    if (e.target.id === "generic-modal") closeGenericModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeGenericModal();
  });

  loadSettingsIntoForm();
  renderAll();
}

function switchPage(page) {
  document.querySelectorAll(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".admin-page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
  renderAll();
}

function renderAll() {
  // Estes dois são leves e vivem fora do conteúdo das páginas (badges do
  // menu lateral), então sempre atualizam.
  updateBadges();

  const activeSection = document.querySelector(".admin-page.active");
  const page = activeSection ? activeSection.id.replace("page-", "") : "dashboard";

  // Só redesenha a página que está realmente visível — evita reconstruir
  // (e "piscar"/perder seleção em) abas que a pessoa nem está vendo.
  switch (page) {
    case "dashboard": renderDashboard(); break;
    case "profissionais": renderProfessionalsList(); break;
    case "agenda": renderAvailDates(); break;
    case "agendamentos": renderBookingsTable(); break;
    case "historico": renderHistoricoTable(); break;
    case "retornos": renderRetornos(); break;
    case "notificacoes": renderNotifications(); break;
    case "usuarios": renderUsersList(); break;
    // "configuracoes" não depende de dados que mudam em tempo real
  }
}

/* =========================================================
   PERMISSÕES POR PAPEL — aplica na tela o que já vale no banco
   ========================================================= */
function applyRolePermissions() {
  const user = getCurrentUser();
  if (!user) return;

  const roleLabels = { admin: "Administrador", visualizador: "Visualizador da Agenda", medico: "Médico" };
  document.getElementById("current-user-box").innerHTML =
    `<strong>${user.username}</strong><span>${roleLabels[user.role] || user.role}</span>`;

  document.getElementById("readonly-banner").hidden = user.role !== "visualizador";

  // Itens de menu visíveis por papel
  const navRules = {
    profissionais: can("manageProfessionals"),
    retornos: can("manageRetornos"),
    notificacoes: can("manageProfessionals"), // mantém restrito ao admin
    usuarios: can("manageUsers"),
    configuracoes: true // todos têm ao menos a troca de senha; a seção de regras gerais é escondida por dentro
  };
  Object.entries(navRules).forEach(([page, visible]) => {
    const btn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (btn) btn.style.display = visible ? "" : "none";
  });

  // Se a aba que estava ativa não é permitida para este papel (ex.: outra
  // pessoa logou nesta mesma aba do navegador depois de alguém que era
  // admin), volta pra Dashboard em vez de deixar a página restrita visível.
  const activeSection = document.querySelector(".admin-page.active");
  const activePage = activeSection ? activeSection.id.replace("page-", "") : "dashboard";
  if (navRules[activePage] === false) {
    switchPage("dashboard");
  }

  // Ações de escrita escondidas conforme o papel
  document.getElementById("btn-add-prof").style.display = can("manageProfessionals") ? "" : "none";
  document.getElementById("btn-mark-all-read").style.display = can("markNotifRead") ? "" : "none";
  document.getElementById("settings-form").style.display = can("manageSettings") ? "" : "none";
  document.querySelector(".agenda-create").style.display = can("createEditDeleteSlots") ? "" : "none";
}

function populateProfessionalSelects() {
  const filterProf = document.getElementById("filter-prof");
  const agendaProf = document.getElementById("agenda-prof");
  const histFilterProf = document.getElementById("hist-filter-prof");
  const user = getCurrentUser();
  const scoped = user && user.role === "medico" && user.profId;
  const profs = scoped ? getProfessionals().filter(p => p.id === user.profId) : getProfessionals();

  // Evita reconstruir o <select> (e perder a seleção atual) quando a lista
  // de profissionais não mudou — só o conteúdo de agendamentos/bloqueios mudou.
  const newIds = profs.map(p => p.id).join(",") + (scoped ? "|medico" : "");
  if (populateProfessionalSelects._lastIds === newIds) return;
  populateProfessionalSelects._lastIds = newIds;

  const prevFilterValue = filterProf.value;
  const prevAgendaValue = agendaProf.value;
  const prevHistFilterValue = histFilterProf.value;

  filterProf.innerHTML = scoped ? "" : `<option value="todos">Todos</option>`;
  agendaProf.innerHTML = "";
  histFilterProf.innerHTML = scoped ? "" : `<option value="todos">Todos</option>`;
  profs.forEach(prof => {
    filterProf.appendChild(new Option(prof.name, prof.id));
    agendaProf.appendChild(new Option(prof.name, prof.id));
    histFilterProf.appendChild(new Option(prof.name, prof.id));
  });

  if (scoped) {
    filterProf.value = user.profId;
    agendaProf.value = user.profId;
    histFilterProf.value = user.profId;
    filterProf.disabled = true;
    agendaProf.disabled = true;
    histFilterProf.disabled = true;
    return;
  }

  // Restaura a seleção anterior, se o profissional selecionado ainda existir
  if (prevFilterValue === "todos" || profs.some(p => p.id === prevFilterValue)) {
    filterProf.value = prevFilterValue;
  }
  if (prevHistFilterValue === "todos" || profs.some(p => p.id === prevHistFilterValue)) {
    histFilterProf.value = prevHistFilterValue;
  }
  if (profs.some(p => p.id === prevAgendaValue)) {
    agendaProf.value = prevAgendaValue;
  } else if (profs.length > 0) {
    agendaProf.value = profs[0].id;
  }
}

/* =========================================================
   MODAL GENÉRICO
   ========================================================= */
function openGenericModal(html) {
  document.getElementById("generic-modal-body").innerHTML = html;
  const overlay = document.getElementById("generic-modal");
  overlay.hidden = false;
  overlay.classList.add("is-open");
}
function closeGenericModal() {
  const overlay = document.getElementById("generic-modal");
  overlay.hidden = true;
  overlay.classList.remove("is-open");
  document.getElementById("generic-modal-body").innerHTML = "";
}

/* =========================================================
   DASHBOARD
   ========================================================= */
// Preenche um elemento só se ele existir na página. Protege o painel inteiro
// contra travar caso algum arquivo (HTML/JS) esteja desatualizado ou tenha
// sido substituído fora de ordem — nesse caso, avisa no Console em vez de
// travar a execução do resto do renderAll().
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) { el.textContent = value; return true; }
  console.warn(`[Dashboard] elemento #${id} não encontrado no HTML — confira se admin.html está na versão mais recente.`);
  return false;
}

function renderDashboard() {
  const user = getCurrentUser();
  const scoped = user && user.role === "medico" && user.profId;
  const todayISO = toISODate(new Date());
  const now = new Date();

  // ----- Cabeçalho: "Hoje, 10 de agosto" -----
  const dateEl = document.getElementById("dash-date");
  if (dateEl) {
    const monthName = now.toLocaleDateString("pt-BR", { month: "long" });
    dateEl.textContent = `Hoje, ${now.getDate()} de ${monthName}`;
  }

  // ----- Dados-base (reaproveitados das mesmas funções já usadas no resto do painel) -----
  const allBookings = getBookings().filter(b => !scoped || b.profId === user.profId);
  const activeBookings = allBookings.filter(b => b.status !== "cancelado");
  const retornos = getRetornos().filter(r => !scoped || r.profId === user.profId);
  const overdueRetornos = retornos.filter(r => r.status === "pendente" && r.dueDate < todayISO);
  const pendingRetornos = retornos.filter(r => r.status === "pendente");
  const professionals = scoped ? getProfessionals().filter(p => p.id === user.profId) : getProfessionals();
  const blockedSlots = getBlockedSlots().filter(b => !scoped || b.profId === user.profId);

  // ----- Cards de indicadores -----
  setText("stat-total", activeBookings.length);
  setText("stat-today", activeBookings.filter(b => b.date === todayISO).length);
  setText("stat-confirmadas", activeBookings.filter(b => b.status === "confirmado").length);
  setText("stat-pendentes", activeBookings.filter(b => b.status === "pendente").length);
  setText("stat-canceladas", allBookings.filter(b => b.status === "cancelado").length);
  setText("stat-retornos-pendentes", pendingRetornos.length);

  // ----- Disponibilidade (área secundária — mesma lógica de antes, só menos em destaque) -----
  let freeCount = 0;
  professionals.forEach(prof => {
    getWorkingDates(prof).forEach(dateISO => { freeCount += getFreeSlots(prof, dateISO).length; });
  });
  setText("stat-free", freeCount);
  setText("stat-blocked", blockedSlots.length);

  // ----- Alerta de retornos vencidos (mantido como já existia) -----
  const alertBox = document.getElementById("overdue-alert");
  if (alertBox) {
    if (overdueRetornos.length > 0) {
      alertBox.hidden = false;
      alertBox.innerHTML = `⚠️ Há <b>${overdueRetornos.length}</b> retorno(s) vencido(s) aguardando revisão. ` +
        `<button class="btn-link" id="go-retornos" type="button">Ver retornos</button>`;
      document.getElementById("go-retornos").addEventListener("click", () => switchPage("retornos"));
    } else {
      alertBox.hidden = true;
    }
  }

  // ----- Agenda de hoje -----
  const todayBody = document.getElementById("dash-today-body");
  const todayEmpty = document.getElementById("dash-today-empty");
  if (todayBody && todayEmpty) {
    const todayBookings = activeBookings.filter(b => b.date === todayISO).sort((a, b) => a.time.localeCompare(b.time));
    const statusLabels = { pendente: "Aguardando", confirmado: "Confirmada", concluido: "Concluída" };
    todayBody.innerHTML = "";
    todayEmpty.hidden = todayBookings.length > 0;
    todayBookings.forEach(b => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${b.time}</td><td>${b.name}</td><td>${b.profName}</td><td><span class="status-badge status-${b.status}">${statusLabels[b.status] || b.status}</span></td>`;
      todayBody.appendChild(tr);
    });
  }

  // ----- Atenção: situações que pedem uma ação -----
  const attnWrap = document.getElementById("dash-attention-list");
  const attnEmpty = document.getElementById("dash-attention-empty");
  if (attnWrap && attnEmpty) {
    const attentionItems = [];
    if (overdueRetornos.length > 0) {
      attentionItems.push({ count: overdueRetornos.length, desc: `retorno${overdueRetornos.length > 1 ? "s" : ""} vencido${overdueRetornos.length > 1 ? "s" : ""}`, cls: "warn", page: "retornos" });
    }
    const pendentesAtencao = activeBookings.filter(b => b.status === "pendente").length;
    if (pendentesAtencao > 0) {
      attentionItems.push({ count: pendentesAtencao, desc: "aguardando confirmação", cls: "info", page: "agendamentos" });
    }
    const canceladasAtencao = allBookings.filter(b => b.status === "cancelado").length;
    if (canceladasAtencao > 0) {
      attentionItems.push({ count: canceladasAtencao, desc: `cancelada${canceladasAtencao > 1 ? "s" : ""} recentemente`, cls: "info", page: "historico" });
    }
    const reagendadasAtencao = activeBookings.filter(b => b.rescheduled).length;
    if (reagendadasAtencao > 0) {
      attentionItems.push({ count: reagendadasAtencao, desc: `reagendada${reagendadasAtencao > 1 ? "s" : ""}`, cls: "info", page: "agendamentos" });
    }

    attnWrap.innerHTML = "";
    attnEmpty.hidden = attentionItems.length > 0;
    attentionItems.forEach(item => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `dash-attention-item ${item.cls}`;
      btn.innerHTML = `<span class="count">${item.count}</span><span class="desc">${item.desc}</span><span class="arrow">→</span>`;
      btn.addEventListener("click", () => switchPage(item.page));
      attnWrap.appendChild(btn);
    });
  }

  // ----- Gráfico: agendamentos dos últimos 7 dias (barras simples em CSS, sem biblioteca nova) -----
  const chartWrap = document.getElementById("dash-chart");
  if (chartWrap) {
    const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(toISODate(d));
    }
    const dayCounts = last7.map(dateISO => activeBookings.filter(b => b.date === dateISO).length);
    const maxCount = Math.max(1, ...dayCounts);
    chartWrap.innerHTML = "";
    last7.forEach((dateISO, i) => {
      const heightPct = Math.round((dayCounts[i] / maxCount) * 100);
      const bar = document.createElement("div");
      bar.className = "dash-chart-bar" + (dateISO === todayISO ? " today" : "");
      bar.innerHTML = `<span class="dash-chart-count">${dayCounts[i]}</span><div class="dash-chart-fill" style="height:${Math.max(heightPct, 4)}%"></div><label>${weekdayLabels[new Date(dateISO + "T00:00:00").getDay()]}</label>`;
      chartWrap.appendChild(bar);
    });
  }

  // ----- Próximos agendamentos (depois de agora, incluindo o restante de hoje) -----
  const upWrap = document.getElementById("dash-upcoming-list");
  const upEmpty = document.getElementById("dash-upcoming-empty");
  if (upWrap && upEmpty) {
    const nowHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const tomorrowISO = toISODate(new Date(Date.now() + 86400000));
    const upcoming = activeBookings
      .filter(b => (b.status === "pendente" || b.status === "confirmado"))
      .filter(b => b.date > todayISO || (b.date === todayISO && b.time > nowHHMM))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 5);

    upWrap.innerHTML = "";
    upEmpty.hidden = upcoming.length > 0;
    upcoming.forEach(b => {
      const label = b.date === todayISO ? "Hoje" : b.date === tomorrowISO ? "Amanhã" : formatDateLabel(b.date).day;
      const row = document.createElement("div");
      row.className = "dash-attention-item info";
      row.innerHTML = `<span class="desc"><b>${label}</b> · ${b.time} · ${b.name} · ${b.profName}</span>`;
      upWrap.appendChild(row);
    });
  }
}

/* =========================================================
   PROFISSIONAIS
   ========================================================= */
function renderProfessionalsList() {
  const wrap = document.getElementById("prof-list");
  wrap.innerHTML = "";
  getProfessionals().forEach(prof => {
    const days = prof.workDays.map(d => ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d]).join(", ");
    const shiftsLabel = prof.shifts.map(s => `${s.start}–${s.end}`).join(" / ");
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main">
        <div>
          <span class="status-badge status-livre">${prof.tag}</span>
          <strong>${prof.name}</strong>
          <span class="admin-row-sub">${prof.role} — ${prof.description}</span>
          <span class="admin-row-sub">${days} · ${shiftsLabel} · ${prof.slotMinutes} min por atendimento</span>
        </div>
      </div>
      <div class="admin-row-actions">
        ${can("manageProfessionals") ? `<button class="btn-small btn-edit-prof" type="button">Editar</button>` : ""}
        ${can("manageProfessionals") ? `<button class="btn-small danger btn-delete-prof" type="button">Excluir</button>` : ""}
      </div>
    `;
    const editBtn = row.querySelector(".btn-edit-prof");
    if (editBtn) editBtn.addEventListener("click", () => openProfessionalForm(prof));
    const deleteBtn = row.querySelector(".btn-delete-prof");
    if (deleteBtn) deleteBtn.addEventListener("click", () => {
      if (!can("manageProfessionals")) return;
      if (!confirm(`Excluir "${prof.name}"? Isso não cancela agendamentos já feitos, mas o profissional some da lista de escolha dos colaboradores.`)) return;
      deleteProfessional(prof.id);
      populateProfessionalSelects();
      renderAll();
    });
    wrap.appendChild(row);
  });
}

function slugify(text) {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function openProfessionalForm(prof) {
  const isEdit = !!prof;
  const weekdayLabels = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const hasBreak = isEdit && prof.shifts.length === 2;

  openGenericModal(`
    <h2>${isEdit ? "Editar profissional" : "Adicionar profissional"}</h2>
    <form id="prof-form" class="admin-form">
      <label>Nome
        <input type="text" id="pf-name" required value="${isEdit ? prof.name : ""}">
      </label>
      <label>Cargo
        <input type="text" id="pf-role" required value="${isEdit ? prof.role : ""}">
      </label>
      <label>Categoria
        <input type="text" id="pf-tag" required value="${isEdit ? prof.tag : ""}" placeholder="Ex: Saúde física">
      </label>
      <label>Descrição
        <textarea id="pf-desc" rows="2" required>${isEdit ? prof.description : ""}</textarea>
      </label>
      <label>Dias de atendimento
        <span class="weekday-picker">
          ${[1,2,3,4,5,6,0].map(d => `
            <label><input type="checkbox" value="${d}" ${isEdit && prof.workDays.includes(d) ? "checked" : ""}> ${weekdayLabels[d]}</label>
          `).join("")}
        </span>
      </label>
      <div class="shift-row">
        <label class="filter-field">Horário inicial
          <input type="time" id="pf-start" required value="${isEdit ? prof.shifts[0].start : "09:00"}">
        </label>
        <label class="filter-field">Horário final
          <input type="time" id="pf-end" required value="${isEdit ? prof.shifts[prof.shifts.length-1].end : "17:00"}">
        </label>
      </div>
      <div class="shift-row">
        <label class="filter-field">Intervalo (início) — opcional
          <input type="time" id="pf-break-start" value="${hasBreak ? prof.shifts[0].end : ""}">
        </label>
        <label class="filter-field">Intervalo (fim) — opcional
          <input type="time" id="pf-break-end" value="${hasBreak ? prof.shifts[1].start : ""}">
        </label>
      </div>
      <label class="filter-field">Duração do atendimento (minutos)
        <input type="number" id="pf-duration" min="5" step="5" required value="${isEdit ? prof.slotMinutes : 30}">
      </label>
      <button type="submit" class="btn-primary btn-small-primary">${isEdit ? "Salvar alterações" : "Adicionar profissional"}</button>
    </form>
  `);

  document.getElementById("prof-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!can("manageProfessionals")) return;
    const workDays = Array.from(document.querySelectorAll('.weekday-picker input:checked')).map(c => Number(c.value));
    const start = document.getElementById("pf-start").value;
    const end = document.getElementById("pf-end").value;
    const breakStart = document.getElementById("pf-break-start").value;
    const breakEnd = document.getElementById("pf-break-end").value;

    const shifts = (breakStart && breakEnd)
      ? [{ start, end: breakStart }, { start: breakEnd, end }]
      : [{ start, end }];

    const data = {
      tag: document.getElementById("pf-tag").value.trim(),
      name: document.getElementById("pf-name").value.trim(),
      role: document.getElementById("pf-role").value.trim(),
      description: document.getElementById("pf-desc").value.trim(),
      workDays,
      shifts,
      slotMinutes: Number(document.getElementById("pf-duration").value) || 30
    };

    if (isEdit) {
      updateProfessional(prof.id, data);
    } else {
      data.id = slugify(data.name) + "-" + Date.now().toString(36);
      addProfessional(data);
    }
    populateProfessionalSelects();
    closeGenericModal();
    renderAll();
  });
}

/* =========================================================
   AGENDA (horários extras + bloqueios)
   ========================================================= */
function handleAddExtraSlot() {
  if (!can("createEditDeleteSlots")) return;
  const profId = document.getElementById("agenda-prof").value;
  const date = document.getElementById("agenda-new-date").value;
  const time = document.getElementById("agenda-new-time").value;
  if (!profId || !date || !time) {
    alert("Escolha profissional, data e horário para criar o horário extra.");
    return;
  }
  const list = getExtraSlots();
  list.push({ id: `extra_${Date.now()}`, profId, date, time });
  saveExtraSlots(list);
  state.availDate = date;
  document.getElementById("agenda-new-date").value = "";
  document.getElementById("agenda-new-time").value = "";
  renderAvailDates();
}

function renderAvailDates() {
  const prof = getProfessionalById(document.getElementById("agenda-prof").value);
  const wrap = document.getElementById("avail-date-list");
  wrap.innerHTML = "";
  if (!prof) return;

  const dates = getWorkingDates(prof);
  dates.forEach(dateISO => {
    const { weekday, day } = formatDateLabel(dateISO);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (dateISO === state.availDate ? " chip-current" : "");
    btn.innerHTML = `${day}<small>${weekday}</small>`;
    btn.addEventListener("click", () => {
      state.availDate = dateISO;
      renderAvailDates();
    });
    wrap.appendChild(btn);
  });

  if (!state.availDate && dates.length > 0) state.availDate = dates[0];
  renderAvailSlots(prof);
}

function renderAvailDayActions(prof) {
  const wrap = document.getElementById("avail-day-actions");
  wrap.innerHTML = "";
  if (!state.availDate || !prof || !can("blockUnblock")) return;

  const allSlots = getAllSlotsForDate(prof, state.availDate);
  const freeSlots = allSlots.filter(time =>
    !getBookings().some(b => b.profId === prof.id && b.date === state.availDate && b.time === time) &&
    !isSlotBlocked(prof.id, state.availDate, time)
  );
  const blockedSlotsToday = allSlots.filter(time => isSlotBlocked(prof.id, state.availDate, time));
  const { day } = formatDateLabel(state.availDate);

  if (freeSlots.length > 0) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-small danger";
    btn.textContent = `Bloquear o dia inteiro (${freeSlots.length} horário${freeSlots.length > 1 ? "s" : ""})`;
    btn.addEventListener("click", () => {
      if (!can("blockUnblock")) return;
      if (!confirm(`Bloquear todos os ${freeSlots.length} horários livres de ${day}?`)) return;
      const list = getBlockedSlots();
      freeSlots.forEach(time => list.push({ id: `bloq_${Date.now()}_${time}`, profId: prof.id, date: state.availDate, time }));
      saveBlockedSlots(list);
      renderAvailSlots(prof);
      renderDashboard();
    });
    wrap.appendChild(btn);
  }

  if (blockedSlotsToday.length > 0) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-small";
    btn.textContent = `Desbloquear o dia inteiro (${blockedSlotsToday.length})`;
    btn.addEventListener("click", () => {
      if (!can("blockUnblock")) return;
      saveBlockedSlots(getBlockedSlots().filter(x => !(x.profId === prof.id && x.date === state.availDate)));
      renderAvailSlots(prof);
      renderDashboard();
    });
    wrap.appendChild(btn);
  }
}

function renderAvailSlots(prof) {
  renderAvailDayActions(prof);
  const wrap = document.getElementById("avail-slot-list");
  wrap.innerHTML = "";
  if (!state.availDate || !prof) return;

  const allSlots = getAllSlotsForDate(prof, state.availDate);
  const bookings = getBookings();
  const extras = getExtraSlots();

  allSlots.forEach(time => {
    const booking = bookings.find(b => b.profId === prof.id && b.date === state.availDate && b.time === time && b.status !== "cancelado");
    const blocked = isSlotBlocked(prof.id, state.availDate, time);
    const extra = extras.find(s => s.profId === prof.id && s.date === state.availDate && s.time === time);

    const row = document.createElement("div");
    row.className = "admin-row";

    let statusHTML, actionsHTML = "";
    if (booking) {
      statusHTML = `<span class="status-badge status-ocupado">Ocupado</span><span class="admin-row-sub">${booking.name}</span>`;
    } else if (blocked) {
      statusHTML = `<span class="status-badge status-bloqueado">Bloqueado</span>`;
      if (can("blockUnblock")) actionsHTML = `<button class="btn-small btn-unblock" type="button">Desbloquear</button>`;
    } else {
      statusHTML = `<span class="status-badge status-livre">Livre</span>${extra ? '<span class="admin-row-sub">Horário extra</span>' : ""}`;
      if (can("blockUnblock")) actionsHTML = `<button class="btn-small btn-block" type="button">Bloquear</button>`;
      if (extra && can("createEditDeleteSlots")) actionsHTML += `<button class="btn-small danger btn-remove-extra" type="button">Excluir horário</button>`;
    }

    row.innerHTML = `
      <div class="admin-row-main"><b>${time}</b><div>${statusHTML}</div></div>
      <div class="admin-row-actions">${actionsHTML}</div>
    `;

    const blockBtn = row.querySelector(".btn-block");
    if (blockBtn) blockBtn.addEventListener("click", () => {
      if (!can("blockUnblock")) return;
      const list = getBlockedSlots();
      list.push({ id: `bloq_${Date.now()}`, profId: prof.id, date: state.availDate, time });
      saveBlockedSlots(list);
      renderAvailSlots(prof);
      renderDashboard();
    });

    const unblockBtn = row.querySelector(".btn-unblock");
    if (unblockBtn) unblockBtn.addEventListener("click", () => {
      if (!can("blockUnblock")) return;
      saveBlockedSlots(getBlockedSlots().filter(x => !(x.profId === prof.id && x.date === state.availDate && x.time === time)));
      renderAvailSlots(prof);
      renderDashboard();
    });

    const removeExtraBtn = row.querySelector(".btn-remove-extra");
    if (removeExtraBtn) removeExtraBtn.addEventListener("click", () => {
      if (!can("createEditDeleteSlots")) return;
      saveExtraSlots(getExtraSlots().filter(x => !(x.profId === prof.id && x.date === state.availDate && x.time === time)));
      renderAvailDates();
    });

    wrap.appendChild(row);
  });
}

/* =========================================================
   AGENDAMENTOS (tabela + ações)
   ========================================================= */
function getFilteredBookings() {
  const user = getCurrentUser();
  const scoped = user && user.role === "medico" && user.profId;
  const profFilter = scoped ? user.profId : document.getElementById("filter-prof").value;
  const statusFilter = document.getElementById("filter-status").value;
  const typeFilter = document.getElementById("filter-type").value;
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;

  // A tela de Agendamentos só mostra atendimentos em aberto — concluídos,
  // cancelados (e faltas, se um dia existirem) ficam no Histórico.
  return getBookings()
    .filter(b => b.status === "pendente" || b.status === "confirmado")
    .filter(b => profFilter === "todos" || b.profId === profFilter)
    .filter(b => statusFilter === "todos" || b.status === statusFilter)
    .filter(b => typeFilter === "todos" || (b.type || "A pedido") === typeFilter)
    .filter(b => !search || b.name.toLowerCase().includes(search) || b.email.toLowerCase().includes(search))
    .filter(b => !from || b.date >= from)
    .filter(b => !to || b.date <= to)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// Popula o filtro "Tipo de Agendamento" a partir da lista compartilhada em config.js
function populateTypeFilter() {
  const select = document.getElementById("filter-type");
  select.innerHTML = `<option value="todos">Todos</option>`;
  APPOINTMENT_TYPES.forEach(type => select.appendChild(new Option(type, type)));
}

// Cards de indicadores no topo da tela de Agendamentos. Sempre refletem o
// cenário completo (não o que está filtrado na tabela abaixo), pra dar
// uma visão geral estável de "como está a agenda agora".
function renderAgendamentosKPIs() {
  const user = getCurrentUser();
  const scoped = user && user.role === "medico" && user.profId;
  const active = getBookings().filter(b =>
    (b.status === "pendente" || b.status === "confirmado") && (!scoped || b.profId === user.profId)
  );
  const retornosPendentes = getRetornos().filter(r => r.status === "pendente" && (!scoped || r.profId === user.profId));

  const cards = [
    { label: "Confirmados", value: active.filter(b => b.status === "confirmado").length },
    { label: "Pendentes", value: active.filter(b => b.status === "pendente").length },
    { label: "Retornos", value: retornosPendentes.length },
    { label: "Reagendado", value: active.filter(b => b.rescheduled).length }
  ];

  document.getElementById("agendamentos-kpis").innerHTML = cards
    .map(c => `<div class="kpi-card"><span>${c.value}</span><label>${c.label}</label></div>`)
    .join("");
}

/* =========================================================
   MENU "⋮" (usado nas linhas de Agendamentos e Histórico)
   ========================================================= */
function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu").forEach(m => { m.hidden = true; });
}
function toggleDropdown(menu) {
  const wasOpen = !menu.hidden;
  closeAllDropdowns();
  menu.hidden = wasOpen;
}

function renderBookingsTable() {
  renderAgendamentosKPIs();

  const bookings = getFilteredBookings();
  const tbody = document.getElementById("bookings-table-body");
  const emptyMsg = document.getElementById("bookings-empty");
  tbody.innerHTML = "";

  if (bookings.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  bookings.forEach(b => {
    const { weekday, day } = formatDateLabel(b.date);
    const statusLabel = { pendente: "Pendente", confirmado: "Confirmado" }[b.status] || b.status;
    const canWrite = can("confirmCancelReschedule");
    const nextAction = b.status === "pendente"
      ? `<button class="dropdown-item btn-confirm" type="button">Confirmar</button>`
      : `<button class="dropdown-item btn-complete" type="button">Concluir atendimento</button>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.name}</td>
      <td>${b.email}</td>
      <td>${b.profName}</td>
      <td>${day} (${weekday})</td>
      <td>${b.time}</td>
      <td><span class="status-badge status-${b.status}">${statusLabel}</span>${b.rescheduled ? ' <span class="status-badge status-hoje">Reagendado</span>' : ""}</td>
      <td>${b.type || "A pedido"}</td>
      <td class="row-actions">
        <div class="dropdown-wrap">
          <button class="kebab-btn" type="button" title="Mais ações">⋮</button>
          <div class="dropdown-menu" hidden>
            <button class="dropdown-item btn-view" type="button">Visualizar</button>
            ${canWrite ? `
              <button class="dropdown-item btn-edit" type="button">Editar</button>
              <button class="dropdown-item btn-reschedule" type="button">Reagendar</button>
              ${nextAction}
              <button class="dropdown-item btn-retorno" type="button">Agendar retorno</button>
              <button class="dropdown-item danger btn-cancel" type="button">Cancelar</button>
            ` : ""}
          </div>
        </div>
      </td>
    `;

    const kebabBtn = tr.querySelector(".kebab-btn");
    const menu = tr.querySelector(".dropdown-menu");
    kebabBtn.addEventListener("click", e => { e.stopPropagation(); toggleDropdown(menu); });

    tr.querySelector(".btn-view").addEventListener("click", () => { closeAllDropdowns(); openViewModal(b); });

    const editBtn = tr.querySelector(".btn-edit");
    if (editBtn) editBtn.addEventListener("click", () => { closeAllDropdowns(); openEditModal(b); });
    const reschedBtn = tr.querySelector(".btn-reschedule");
    if (reschedBtn) reschedBtn.addEventListener("click", () => { closeAllDropdowns(); openRescheduleModal(b); });
    const retornoBtn = tr.querySelector(".btn-retorno");
    if (retornoBtn) retornoBtn.addEventListener("click", () => { closeAllDropdowns(); openRetornoModal(b); });

    const confirmBtn = tr.querySelector(".btn-confirm");
    if (confirmBtn) confirmBtn.addEventListener("click", () => { closeAllDropdowns(); updateBookingStatus(b.id, "confirmado"); });
    const completeBtn = tr.querySelector(".btn-complete");
    if (completeBtn) completeBtn.addEventListener("click", () => { closeAllDropdowns(); updateBookingStatus(b.id, "concluido"); });

    const cancelBtn = tr.querySelector(".btn-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", () => { closeAllDropdowns(); cancelBooking(b); });

    tbody.appendChild(tr);
  });
}

// Cancelamento "suave": o registro continua existindo (agora com status
// "cancelado") e passa a aparecer no Histórico, em vez de ser apagado.
// O horário volta a ficar disponível normalmente (ver isSlotTaken em config.js).
function cancelBooking(b) {
  if (!can("confirmCancelReschedule")) return;
  if (!confirm(`Cancelar o agendamento de ${b.name}? O horário volta a ficar disponível.`)) return;
  const { day } = formatDateLabel(b.date);
  const list = getBookings();
  const target = list.find(x => x.id === b.id);
  if (target) target.status = "cancelado";
  saveBookings(list);
  addNotification("cancelamento", `Agendamento de ${b.name} com ${b.profName} em ${day} às ${b.time} foi cancelado pela administração.`,
    { patientName: b.name, profName: b.profName, apptDate: b.date, apptTime: b.time, actor: getCurrentUser()?.username });
  renderAll();
}

// Limpa todos os filtros da tela de Agendamentos, voltando ao estado inicial.
// Quando o perfil é Médico, o filtro de profissional fica travado na própria
// agenda (ver populateProfessionalSelects) e não deve ser mexido aqui.
function clearBookingsFilters() {
  const profSelect = document.getElementById("filter-prof");
  if (!profSelect.disabled) profSelect.value = "todos";
  document.getElementById("filter-search").value = "";
  document.getElementById("filter-from").value = "";
  document.getElementById("filter-to").value = "";
  document.getElementById("filter-status").value = "todos";
  document.getElementById("filter-type").value = "todos";
  renderBookingsTable();
}

/* =========================================================
   HISTÓRICO DE ATENDIMENTOS (concluídos, cancelados, faltas)
   ========================================================= */
function getFilteredHistorico() {
  const user = getCurrentUser();
  const scoped = user && user.role === "medico" && user.profId;
  const profFilter = scoped ? user.profId : document.getElementById("hist-filter-prof").value;
  const search = document.getElementById("hist-filter-search").value.trim().toLowerCase();
  const from = document.getElementById("hist-filter-from").value;
  const to = document.getElementById("hist-filter-to").value;

  return getBookings()
    .filter(b => b.status === "concluido" || b.status === "cancelado" || b.status === "falta")
    .filter(b => profFilter === "todos" || b.profId === profFilter)
    .filter(b => !search || b.name.toLowerCase().includes(search) || b.email.toLowerCase().includes(search))
    .filter(b => !from || b.date >= from)
    .filter(b => !to || b.date <= to)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); // mais recentes primeiro
}

function renderHistoricoTable() {
  const bookings = getFilteredHistorico();
  const tbody = document.getElementById("historico-table-body");
  const emptyMsg = document.getElementById("historico-empty");
  tbody.innerHTML = "";

  if (bookings.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  const statusLabels = { concluido: "Concluído", cancelado: "Cancelado", falta: "Falta" };
  const canWrite = can("confirmCancelReschedule");

  bookings.forEach(b => {
    const { weekday, day } = formatDateLabel(b.date);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.name}</td>
      <td>${b.email}</td>
      <td>${b.profName}</td>
      <td>${day} (${weekday})</td>
      <td>${b.time}</td>
      <td><span class="status-badge status-${b.status}">${statusLabels[b.status] || b.status}</span></td>
      <td>${b.type || "A pedido"}</td>
      <td class="row-actions">
        <div class="dropdown-wrap">
          <button class="kebab-btn" type="button" title="Mais ações">⋮</button>
          <div class="dropdown-menu" hidden>
            <button class="dropdown-item btn-view" type="button">Visualizar</button>
            ${canWrite && b.status === "concluido" && can("manageRetornos") ? `<button class="dropdown-item btn-retorno" type="button">Agendar retorno</button>` : ""}
            ${canWrite ? `<button class="dropdown-item btn-duplicate" type="button">Duplicar atendimento</button>` : ""}
          </div>
        </div>
      </td>
    `;

    const kebabBtn = tr.querySelector(".kebab-btn");
    const menu = tr.querySelector(".dropdown-menu");
    kebabBtn.addEventListener("click", e => { e.stopPropagation(); toggleDropdown(menu); });

    tr.querySelector(".btn-view").addEventListener("click", () => { closeAllDropdowns(); openViewModal(b); });
    const retornoBtn = tr.querySelector(".btn-retorno");
    if (retornoBtn) retornoBtn.addEventListener("click", () => { closeAllDropdowns(); openRetornoModal(b); });
    const duplicateBtn = tr.querySelector(".btn-duplicate");
    if (duplicateBtn) duplicateBtn.addEventListener("click", () => { closeAllDropdowns(); openDuplicateModal(b); });

    tbody.appendChild(tr);
  });
}

function clearHistoricoFilters() {
  const profSelect = document.getElementById("hist-filter-prof");
  if (!profSelect.disabled) profSelect.value = "todos";
  document.getElementById("hist-filter-search").value = "";
  document.getElementById("hist-filter-from").value = "";
  document.getElementById("hist-filter-to").value = "";
  renderHistoricoTable();
}

function updateBookingStatus(id, status) {
  if (!can("confirmCancelReschedule")) return;
  const list = getBookings();
  const target = list.find(x => x.id === id);
  if (target) target.status = status;
  saveBookings(list);
  renderAll();
}

function openViewModal(b) {
  const { weekday, day } = formatDateLabel(b.date);
  openGenericModal(`
    <h2>Detalhes do agendamento</h2>
    <div class="summary-card">
      <strong>${b.profName} — ${b.profRole}</strong>
      <div class="row"><span>Colaborador</span><b>${b.name}</b></div>
      <div class="row"><span>E-mail</span><b>${b.email}</b></div>
      <div class="row"><span>Data</span><b>${day} (${weekday})</b></div>
      <div class="row"><span>Horário</span><b>${b.time}</b></div>
      <div class="row"><span>Status</span><b>${b.status}</b></div>
      <div class="row"><span>Tipo de Agendamento</span><b>${b.type || "A pedido"}</b></div>
      <div class="row"><span>Criado em</span><b>${new Date(b.createdAt).toLocaleString("pt-BR")}</b></div>
    </div>
  `);
}

function openEditModal(b) {
  const canEditType = can("manageAppointmentType");
  const currentType = b.type || "A pedido";
  const typeOptions = APPOINTMENT_TYPES.map(t => `<option value="${t}" ${t === currentType ? "selected" : ""}>${t}</option>`).join("");

  openGenericModal(`
    <h2>Editar dados do colaborador</h2>
    <form id="edit-form" class="admin-form">
      <label>Nome completo
        <input type="text" id="ed-name" required value="${b.name}">
      </label>
      <label>E-mail
        <input type="email" id="ed-email" required value="${b.email}">
      </label>
      <label>Tipo de Agendamento
        <select id="ed-type" ${canEditType ? "" : "disabled"}>${typeOptions}</select>
      </label>
      ${canEditType ? "" : `<p class="hint" style="margin-top:-8px;">Somente o administrador pode alterar o Tipo de Agendamento.</p>`}
      <button type="submit" class="btn-primary btn-small-primary">Salvar</button>
    </form>
  `);
  document.getElementById("edit-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!can("confirmCancelReschedule")) return;
    const list = getBookings();
    const target = list.find(x => x.id === b.id);
    target.name = document.getElementById("ed-name").value.trim();
    target.email = document.getElementById("ed-email").value.trim();
    if (canEditType) target.type = document.getElementById("ed-type").value;
    saveBookings(list);
    closeGenericModal();
    renderBookingsTable();
  });
}

function openRescheduleModal(b) {
  const prof = getProfessionalById(b.profId);
  openGenericModal(`
    <h2>Reagendar</h2>
    <p class="hint">${b.name} — atualmente em ${formatDateLabel(b.date).day} às ${b.time}</p>
    <div class="chip-grid" id="resched-dates"></div>
    <div class="chip-grid" id="resched-times" style="margin-top:10px;"></div>
  `);

  const dateWrap = document.getElementById("resched-dates");
  const timeWrap = document.getElementById("resched-times");

  function renderReschedTimes(dateISO) {
    timeWrap.innerHTML = "";
    getFreeSlots(prof, dateISO, b.id).forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (dateISO === b.date && time === b.time ? " chip-current" : "");
      btn.textContent = time;
      btn.addEventListener("click", () => {
        if (!can("confirmCancelReschedule")) return;
        const list = getBookings();
        const target = list.find(x => x.id === b.id);
        const { day } = formatDateLabel(dateISO);
        target.date = dateISO;
        target.time = time;
        target.rescheduled = true;
        saveBookings(list);
        addNotification("reagendamento", `Agendamento de ${b.name} com ${b.profName} foi remarcado para ${day} às ${time}.`,
          { patientName: b.name, profName: b.profName, apptDate: dateISO, apptTime: time, fromTime: b.time, actor: getCurrentUser()?.username });
        closeGenericModal();
        renderAll();
      });
      timeWrap.appendChild(btn);
    });
  }

  getDatesWithAvailability(prof, b.id).forEach(dateISO => {
    const { weekday, day } = formatDateLabel(dateISO);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (dateISO === b.date ? " chip-current" : "");
    btn.innerHTML = `${day}<small>${weekday}</small>`;
    btn.addEventListener("click", () => {
      dateWrap.querySelectorAll(".chip").forEach(c => c.classList.remove("chip-current"));
      btn.classList.add("chip-current");
      renderReschedTimes(dateISO);
    });
    dateWrap.appendChild(btn);
  });

  renderReschedTimes(b.date);
}

function openRetornoModal(b) {
  openGenericModal(`
    <h2>Agendar retorno</h2>
    <p class="hint">${b.name} — ${b.profName}</p>
    <div class="retorno-days" id="retorno-days">
      ${[7,15,30,60,90].map(d => `<button type="button" class="chip" data-days="${d}">${d} dias</button>`).join("")}
    </div>
    <label class="filter-field wide">Ou data personalizada
      <input type="date" id="retorno-custom-date">
    </label>
    <form id="retorno-form" class="admin-form" style="margin-top:14px;">
      <label>Motivo do retorno
        <input type="text" id="retorno-motivo" placeholder="Ex: acompanhamento de melhoria" required>
      </label>
      <label>Observações
        <textarea id="retorno-obs" rows="3" placeholder="Detalhes combinados na conversa..."></textarea>
      </label>
      <input type="hidden" id="retorno-due" required>
      <button type="submit" class="btn-primary btn-small-primary">Salvar retorno</button>
    </form>
  `);

  const dueInput = document.getElementById("retorno-due");
  const customDate = document.getElementById("retorno-custom-date");

  document.querySelectorAll("#retorno-days .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#retorno-days .chip").forEach(c => c.classList.remove("chip-current"));
      chip.classList.add("chip-current");
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + Number(chip.dataset.days));
      dueInput.value = toISODate(d);
      customDate.value = "";
    });
  });
  customDate.addEventListener("change", () => {
    document.querySelectorAll("#retorno-days .chip").forEach(c => c.classList.remove("chip-current"));
    dueInput.value = customDate.value;
  });

  document.getElementById("retorno-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!can("manageRetornos")) return;
    if (!dueInput.value) {
      alert("Escolha uma quantidade de dias ou uma data personalizada.");
      return;
    }
    const retorno = {
      id: `retorno_${Date.now()}`,
      bookingId: b.id,
      profId: b.profId,
      profName: b.profName,
      employeeName: b.name,
      employeeEmail: b.email,
      motivo: document.getElementById("retorno-motivo").value.trim(),
      note: document.getElementById("retorno-obs").value.trim(),
      dueDate: dueInput.value,
      createdAt: new Date().toISOString(),
      status: "pendente"
    };
    const list = getRetornos();
    list.push(retorno);
    saveRetornos(list);

    const { day } = formatDateLabel(retorno.dueDate);
    addNotification("retorno", `Retorno de ${b.name} marcado para ${day}.`,
      { patientName: b.name, profName: b.profName, apptDate: retorno.dueDate, actor: getCurrentUser()?.username });

    closeGenericModal();
    renderAll();
  });
}

// "Duplicar atendimento" (aparece no Histórico): cria um agendamento novo,
// para o mesmo colaborador e profissional, numa data/horário livre a
// escolher — útil pra remarcar rapidamente algo que já foi concluído ou
// cancelado, sem precisar preencher tudo de novo.
function openDuplicateModal(b) {
  if (!can("confirmCancelReschedule")) return;
  const prof = getProfessionalById(b.profId);

  openGenericModal(`
    <h2>Duplicar atendimento</h2>
    <p class="hint">Novo agendamento para <b>${b.name}</b> com ${b.profName}. Escolha a data e o horário.</p>
    <div class="chip-grid" id="dup-dates"></div>
    <div class="chip-grid" id="dup-times" style="margin-top:10px;"></div>
    <p id="dup-error" class="error-msg" hidden></p>
  `);

  const dateWrap = document.getElementById("dup-dates");
  const timeWrap = document.getElementById("dup-times");

  function renderDupTimes(dateISO) {
    timeWrap.innerHTML = "";
    getFreeSlots(prof, dateISO).forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = time;
      btn.addEventListener("click", async () => {
        const errorEl = document.getElementById("dup-error");
        errorEl.hidden = true;
        const newBooking = {
          id: `${prof.id}_${dateISO}_${time}_${Date.now()}`,
          profId: prof.id,
          profName: b.profName,
          profRole: b.profRole,
          date: dateISO,
          time,
          name: b.name,
          email: b.email,
          status: "pendente",
          type: b.type || "A pedido",
          rescheduled: false,
          createdAt: new Date().toISOString()
        };
        const result = await createBookingSafely(newBooking);
        if (!result.ok) {
          errorEl.textContent = result.reason === "taken"
            ? "Esse horário acabou de ser ocupado. Escolha outro."
            : "Não foi possível criar o agendamento. Tente novamente.";
          errorEl.hidden = false;
          renderDupTimes(dateISO);
          return;
        }
        addNotification("agendamento", `Atendimento duplicado: ${b.name} com ${b.profName} em ${formatDateLabel(dateISO).day} às ${time}.`,
          { patientName: b.name, profName: b.profName, apptDate: dateISO, apptTime: time, actor: getCurrentUser()?.username });
        closeGenericModal();
        renderAll();
      });
      timeWrap.appendChild(btn);
    });
  }

  const dates = getDatesWithAvailability(prof);
  dates.forEach((dateISO, i) => {
    const { weekday, day } = formatDateLabel(dateISO);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (i === 0 ? " chip-current" : "");
    btn.innerHTML = `${day}<small>${weekday}</small>`;
    btn.addEventListener("click", () => {
      dateWrap.querySelectorAll(".chip").forEach(c => c.classList.remove("chip-current"));
      btn.classList.add("chip-current");
      renderDupTimes(dateISO);
    });
    dateWrap.appendChild(btn);
  });

  if (dates.length > 0) renderDupTimes(dates[0]);
  else timeWrap.innerHTML = `<p class="empty-msg">Nenhum horário disponível para este profissional.</p>`;
}

/* =========================================================
   RETORNOS
   ========================================================= */
function renderRetornos() {
  const wrap = document.getElementById("retornos-list");
  const emptyMsg = document.getElementById("retornos-empty");
  const todayISO = toISODate(new Date());
  const user = getCurrentUser();
  const scoped = user && user.role === "medico" && user.profId;
  const retornos = getRetornos()
    .filter(r => !scoped || r.profId === user.profId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  wrap.innerHTML = "";
  if (retornos.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  retornos.forEach(r => {
    const { weekday, day } = formatDateLabel(r.dueDate);
    let statusClass = "futuro", statusLabel = "Agendado";
    if (r.status === "concluido") { statusClass = "concluido"; statusLabel = "Concluído"; }
    else if (r.dueDate < todayISO) { statusClass = "vencido"; statusLabel = "Atrasado"; }
    else if (r.dueDate === todayISO) { statusClass = "hoje"; statusLabel = "Hoje"; }

    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main">
        <div>
          <span class="status-badge status-${statusClass}">${statusLabel}</span>
          <strong>${r.employeeName}</strong>
          <span class="admin-row-sub">${r.profName}${r.motivo ? " · " + r.motivo : ""}</span>
          ${r.note ? `<span class="admin-row-sub">${r.note}</span>` : ""}
        </div>
        <div class="admin-row-when"><b>${day} (${weekday})</b></div>
      </div>
      <div class="admin-row-actions">
        ${r.status === "pendente" && can("manageRetornos") ? `<button class="btn-small btn-done" type="button">Marcar concluído</button>` : ""}
      </div>
    `;
    const doneBtn = row.querySelector(".btn-done");
    if (doneBtn) doneBtn.addEventListener("click", () => {
      if (!can("manageRetornos")) return;
      const list = getRetornos();
      const target = list.find(x => x.id === r.id);
      if (target) target.status = "concluido";
      saveRetornos(list);
      renderAll();
    });
    wrap.appendChild(row);
  });
}

/* =========================================================
   NOTIFICAÇÕES
   ========================================================= */
// Mesmas cores já usadas nos badges de status em outras telas do sistema —
// nenhuma cor nova foi introduzida.
const NOTIF_TYPE_META = {
  agendamento: { icon: "🟢", title: "Consulta agendada", badgeClass: "status-confirmado", actionVerb: "Agendado" },
  reagendamento: { icon: "🔵", title: "Consulta reagendada", badgeClass: "status-pendente", actionVerb: "Alterado" },
  cancelamento: { icon: "🔴", title: "Consulta cancelada", badgeClass: "status-cancelado", actionVerb: "Cancelado" },
  retorno: { icon: "🟡", title: "Retorno agendado", badgeClass: "status-hoje", actionVerb: "Registrado" }
};
const NOTIF_TYPE_FALLBACK = { icon: "⚪", title: "Notificação", badgeClass: "status-bloqueado", actionVerb: "Feito" };

function relativeTime(iso) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return `há ${Math.floor(diffH / 24)}d`;
}

// "Hoje" / "Ontem" / a data por extenso, pra agrupar o feed
function notifGroupLabel(iso) {
  const notifDate = toISODate(new Date(iso));
  const todayISO = toISODate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (notifDate === todayISO) return "Hoje";
  if (notifDate === toISODate(yesterday)) return "Ontem";
  return formatDateLabel(notifDate).day;
}

function renderNotifications() {
  const wrap = document.getElementById("notif-list-full");
  const emptyMsg = document.getElementById("notif-empty");
  const filter = state.notifFilter || "todas";

  const all = getNotifications();
  const list = filter === "todas" ? all : all.filter(n => n.type === filter);

  const unreadCount = all.filter(n => !n.read).length;
  document.getElementById("notif-unread-count").textContent = unreadCount > 0 ? `· ${unreadCount} não lida${unreadCount > 1 ? "s" : ""}` : "";

  wrap.innerHTML = "";
  if (list.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  // Agrupa em blocos "Hoje", "Ontem", etc., preservando a ordem (mais recentes primeiro)
  const groups = [];
  list.forEach(n => {
    const label = notifGroupLabel(n.createdAt);
    let group = groups.find(g => g.label === label);
    if (!group) { group = { label, items: [] }; groups.push(group); }
    group.items.push(n);
  });

  groups.forEach(group => {
    const groupEl = document.createElement("div");
    groupEl.innerHTML = `<div class="notif-group-label">${group.label}</div><div class="notif-group-items"></div>`;
    const itemsWrap = groupEl.querySelector(".notif-group-items");

    group.items.forEach(n => {
      const meta = NOTIF_TYPE_META[n.type] || NOTIF_TYPE_FALLBACK;

      // Linha de data/hora + profissional — só monta a versão "bonita" se
      // tivermos os dados estruturados; notificações antigas caem no
      // texto corrido de antes (n.message), sem quebrar nada.
      let metaLine = "";
      if (n.apptDate) {
        const { day: apptDay } = formatDateLabel(n.apptDate);
        const dayLabel = apptDay;
        const timeLabel = n.fromTime && n.apptTime ? `${n.fromTime} → ${n.apptTime}` : (n.apptTime || "");
        metaLine = [dayLabel, timeLabel, n.profName].filter(Boolean).join(" · ");
      } else {
        metaLine = n.message;
      }

      const card = document.createElement("div");
      card.className = "notif-card" + (!n.read ? " unread" : "");
      card.innerHTML = `
        <span class="notif-icon">${meta.icon}</span>
        <div class="notif-body">
          <div class="notif-title">${meta.title}</div>
          ${n.patientName ? `<div class="notif-patient">${n.patientName}</div>` : ""}
          <div class="notif-meta">${metaLine}</div>
          ${n.actor ? `<div class="notif-actor">${meta.actionVerb} por ${n.actor}</div>` : ""}
        </div>
        <span class="notif-time">${relativeTime(n.createdAt)}</span>
      `;
      itemsWrap.appendChild(card);
    });

    wrap.appendChild(groupEl);
  });
}

function updateBadges() {
  const todayISO = toISODate(new Date());
  const dueRetornos = getRetornos().filter(r => r.status === "pendente" && r.dueDate <= todayISO).length;
  const unread = getNotifications().filter(n => !n.read).length;

  const bRet = document.getElementById("badge-retornos");
  bRet.hidden = dueRetornos === 0;
  bRet.textContent = dueRetornos;

  const bNotif = document.getElementById("badge-notif");
  bNotif.hidden = unread === 0;
  bNotif.textContent = unread;
}

/* =========================================================
   USUÁRIOS (aba "Usuários" — só o Administrador acessa)
   ========================================================= */
function populateUserProfSelect() {
  const select = document.getElementById("us-prof");
  const prevValue = select.value;
  select.innerHTML = "";
  getProfessionals().forEach(prof => select.appendChild(new Option(prof.name, prof.id)));
  if (getProfessionals().some(p => p.id === prevValue)) select.value = prevValue;
}

function updateUserFormProfField() {
  const role = document.getElementById("us-role").value;
  document.getElementById("us-prof-field").style.display = role === "medico" ? "" : "none";
}

async function handleCreateUser(e) {
  e.preventDefault();
  if (!can("manageUsers")) return;

  const email = document.getElementById("us-email").value.trim();
  const password = document.getElementById("us-password").value;
  const username = document.getElementById("us-username").value.trim();
  const role = document.getElementById("us-role").value;
  const profId = document.getElementById("us-prof").value;
  const errorEl = document.getElementById("user-error");
  const okEl = document.getElementById("user-ok");
  const submitBtn = e.target.querySelector("button[type=submit]");

  errorEl.hidden = true;
  okEl.hidden = true;

  if (role === "medico" && !profId) {
    errorEl.textContent = "Escolha o profissional vinculado a este médico.";
    errorEl.hidden = false;
    return;
  }

  submitBtn.disabled = true;

  // Usa um cliente Supabase separado (ver supabase-config.js) só para não
  // trocar a sessão de quem está logado pela do usuário recém-criado.
  const { data, error } = await supabaseUserCreationClient.auth.signUp({ email, password });

  if (error) {
    submitBtn.disabled = false;
    errorEl.textContent = "Não foi possível criar a conta: " + error.message;
    errorEl.hidden = false;
    return;
  }

  const { error: profileError } = await supabaseClient.from("profiles").insert({
    id: data.user.id,
    username,
    role,
    prof_id: role === "medico" ? profId : null
  });

  submitBtn.disabled = false;

  if (profileError) {
    errorEl.textContent = "A conta foi criada, mas não foi possível salvar o perfil de acesso: " + profileError.message;
    errorEl.hidden = false;
    return;
  }

  okEl.hidden = false;
  document.getElementById("user-form").reset();
  updateUserFormProfField();
  await fetchAllTables();
  renderUsersList();
}

function renderUsersList() {
  if (!can("manageUsers")) return;
  const wrap = document.getElementById("users-list");
  wrap.innerHTML = "";
  const roleLabels = { admin: "Administrador", visualizador: "Visualizador da Agenda", medico: "Médico" };
  const me = getCurrentUser();

  getProfiles().forEach(p => {
    const prof = p.profId ? getProfessionalById(p.profId) : null;
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main">
        <div>
          <span class="status-badge status-livre">${roleLabels[p.role] || p.role}</span>
          <strong>${p.username}</strong>${p.id === me.id ? " (você)" : ""}
          ${prof ? `<span class="admin-row-sub">Agenda vinculada: ${prof.name}</span>` : ""}
        </div>
      </div>
      <div class="admin-row-actions">
        <button class="btn-small btn-edit-user" type="button">Editar papel</button>
        ${p.id !== me.id ? `<button class="btn-small danger btn-remove-user" type="button">Remover acesso</button>` : ""}
      </div>
    `;
    row.querySelector(".btn-edit-user").addEventListener("click", () => openEditUserModal(p));
    const removeBtn = row.querySelector(".btn-remove-user");
    if (removeBtn) removeBtn.addEventListener("click", async () => {
      if (!confirm(`Remover o acesso de "${p.username}" ao painel? A conta de login continua existindo no Supabase, mas perde a permissão de entrar aqui.`)) return;
      await deleteProfile(p.id);
      renderUsersList();
    });
    wrap.appendChild(row);
  });
}

function openEditUserModal(p) {
  const roleLabels = { admin: "Administrador", visualizador: "Visualizador da Agenda", medico: "Médico" };
  openGenericModal(`
    <h2>Editar papel de ${p.username}</h2>
    <form id="edit-user-form" class="admin-form">
      <label>Nome de exibição
        <input type="text" id="eu-username" required value="${p.username}">
      </label>
      <label>Papel
        <select id="eu-role">
          ${Object.entries(roleLabels).map(([value, label]) =>
            `<option value="${value}" ${p.role === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <label id="eu-prof-field">Profissional vinculado
        <select id="eu-prof"></select>
      </label>
      <button type="submit" class="btn-primary btn-small-primary">Salvar</button>
    </form>
  `);

  const profSelect = document.getElementById("eu-prof");
  getProfessionals().forEach(prof => profSelect.appendChild(new Option(prof.name, prof.id)));
  if (p.profId) profSelect.value = p.profId;

  const roleSelect = document.getElementById("eu-role");
  const profField = document.getElementById("eu-prof-field");
  function syncProfField() { profField.style.display = roleSelect.value === "medico" ? "" : "none"; }
  roleSelect.addEventListener("change", syncProfField);
  syncProfField();

  document.getElementById("edit-user-form").addEventListener("submit", async e => {
    e.preventDefault();
    const role = roleSelect.value;
    if (role === "medico" && !profSelect.value) {
      alert("Escolha o profissional vinculado a este médico.");
      return;
    }
    await updateProfile(p.id, {
      username: document.getElementById("eu-username").value.trim(),
      role,
      profId: role === "medico" ? profSelect.value : null
    });
    closeGenericModal();
    renderUsersList();
  });
}

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */
function loadSettingsIntoForm() {
  const s = getSettings();
  document.getElementById("cfg-domain").value = s.companyEmailDomain;
  document.getElementById("cfg-days-ahead").value = s.daysAhead;
}

/* =========================================================
   TEMPO REAL
   Quando qualquer dado muda no Supabase (por um colaborador
   agendando, ou por outra aba/computador do admin), atualiza
   o painel sozinho.
   ========================================================= */
onDataChange(() => {
  if (!adminInitDone) return;
  const scrollY = window.scrollY;
  populateProfessionalSelects();
  populateUserProfSelect();
  renderAll();
  window.scrollTo(0, scrollY);
});
