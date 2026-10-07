"use server";

import { revalidatePath } from "next/cache";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buscarFaturamentoMensal, somarFaturamento } from "@/lib/faturamento";
import { consultarFaturamentoPetropolis } from "@/lib/iss-petropolis";

export type ResultadoConferenciaPrefeitura = {
  ok: boolean;
  valorPrefeitura?: number;
  valorNotas?: number;
  erro?: string;
};

// Consulta (só leitura) o faturamento do mês no ISS de Petrópolis e guarda
// o resultado ao lado do total das notas importadas, pra Central Simples
// Nacional mostrar a coluna "Prefeitura". Uma empresa por chamada.
export async function conferirPrefeituraPetropolis(
  companyId: string,
  competencia: string,
): Promise<ResultadoConferenciaPrefeitura> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { ok: false, erro: "Competência inválida." };

  const supabase = await createClient();
  const [consulta, notas] = await Promise.all([
    consultarFaturamentoPetropolis(supabase, companyId, competencia),
    buscarFaturamentoMensal(supabase, companyId),
  ]);
  const valorNotas = somarFaturamento(notas, [competencia]);

  await supabase.from("conferencia_prefeitura").upsert(
    {
      company_id: companyId,
      competencia,
      valor_prefeitura: consulta.ok ? consulta.valorServicos : null,
      valor_notas: valorNotas,
      erro: consulta.ok ? null : consulta.erro,
      consultado_em: new Date().toISOString(),
      consultado_por: user.id,
    },
    { onConflict: "company_id,competencia" },
  );

  revalidatePath("/admin/fechamento/simples");
  return consulta.ok
    ? { ok: true, valorPrefeitura: consulta.valorServicos, valorNotas }
    : { ok: false, erro: consulta.erro, valorNotas };
}
