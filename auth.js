/* =========================================================
   AUTENTICAÇÃO DO PAINEL ADMINISTRATIVO
   -----------------------------------------------------------
   Agora usa contas reais do Supabase Auth (e não mais uma senha
   única em JavaScript). Cada conta tem um papel (role) gravado
   na tabela "profiles": admin | visualizador | medico.
   A validação de permissão acontece em dois lugares:
   1) Aqui, para mostrar/esconder telas e botões (experiência).
   2) No banco de dados, via Row Level Security — mesmo que
      alguém tente burlar a tela, o Supabase recusa a ação se o
      papel do usuário não permitir (ver supabase_roles_migration.sql).
   ========================================================= */

let currentUser = null; // { id, username, role, profId }

function getCurrentUser() { return currentUser; }

async function loginWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "E-mail ou senha incorretos." };

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabaseClient.auth.signOut();
    return { ok: false, message: "Esta conta não tem um perfil de acesso configurado. Fale com o administrador." };
  }

  currentUser = { id: profile.id, username: profile.username, role: profile.role, profId: profile.prof_id };
  return { ok: true };
}

async function restoreSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) return false;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (!profile) {
    await supabaseClient.auth.signOut();
    return false;
  }

  currentUser = { id: profile.id, username: profile.username, role: profile.role, profId: profile.prof_id };
  return true;
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
}

/* =========================================================
   PERMISSÕES POR PAPEL
   -----------------------------------------------------------
   Fonte única usada pelo admin.js para decidir o que mostrar,
   habilitar ou esconder. As mesmas regras (com outra sintaxe)
   estão espelhadas no banco via RLS — aqui é só a camada visual.
   ========================================================= */
const PERMISSIONS = {
  admin: {
    viewAllAgendas: true, manageProfessionals: true, manageUsers: true,
    manageSettings: true, createEditDeleteSlots: true, blockUnblock: true,
    confirmCancelReschedule: true, manageRetornos: true, markNotifRead: true,
    manageAppointmentType: true,
    scopedToOwnProf: false
  },
  visualizador: {
    viewAllAgendas: true, manageProfessionals: false, manageUsers: false,
    manageSettings: false, createEditDeleteSlots: false, blockUnblock: false,
    confirmCancelReschedule: false, manageRetornos: false, markNotifRead: false,
    manageAppointmentType: false,
    scopedToOwnProf: false
  },
  medico: {
    viewAllAgendas: true, manageProfessionals: false, manageUsers: false,
    manageSettings: false, createEditDeleteSlots: true, blockUnblock: false,
    confirmCancelReschedule: true, manageRetornos: true, markNotifRead: true,
    manageAppointmentType: false, // vê o campo, mas não pode alterar (só consulta)
    scopedToOwnProf: true
  }
};

// Uso: can("blockUnblock") — devolve true/false conforme o papel do usuário logado
function can(permission) {
  if (!currentUser) return false;
  return !!PERMISSIONS[currentUser.role]?.[permission];
}
