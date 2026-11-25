import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { diaUtil } from "@/lib/feriados";
import { hojeBrasilia } from "@/lib/competencia";
import { carregarCobranca } from "@/lib/extratos-cobranca";
import { enviarTexto, servicoDoContato } from "@/lib/digisac/client";

// Régua automática de cobrança de extratos (cron diário, dias úteis).
// No 1º dia útil a partir de dia_cobranca: cobrança do mês anterior para quem
// ainda não mandou. A partir de dia_lembrete: lembrete só do que falta.
// Cada empresa recebe no máximo uma de cada tipo por competência, e nada se
// alguém já cobrou nos últimos 3 dias. Começa desligada (extrato_regua_config).

export type ReguaConfig = { ativa: boolean; dia_cobranca: number; dia_lembrete: number };
export type ItemRegua = { companyId: string; empresa: string; grupo: string; contas: number; enviado?: boolean; erro?: string };

const MAX_POR_RODADA = 150;

export async function executarRegua(opcoes: { previa: boolean; hoje?: string }) {
  const db = createAdminClient();
  const { data: cfg } = await db.from("extrato_regua_config").select("ativa, dia_cobranca, dia_lembrete").eq("id", true).single();
  const config = (cfg ?? { ativa: false, dia_cobranca: 3, dia_lembrete: 8 }) as ReguaConfig;
  const hoje = opcoes.hoje ?? hojeBrasilia();
  const dia = Number(hoje.slice(8, 10));

  if (!config.ativa && !opcoes.previa) return { executou: false, motivo: "régua desligada", itens: [] as ItemRegua[] };
  if (!diaUtil(hoje)) return { executou: false, motivo: "não é dia útil", itens: [] as ItemRegua[] };
  const tipo = dia >= config.dia_lembrete ? "AUTO_LEMBRETE" : dia >= config.dia_cobranca ? "AUTO_COBRANCA" : null;
  if (!tipo) return { executou: false, motivo: `antes do dia ${config.dia_cobranca}`, itens: [] as ItemRegua[] };

  const [ano, mes] = hoje.slice(0, 7).split("-").map(Number);
  const competencia = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`; // mês anterior a "hoje"
  const empresas = await carregarCobranca({
    responsavelId: null,
    competencia,
    incluirAnteriores: false,
    db,
    lembrete: tipo === "AUTO_LEMBRETE",
  });

  const ids = empresas.map((e) => e.id);
  const { data: historico } = ids.length
    ? await db.from("extrato_cobrancas").select("company_id, tipo, competencia, created_at").in("company_id", ids).gte("created_at", `${competencia}-01`)
    : { data: [] };
  const limiteRecente = Date.now() - 3 * 24 * 3600 * 1000;
  const alvo = empresas.filter((e) => {
    if (!e.grupos.length) return false;
    // Lembrete só para quem já tem conta cadastrada e algo faltando.
    if (tipo === "AUTO_LEMBRETE" && e.semConta) return false;
    const h = (historico ?? []).filter((x) => x.company_id === e.id);
    if (h.some((x) => x.tipo === tipo && x.competencia === competencia)) return false;
    if (h.some((x) => new Date(x.created_at as string).getTime() > limiteRecente)) return false;
    return true;
  });

  const itens: ItemRegua[] = alvo.slice(0, MAX_POR_RODADA).map((e) => ({
    companyId: e.id,
    empresa: e.nome,
    grupo: e.grupos[0].nome,
    contas: e.itens.length,
  }));
  if (opcoes.previa) {
    return { executou: false, motivo: `prévia (${config.ativa ? "régua ligada" : "régua desligada"})`, tipo, competencia, itens, exemplo: alvo[0]?.texto ?? null };
  }

  for (const [i, e] of alvo.slice(0, MAX_POR_RODADA).entries()) {
    const grupo = e.grupos[0];
    try {
      const serviceId = await servicoDoContato(grupo.contactId).catch(() => null);
      await enviarTexto({ contactId: grupo.contactId, serviceId, texto: e.texto });
      await db.from("extrato_cobrancas").insert({
        company_id: e.id,
        competencia,
        itens: e.itens,
        contact_id: grupo.contactId,
        grupo_nome: grupo.nome,
        texto: e.texto,
        enviado_por: null,
        tipo,
      });
      itens[i].enviado = true;
    } catch (err) {
      itens[i].erro = err instanceof Error ? err.message : String(err);
      console.error("[extratos-regua]", e.id, itens[i].erro);
    }
    await new Promise((r) => setTimeout(r, 800)); // não atropelar o Digisac
  }
  return { executou: true, tipo, competencia, itens };
}
