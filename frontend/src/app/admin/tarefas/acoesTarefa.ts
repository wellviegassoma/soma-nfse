import { concluirSePagoAction } from "@/lib/actions/tarefas";
import type { Verificacao } from "@/lib/tarefas-comum";

// Mesmas rotas das Centrais (Simples e ISS): consultam o pagamento da guia
// da competência e gravam em das_pagamentos / iss_pagamentos. A consulta
// federal (DAS) é uma chamada cobrada do Integra Contador.
function rotaVerificacao(v: Verificacao, companyId: string, competencia: string): string {
  if (v === "DAS") return `/admin/empresas/${companyId}/integra-contador/pagamentos?competencia=${competencia}`;
  if (v === "ISS_RIO") return `/admin/fechamento/iss-rio/pagamento/${companyId}?competencia=${competencia}`;
  return `/admin/fechamento/iss-petropolis/pagamento/${companyId}?competencia=${competencia}`;
}

export const ROTULO_VERIFICACAO: Record<Verificacao, string> = {
  DAS: "DAS (Receita)",
  ISS_RIO: "ISS (Nota Carioca)",
  ISS_PETROPOLIS: "ISS (Prefeitura de Petrópolis)",
};

/** Consulta o pagamento na central e, se pago, conclui todas as etapas da tarefa. */
export async function verificarPagamentoTarefa(t: {
  id: string;
  company_id: string;
  competencia: string;
  verificacao: Verificacao;
}): Promise<{ ok: boolean; mensagem: string }> {
  let r: Response;
  try {
    r = await fetch(rotaVerificacao(t.verificacao, t.company_id, t.competencia), { cache: "no-store" });
  } catch {
    return { ok: false, mensagem: "Não foi possível consultar a central agora." };
  }
  if (!r.ok) {
    const corpo = await r.json().catch(() => null);
    return { ok: false, mensagem: corpo?.error ?? `A consulta respondeu HTTP ${r.status}.` };
  }
  const a = await concluirSePagoAction(t.id);
  if ("error" in a) return { ok: false, mensagem: a.error };
  return { ok: a.pago, mensagem: a.mensagem };
}
