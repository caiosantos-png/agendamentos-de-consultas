/* =========================================================
   CREDENCIAIS DE ACESSO DO ADMINISTRADOR
   -----------------------------------------------------------
   Aviso importante: este é um sistema 100% front-end (sem
   servidor). Isso significa que esta trava de usuário/senha
   NÃO é segurança real — qualquer pessoa com conhecimento
   técnico pode ler este arquivo ou pular o login pelo Console
   do navegador. Para uso interno, numa rede restrita, isso é
   uma trava razoável contra acesso casual. Para dados
   sensíveis de verdade, seria necessário um backend com
   autenticação server-side.

   Altere as credenciais padrão abaixo.
   ========================================================= */
const AUTH_DEFAULT_CREDENTIALS = {
  username: "admin",
  password: "admin123"
};

const AUTH_OVERRIDE_KEY = "admin_credentials_override_v1";
const AUTH_SESSION_KEY = "admin_session_v1";

// Permite trocar a senha pela tela de Configurações sem editar arquivos
function getAdminCredentials() {
  try {
    const override = JSON.parse(localStorage.getItem(AUTH_OVERRIDE_KEY));
    if (override && override.username && override.password) return override;
  } catch { /* ignora e usa o padrão */ }
  return AUTH_DEFAULT_CREDENTIALS;
}

function setAdminCredentials(username, password) {
  localStorage.setItem(AUTH_OVERRIDE_KEY, JSON.stringify({ username, password }));
}

function checkLogin(username, password) {
  const creds = getAdminCredentials();
  return username.trim().toLowerCase() === creds.username.trim().toLowerCase() && password === creds.password;
}

function isLoggedIn() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
}

function logLogin() {
  sessionStorage.setItem(AUTH_SESSION_KEY, "1");
}

function logLogout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}
