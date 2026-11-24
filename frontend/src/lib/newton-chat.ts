import "server-only";

// Ferramentas do chat do Newton (mesmo desenho do da Serena, lib/serena-chat.ts):
// consultas da esteira e ações seguras (conferir prefeitura, auditar com IA).
// Encerrar MIT, transmitir DCTFWeb, gerar DARF e mandar mensagem ficam nos
// botões da tela.

import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarEsteiraNewton, type LinhaNewton } from "@/lib/newton";
import { rodarRotinaNewton } from "@/lib/newton-rotina";

type Db = SupabaseClient;

const COMP = z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Competência AAAA-MM (padrão: a do fechamento atual).");

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function resumoLinha(l: LinhaNewton) {
  const d = l.calc.devido;
  return {
    id: l.id,
    empresa: l.nome,
    municipio: l.municipio,
    cadastro: [l.issFixo ? "ISS fixo" : "ISS percentual", l.equiparacaoCadastro ? "equiparação hospitalar" : null].filter(Boolean).join(" · "),
    telas: {
      impostos: `/admin/empresas/${l.id}/impostos`,
      notasDoMesParaEquiparacao: `/admin/empresas/${l.id}/fechamento`,
      dadosFiscais: `/admin/empresas/${l.id}/dados-fiscais`,
    },
    filiais: l.filiais.map((f) => f.nome),
    situacao: l.situacao === "acao" ? "precisa de ação" : l.situacao === "concluida" ? "concluída" : "com o Newton",
    calculo: `receita do mês R$ ${l.calc.receitaMes.toFixed(2)} (hospitalar marcada R$ ${l.calc.receitaHospitalarMes.toFixed(2)}) · trimestre R$ ${l.calc.receitaTrimestre.toFixed(2)} · devido: PIS ${d.pis.toFixed(2)} COFINS ${d.cofins.toFixed(2)} IRPJ ${d.irpj.toFixed(2)} CSLL ${d.csll.toFixed(2)} (${l.calc.fechaTrimestre ? "mês de IRPJ/CSLL" : "só PIS/COFINS"})`,
    etapas: l.etapas.map((e) => `${e.nome}: ${e.titulo}${e.detalhe ? ` (${e.detalhe})` : ""}`).join(" → "),
    recado: l.recado,
    motivos: l.motivos.map((m) => `[${m.nivel}] ${m.texto}`),
    decisaoNewton: l.newton?.ia_decisao ?? null,
  };
}

