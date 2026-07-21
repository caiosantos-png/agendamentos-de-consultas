/* =========================================================
   CONEXÃO COM O SUPABASE
   -----------------------------------------------------------
   Substitua os valores abaixo pelos do SEU projeto.
   Onde encontrar: painel do Supabase > Project Settings (ícone
   de engrenagem) > API > "Project URL" e "anon public" key.
   ========================================================= */
const SUPABASE_URL = "https://hhgqtvctwjojlkbkkjer.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VyZr-fkMiDVoc1b-chPiNw_hjOQaQgQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);