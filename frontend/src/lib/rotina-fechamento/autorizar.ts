import "server-only";
import { createClient } from "@/lib/supabase/server";
import { autorizarChamadaInterna } from "@/lib/internal-auth";

export type AutorizacaoRotina = { ok: true; executadoPor: string | null } | { ok: false };

// Toda rota de etapa da Rotina de Fechamento aceita duas formas de
// autorização: um staff logado clicando o botão no painel, OU o token
// interno (mesmo CRON_SECRET dos crons) — é o que deixa essas rotas
// serem chamadas direto via curl (painel do chat, sem sessão nenhuma).
// Não usa requireSomaStaff() aqui porque ele faz redirect() em vez de
// devolver um 401 — errado numa API route chamada por curl.
export async function autorizarRotinaFechamento(request: Request): Promise<AutorizacaoRotina> {
  if (autorizarChamadaInterna(request)) {
    return { ok: true, executadoPor: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data } = await supabase
    .from("user_companies")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["SUPER_ADMIN", "ADMIN_SOMA"])
    .limit(1);
  if (!data || data.length === 0) return { ok: false };

  return { ok: true, executadoPor: user.id };
}