export function ferramentasNewton(db: Db, competenciaPadrao: string) {
  let cache: { comp: string; linhas: LinhaNewton[] } | null = null;
  const esteira = async (comp: string) => {
    if (cache?.comp !== comp) cache = { comp, linhas: await carregarEsteiraNewton(db, comp) };
    return cache.linhas;
  };

  return {
    resumoCarteira: tool({
      description: "Resumo da carteira do Newton na competência: quantas em cada situação, bloqueios mais comuns, prontas para o MIT, DARF gerados/entregues/pagos.",
      inputSchema: z.object({ competencia: COMP }),
      execute: async ({ competencia }) => {
        const comp = competencia ?? competenciaPadrao;
        const l = await esteira(comp);
        const motivos = new Map<string, number>();
        for (const x of l) for (const m of x.motivos) motivos.set(m.codigo, (motivos.get(m.codigo) ?? 0) + 1);
        return {
          competencia: comp,
          total: l.length,
          precisamDeAcao: l.filter((x) => x.situacao === "acao").length,
          comONewton: l.filter((x) => x.situacao === "newton").length,
          concluidas: l.filter((x) => x.situacao === "concluida").length,
          bloqueadas: l.filter((x) => x.conferencia === "BLOQUEADO").length,
          emRevisar: l.filter((x) => x.conferencia === "REVISAR" && !x.aprovada).length,
          prontasParaMit: l.filter((x) => x.aprovada && !x.mitEncerrado).length,
          mitEncerrados: l.filter((x) => x.mitEncerrado).length,
          darfGerados: l.filter((x) => x.newton?.darf_gerado_em).length,
          entregues: l.filter((x) => x.newton?.entregue_em).length,
          pagos: l.filter((x) => x.newton?.pago).length,
          totalFederais: Math.round(l.reduce((t, x) => t + x.calc.total, 0) * 100) / 100,
          motivosMaisComuns: [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
        };
      },
    }),

    listarEmpresas: tool({
      description: "Lista empresas da carteira por situação: bloqueadas, revisar, equiparacao (equiparação hospitalar sem marcação), prontas (para encerrar o MIT), escaladas (com a equipe), sem_grupo, concluidas, ou todas.",
      inputSchema: z.object({
        filtro: z.enum(["bloqueadas", "revisar", "equiparacao", "prontas", "escaladas", "sem_grupo", "concluidas", "todas"]),
        competencia: COMP,
      }),
      execute: async ({ filtro, competencia }) => {
        const l = await esteira(competencia ?? competenciaPadrao);
        const sel = l.filter((x) =>
          filtro === "bloqueadas" ? x.conferencia === "BLOQUEADO"
          : filtro === "revisar" ? x.conferencia === "REVISAR" && !x.aprovada
          : filtro === "equiparacao" ? x.motivos.some((m) => m.codigo.startsWith("EQUIPARACAO"))
          : filtro === "prontas" ? x.aprovada && !x.mitEncerrado
          : filtro === "escaladas" ? x.newton?.ia_decisao === "ESCALAR" && !x.aprovada
          : filtro === "sem_grupo" ? !x.temGrupoDigisac
          : filtro === "concluidas" ? x.situacao === "concluida"
          : true,
        );
        return { quantidade: sel.length, empresas: sel.slice(0, 60).map((x) => `${x.nome} — ${x.recado.slice(0, 140)}`) };
      },
    }),

    detalheEmpresa: tool({
      description: "Esteira completa de uma empresa da carteira (busca por nome ou código): cálculo, etapas, recado, motivos e decisão do Newton.",
      inputSchema: z.object({ busca: z.string().min(2), competencia: COMP }),
      execute: async ({ busca, competencia }) => {
        const l = await esteira(competencia ?? competenciaPadrao);
        const q = semAcento(busca);
        const achadas = l.filter((x) => semAcento(x.nome).includes(q));
        if (!achadas.length) return { erro: "Nenhuma empresa da carteira do Newton com esse nome." };
        return { empresas: achadas.slice(0, 3).map(resumoLinha) };
      },
    }),

    conferirPrefeitura: tool({
      description: "AÇÃO SEGURA (só consulta): confere com a Prefeitura de Petrópolis o faturamento das empresas ainda não conferidas. Sem IA, sem custo.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(25).default(15), competencia: COMP }),
      execute: async ({ limite, competencia }) => {
        const r = await rodarRotinaNewton(db, competencia ?? competenciaPadrao, { conferencias: limite, revisoes: 0 }, "motor");
        cache = null;
        return { conferidasComSucesso: r.conferidas, erro: r.erro ?? null };
      },
    }),

    auditarComIa: tool({
      description: "AÇÃO SEGURA (custo pequeno, ~US$0,07 por empresa): audita com IA as empresas em 'Revisar' sem decisão atual; casos que não aprova viram tarefa para Paulo/Douglas.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(8).default(5), competencia: COMP }),
      execute: async ({ limite, competencia }) => {
        const r = await rodarRotinaNewton(db, competencia ?? competenciaPadrao, { conferencias: 0, revisoes: limite }, "ia");
        cache = null;
        return { revisadas: r.revisadas, recomendaAprovar: r.aprovadas, passadasParaEquipe: r.escaladas, faltam: r.faltamRevisar, custoUsd: Math.round(r.custoUsd * 100) / 100, erro: r.erro ?? null };
      },
    }),
  };
}
