// Cliente Supabase (service role) — este serviço não tem sessão de
// usuário (é um processo sempre-ativo reagindo a evento do WhatsApp), então
// já opera no mesmo nível de acesso de is_soma_staff() por definição, mesmo
// raciocínio do integra-contador/supabase_client.py.

const { createClient } = require("@supabase/supabase-js");

let cliente = null;

function obterCliente() {
  if (!cliente) {
    cliente = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return cliente;
}

module.exports = { obterCliente };
