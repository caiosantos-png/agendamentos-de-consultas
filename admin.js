/* =========================================================
   ESTADO GLOBAL DO PAINEL
   ========================================================= */
let adminInitDone = false;
const state = { availDate: null };

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
  initAdminApp();
}

if (isLoggedIn()) showApp();

document.getElementById("login-form").addEventListener("submit", e => {
  e.preventDefault();
  const username = document.getElementById("input-username").value.trim();
  const password = document.getElementById("input-password").value;
  const errorEl = document.getElementById("login-error");

  if (typeof checkLogin !== "function") {
    alert("Erro ao carregar o sistema de login. Confira se o arquivo auth.js está na mesma pasta dos outros arquivos.");
    return;
  }

  if (checkLogin(username, password)) {
    logLogin();
    errorEl.hidden = true;
    showApp();
  } else {
    errorEl.hidden = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => {
  logLogout();
  document.getElementById("admin-app").hidden = true;
  document.getElementById("login-screen").hidden = false;
  document.getElementById("input-password").value = "";
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

  document.getElementById("filter-prof").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-status").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-search").addEventListener("input", renderBookingsTable);
  document.getElementById("filter-from").addEventListener("change", renderBookingsTable);
  document.getElementById("filter-to").addEventListener("change", renderBookingsTable);

  document.getElementById("agenda-prof").addEventListener("change", () => {
    state.availDate = null;
    renderAvailDates();
  });
  document.getElementById("agenda-add-slot").addEventListener("click", handleAddExtraSlot);

  document.getElementById("btn-add-prof").addEventListener("click", () => openProfessionalForm(null));

  document.getElementById("btn-mark-all-read").addEventListener("click", () => {
    saveNotifications(getNotifications().map(n => ({ ...n, read: true })));
    renderNotifications();
  });

  document.getElementById("settings-form").addEventListener("submit", e => {
    e.preventDefault();
    saveSettings({
      companyEmailDomain: document.getElementById("cfg-domain").value.trim(),
      daysAhead: Number(document.getElementById("cfg-days-ahead").value) || 30
    });
    document.getElementById("settings-ok").hidden = false;
    setTimeout(() => document.getElementById("settings-ok").hidden = true, 2500);
  });

  document.getElementById("password-form").addEventListener("submit", e => {
    e.preventDefault();
    const u = document.getElementById("cfg-username").value.trim();
    const p = document.getElementById("cfg-password").value;
    if (!u || !p) return;
    setAdminCredentials(u, p);
    document.getElementById("password-ok").hidden = false;
    document.getElementById("password-form").reset();
    setTimeout(() => document.getElementById("password-ok").hidden = true, 2500);
  });

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
  renderDashboard();
  renderProfessionalsList();
  renderAvailDates();
  renderBookingsTable();
  renderRetornos();
  renderNotifications();
  updateBadges();
}

function populateProfessionalSelects() {
  const filterProf = document.getElementById("filter-prof");
  const agendaProf = document.getElementById("agenda-prof");
  filterProf.innerHTML = `<option value="todos">Todos</option>`;
  agendaProf.innerHTML = "";
  getProfessionals().forEach(prof => {
    filterProf.appendChild(new Option(prof.name, prof.id));
    agendaProf.appendChild(new Option(prof.name, prof.id));
  });
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
function renderDashboard() {
  const bookings = getBookings();
  const todayISO = toISODate(new Date());
  const retornos = getRetornos();
  const overdue = retornos.filter(r => r.status === "pendente" && r.dueDate < todayISO);
  const pending = retornos.filter(r => r.status === "pendente");

  document.getElementById("stat-total").textContent = bookings.length;
  document.getElementById("stat-today").textContent = bookings.filter(b => b.date === todayISO).length;

  let freeCount = 0;
  getProfessionals().forEach(prof => {
    getWorkingDates(prof).forEach(dateISO => {
      freeCount += getFreeSlots(prof, dateISO).length;
    });
  });
  document.getElementById("stat-free").textContent = freeCount;
  document.getElementById("stat-blocked").textContent = getBlockedSlots().length;
  document.getElementById("stat-retornos-pendentes").textContent = pending.length;
  document.getElementById("stat-retornos-vencidos").textContent = overdue.length;

  const alertBox = document.getElementById("overdue-alert");
  if (overdue.length > 0) {
    alertBox.hidden = false;
    alertBox.innerHTML = `⚠️ Há <b>${overdue.length}</b> retorno(s) vencido(s) aguardando revisão. ` +
      `<button class="btn-link" id="go-retornos" type="button">Ver retornos</button>`;
    document.getElementById("go-retornos").addEventListener("click", () => switchPage("retornos"));
  } else {
    alertBox.hidden = true;
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
        <button class="btn-small btn-edit-prof" type="button">Editar</button>
        <button class="btn-small danger btn-delete-prof" type="button">Excluir</button>
      </div>
    `;
    row.querySelector(".btn-edit-prof").addEventListener("click", () => openProfessionalForm(prof));
    row.querySelector(".btn-delete-prof").addEventListener("click", () => {
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

function renderAvailSlots(prof) {
  const wrap = document.getElementById("avail-slot-list");
  wrap.innerHTML = "";
  if (!state.availDate || !prof) return;

  const allSlots = getAllSlotsForDate(prof, state.availDate);
  const bookings = getBookings();
  const extras = getExtraSlots();

  allSlots.forEach(time => {
    const booking = bookings.find(b => b.profId === prof.id && b.date === state.availDate && b.time === time);
    const blocked = isSlotBlocked(prof.id, state.availDate, time);
    const extra = extras.find(s => s.profId === prof.id && s.date === state.availDate && s.time === time);

    const row = document.createElement("div");
    row.className = "admin-row";

    let statusHTML, actionsHTML = "";
    if (booking) {
      statusHTML = `<span class="status-badge status-ocupado">Ocupado</span><span class="admin-row-sub">${booking.name}</span>`;
    } else if (blocked) {
      statusHTML = `<span class="status-badge status-bloqueado">Bloqueado</span>`;
      actionsHTML = `<button class="btn-small btn-unblock" type="button">Desbloquear</button>`;
    } else {
      statusHTML = `<span class="status-badge status-livre">Livre</span>${extra ? '<span class="admin-row-sub">Horário extra</span>' : ""}`;
      actionsHTML = `<button class="btn-small btn-block" type="button">Bloquear</button>`;
      if (extra) actionsHTML += `<button class="btn-small danger btn-remove-extra" type="button">Excluir horário</button>`;
    }

    row.innerHTML = `
      <div class="admin-row-main"><b>${time}</b><div>${statusHTML}</div></div>
      <div class="admin-row-actions">${actionsHTML}</div>
    `;

    const blockBtn = row.querySelector(".btn-block");
    if (blockBtn) blockBtn.addEventListener("click", () => {
      const list = getBlockedSlots();
      list.push({ id: `bloq_${Date.now()}`, profId: prof.id, date: state.availDate, time });
      saveBlockedSlots(list);
      renderAvailSlots(prof);
      renderDashboard();
    });

    const unblockBtn = row.querySelector(".btn-unblock");
    if (unblockBtn) unblockBtn.addEventListener("click", () => {
      saveBlockedSlots(getBlockedSlots().filter(x => !(x.profId === prof.id && x.date === state.availDate && x.time === time)));
      renderAvailSlots(prof);
      renderDashboard();
    });

    const removeExtraBtn = row.querySelector(".btn-remove-extra");
    if (removeExtraBtn) removeExtraBtn.addEventListener("click", () => {
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
  const profFilter = document.getElementById("filter-prof").value;
  const statusFilter = document.getElementById("filter-status").value;
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;

  return getBookings()
    .filter(b => profFilter === "todos" || b.profId === profFilter)
    .filter(b => statusFilter === "todos" || b.status === statusFilter)
    .filter(b => !search || b.name.toLowerCase().includes(search) || b.email.toLowerCase().includes(search))
    .filter(b => !from || b.date >= from)
    .filter(b => !to || b.date <= to)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function renderBookingsTable() {
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
    const statusLabel = { pendente: "Pendente", confirmado: "Confirmado", concluido: "Concluído" }[b.status] || b.status;
    const nextAction = b.status === "pendente"
      ? `<button class="btn-small btn-confirm" type="button">Confirmar</button>`
      : b.status === "confirmado"
        ? `<button class="btn-small btn-complete" type="button">Concluir</button>`
        : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.name}</td>
      <td>${b.email}</td>
      <td>${b.profName}</td>
      <td>${day} (${weekday})</td>
      <td>${b.time}</td>
      <td><span class="status-badge status-${b.status}">${statusLabel}</span></td>
      <td class="row-actions">
        <button class="btn-small btn-view" type="button">Visualizar</button>
        <button class="btn-small btn-edit" type="button">Editar</button>
        <button class="btn-small btn-reschedule" type="button">Reagendar</button>
        ${nextAction}
        <button class="btn-small btn-retorno" type="button">Retorno</button>
        <button class="btn-small danger btn-cancel" type="button">Cancelar</button>
      </td>
    `;

    tr.querySelector(".btn-view").addEventListener("click", () => openViewModal(b));
    tr.querySelector(".btn-edit").addEventListener("click", () => openEditModal(b));
    tr.querySelector(".btn-reschedule").addEventListener("click", () => openRescheduleModal(b));
    tr.querySelector(".btn-retorno").addEventListener("click", () => openRetornoModal(b));

    const confirmBtn = tr.querySelector(".btn-confirm");
    if (confirmBtn) confirmBtn.addEventListener("click", () => updateBookingStatus(b.id, "confirmado"));
    const completeBtn = tr.querySelector(".btn-complete");
    if (completeBtn) completeBtn.addEventListener("click", () => updateBookingStatus(b.id, "concluido"));

    tr.querySelector(".btn-cancel").addEventListener("click", () => {
      if (!confirm(`Cancelar o agendamento de ${b.name}? O horário volta a ficar disponível.`)) return;
      saveBookings(getBookings().filter(x => x.id !== b.id));
      addNotification("cancelamento", `Agendamento de ${b.name} com ${b.profName} em ${day} às ${b.time} foi cancelado pela administração.`);
      renderAll();
    });

    tbody.appendChild(tr);
  });
}

function updateBookingStatus(id, status) {
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
      <div class="row"><span>Criado em</span><b>${new Date(b.createdAt).toLocaleString("pt-BR")}</b></div>
    </div>
  `);
}

function openEditModal(b) {
  openGenericModal(`
    <h2>Editar dados do colaborador</h2>
    <form id="edit-form" class="admin-form">
      <label>Nome completo
        <input type="text" id="ed-name" required value="${b.name}">
      </label>
      <label>E-mail
        <input type="email" id="ed-email" required value="${b.email}">
      </label>
      <button type="submit" class="btn-primary btn-small-primary">Salvar</button>
    </form>
  `);
  document.getElementById("edit-form").addEventListener("submit", e => {
    e.preventDefault();
    const list = getBookings();
    const target = list.find(x => x.id === b.id);
    target.name = document.getElementById("ed-name").value.trim();
    target.email = document.getElementById("ed-email").value.trim();
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
        const list = getBookings();
        const target = list.find(x => x.id === b.id);
        const { day } = formatDateLabel(dateISO);
        target.date = dateISO;
        target.time = time;
        saveBookings(list);
        addNotification("reagendamento", `Agendamento de ${b.name} com ${b.profName} foi remarcado para ${day} às ${time}.`);
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
    addNotification("retorno", `Retorno de ${b.name} marcado para ${day}.`);

    closeGenericModal();
    renderAll();
  });
}

/* =========================================================
   RETORNOS
   ========================================================= */
function renderRetornos() {
  const wrap = document.getElementById("retornos-list");
  const emptyMsg = document.getElementById("retornos-empty");
  const todayISO = toISODate(new Date());
  const retornos = getRetornos().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

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
        ${r.status === "pendente" ? `<button class="btn-small btn-done" type="button">Marcar concluído</button>` : ""}
      </div>
    `;
    const doneBtn = row.querySelector(".btn-done");
    if (doneBtn) doneBtn.addEventListener("click", () => {
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
function renderNotifications() {
  const wrap = document.getElementById("notif-list-full");
  const emptyMsg = document.getElementById("notif-empty");
  const list = getNotifications();

  wrap.innerHTML = "";
  if (list.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  list.forEach(n => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main">
        <div>
          ${!n.read ? '<span class="status-badge status-hoje">Nova</span>' : ""}
          <span>${n.message}</span>
          <span class="admin-row-sub">${new Date(n.createdAt).toLocaleString("pt-BR")}</span>
        </div>
      </div>
    `;
    wrap.appendChild(row);
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
   CONFIGURAÇÕES
   ========================================================= */
function loadSettingsIntoForm() {
  const s = getSettings();
  document.getElementById("cfg-domain").value = s.companyEmailDomain;
  document.getElementById("cfg-days-ahead").value = s.daysAhead;
  document.getElementById("cfg-username").value = getAdminCredentials().username;
}

/* =========================================================
   TEMPO REAL
   Quando qualquer dado muda no Supabase (por um colaborador
   agendando, ou por outra aba/computador do admin), atualiza
   o painel sozinho.
   ========================================================= */
onDataChange(() => {
  if (!adminInitDone) return;
  populateProfessionalSelects();
  renderAll();
});
