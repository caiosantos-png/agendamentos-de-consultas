/* =========================================================
   ESTADO
   ========================================================= */
const state = {
  professional: null,
  date: null,   // "YYYY-MM-DD"
  time: null    // "HH:MM"
};

/* =========================================================
   NAVEGAÇÃO ENTRE ETAPAS
   ========================================================= */
function goToStep(n) {
  document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
  document.getElementById(`step-${n}`).classList.add("active");

  document.querySelectorAll("#steps li").forEach(li => {
    const step = Number(li.dataset.step);
    li.classList.remove("on", "done");
    if (step === n) li.classList.add("on");
    else if (step < n && n <= 4) li.classList.add("done");
  });
}

/* =========================================================
   RENDERIZAÇÃO — Etapa 1: profissionais
   ========================================================= */
function renderProfessionals() {
  const wrap = document.getElementById("professional-list");
  wrap.innerHTML = "";

  getProfessionals().forEach(prof => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prof-card";
    btn.innerHTML = `
      <span class="tag">${prof.tag}</span>
      <h3>${prof.name}</h3>
      <p><strong>${prof.role}</strong><br>${prof.description}</p>
    `;
    btn.addEventListener("click", () => {
      state.professional = prof;
      state.date = null;
      state.time = null;
      renderDates();
      goToStep(2);
    });
    wrap.appendChild(btn);
  });
}

/* =========================================================
   RENDERIZAÇÃO — Etapa 2: datas
   ========================================================= */
function renderDates() {
  const prof = state.professional;
  document.getElementById("date-title").textContent = `Datas disponíveis com ${prof.name}`;

  const wrap = document.getElementById("date-list");
  const emptyMsg = document.getElementById("date-empty");
  wrap.innerHTML = "";

  const dates = getDatesWithAvailability(prof);

  if (dates.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  dates.forEach(dateISO => {
    const { weekday, day } = formatDateLabel(dateISO);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.innerHTML = `${day}<small>${weekday}</small>`;
    btn.addEventListener("click", () => {
      state.date = dateISO;
      state.time = null;
      renderTimes();
      goToStep(3);
    });
    wrap.appendChild(btn);
  });
}

/* =========================================================
   RENDERIZAÇÃO — Etapa 3: horários
   ========================================================= */
function renderTimes() {
  const prof = state.professional;
  const { weekday, day } = formatDateLabel(state.date);
  document.getElementById("time-title").textContent = `Horários em ${day} (${weekday})`;

  const wrap = document.getElementById("time-list");
  wrap.innerHTML = "";

  const times = getFreeSlots(prof, state.date);

  times.forEach(time => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = time;
    btn.addEventListener("click", () => {
      state.time = time;
      renderSummary();
      goToStep(4);
    });
    wrap.appendChild(btn);
  });
}

/* =========================================================
   RENDERIZAÇÃO — Etapa 4: resumo + formulário
   ========================================================= */
function renderSummary() {
  const prof = state.professional;
  const { weekday, day } = formatDateLabel(state.date);
  document.getElementById("summary-card").innerHTML = `
    <strong>${prof.name} — ${prof.role}</strong>
    <div class="row"><span>Data</span><b>${day} (${weekday})</b></div>
    <div class="row"><span>Horário</span><b>${state.time}</b></div>
    <div class="row"><span>Duração</span><b>${prof.slotMinutes} min</b></div>
  `;
  document.getElementById("form-error").hidden = true;
  document.getElementById("booking-form").reset();
}

/* =========================================================
   ENVIO DO FORMULÁRIO
   ========================================================= */

document.getElementById("booking-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("input-name").value.trim();
  const email = document.getElementById("input-email").value.trim();
  const errorEl = document.getElementById("form-error");
  const submitBtn = e.target.querySelector("button[type=submit]");

  if (!name) {
    errorEl.textContent = "Informe seu nome completo.";
    errorEl.hidden = false;
    return;
  }
  if (!isValidEmail(email)) {
    errorEl.textContent = getSettings().companyEmailDomain
      ? `Use seu e-mail corporativo (@${getSettings().companyEmailDomain}).`
      : "Informe um e-mail válido.";
    errorEl.hidden = false;
    return;
  }

  // checagem rápida local (evita mostrar horários já ocupados na maioria dos casos)
  if (isSlotTaken(state.professional.id, state.date, state.time)) {
    errorEl.textContent = "Esse horário acabou de ser reservado por outra pessoa. Escolha outro.";
    errorEl.hidden = false;
    renderTimes();
    goToStep(3);
    return;
  }

  const booking = {
    id: `${state.professional.id}_${state.date}_${state.time}_${Date.now()}`,
    profId: state.professional.id,
    profName: state.professional.name,
    profRole: state.professional.role,
    date: state.date,
    time: state.time,
    name,
    email,
    status: "pendente", // pendente | confirmado | concluido
    createdAt: new Date().toISOString()
  };

  submitBtn.disabled = true;
  errorEl.hidden = true;

  // checagem definitiva: o banco tem uma restrição que impede duas pessoas
  // ocuparem o mesmo horário, mesmo que cliquem ao mesmo tempo
  const result = await createBookingSafely(booking);

  if (!result.ok) {
    submitBtn.disabled = false;
    if (result.reason === "taken") {
      errorEl.textContent = "Esse horário acabou de ser reservado por outra pessoa. Escolha outro.";
      errorEl.hidden = false;
      renderTimes();
      goToStep(3);
    } else {
      errorEl.textContent = "Não foi possível confirmar o agendamento. Verifique sua conexão e tente novamente.";
      errorEl.hidden = false;
    }
    return;
  }

  const { day } = formatDateLabel(booking.date);
  addNotification(
    "agendamento",
    `Novo agendamento: ${booking.name} marcou com ${booking.profName} em ${day} às ${booking.time}.`
  );

  submitBtn.disabled = false;
  renderConfirmation(booking);
  goToStep(5);
});

