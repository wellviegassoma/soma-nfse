// Cliente Supabase (service role) — este serviço não tem sessão de
// usuário (é um processo sempre-ativo reagindo a evento do WhatsApp), então
// já opera no mesmo nível de acesso de is_soma_staff() por definição, mesmo
// raciocínio do integra-contador/supabase_client.py.

const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

let cliente = null;

function obterCliente() {
  if (!cliente) {
    cliente = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        // supabase-js sempre monta um RealtimeClient no construtor, mesmo
        // quando ninguém assina canal nenhum (este serviço só usa REST/RPC).
        // Em Node < 22 (sem WebSocket nativo) isso derruba o processo
        // inteiro com "native WebSocket not found" — passar o `ws` aqui
        // evita a montagem quebrar, sem depender de qual versão do Node a
        // Railway resolver usar no build. Ver
        // https://github.com/orgs/supabase/discussions/45715.
        realtime: { transport: ws },
      },
    );
  }
  return cliente;
}

module.exports = { obterCliente };