function renderConfirmation(booking) {
  const { weekday, day } = formatDateLabel(booking.date);
  document.getElementById("confirm-summary").innerHTML = `
    <strong>${booking.profName} — ${booking.profRole}</strong>
    <div class="row"><span>Data</span><b>${day} (${weekday})</b></div>
    <div class="row"><span>Horário</span><b>${booking.time}</b></div>
    <div class="row"><span>Nome</span><b>${booking.name}</b></div>
    <div class="row"><span>E-mail</span><b>${booking.email}</b></div>
  `;
}

document.getElementById("btn-new-booking").addEventListener("click", () => {
  state.professional = null;
  state.date = null;
  state.time = null;
  goToStep(1);
});

/* =========================================================
   BOTÕES "VOLTAR"
   ========================================================= */
document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => goToStep(Number(btn.dataset.back)));
});

/* =========================================================
   MODAL "MEUS AGENDAMENTOS"
   ========================================================= */
const overlay = document.getElementById("modal-overlay");

function openModal() {
  overlay.classList.add("is-open");
  overlay.hidden = false;
  document.getElementById("lookup-email").focus();
}
function closeModal() {
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  document.getElementById("lookup-results").innerHTML = "";
  document.getElementById("lookup-email").value = "";
}

document.getElementById("btn-my-bookings").addEventListener("click", openModal);
document.getElementById("modal-close").addEventListener("click", closeModal);
overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !overlay.hidden) closeModal();
});

function renderLookupResults(email) {
  const results = document.getElementById("lookup-results");
  const bookings = getBookings()
    .filter(b => b.email.toLowerCase() === email.toLowerCase())
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (bookings.length === 0) {
    results.innerHTML = `<p class="no-results">Nenhum agendamento encontrado para este e-mail.</p>`;
    return;
  }

  results.innerHTML = "";
  bookings.forEach(b => {
    const { weekday, day } = formatDateLabel(b.date);
    const item = document.createElement("div");
    item.className = "booking-item";
    item.innerHTML = `
      <div class="row"><b>${b.profName}</b><span>${b.profRole}</span></div>
      <div class="row"><span>Data</span><b>${day} (${weekday})</b></div>
      <div class="row"><span>Horário</span><b>${b.time}</b></div>
      <button class="btn-cancel" type="button">Cancelar agendamento</button>
    `;
    item.querySelector(".btn-cancel").addEventListener("click", () => {
      if (!confirm("Cancelar este agendamento? O horário voltará a ficar disponível.")) return;
      const updated = getBookings().filter(x => x.id !== b.id);
      saveBookings(updated);
      renderLookupResults(email);
    });
    results.appendChild(item);
  });
}

document.getElementById("lookup-btn").addEventListener("click", () => {
  const email = document.getElementById("lookup-email").value.trim();
  if (!email) return;
  renderLookupResults(email);
});
document.getElementById("lookup-email").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("lookup-btn").click();
});

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
document.getElementById("professional-list").innerHTML = `<p class="empty-msg">Carregando profissionais...</p>`;

dataReadyPromise.then(ok => {
  if (!ok) {
    document.getElementById("professional-list").innerHTML =
      `<p class="empty-msg">Não foi possível conectar ao banco de dados. Verifique sua internet ou as credenciais em supabase-config.js.</p>`;
    return;
  }
  renderProfessionals();
});

// Quando algo muda em tempo real (outro colaborador agenda, admin bloqueia
// um horário, etc.), atualiza a etapa que a pessoa está vendo agora
onDataChange(() => {
  renderProfessionals();
  if (state.professional && document.getElementById("step-2").classList.contains("active")) renderDates();
  if (state.professional && state.date && document.getElementById("step-3").classList.contains("active")) renderTimes();
});
