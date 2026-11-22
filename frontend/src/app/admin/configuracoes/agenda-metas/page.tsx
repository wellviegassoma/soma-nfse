import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { chaveObrigacao, itemRelevante } from "@/lib/agenda-tributaria";
import { MetasTabela, type ObrigacaoMeta } from "./MetasTabela";

export const metadata = { title: "Metas da agenda tributária — Painel SOMA" };

type ItemRow = {
  mes: string;
  tipo: "TRIBUTO" | "DECLARACAO";
  dia: number | null;
  dia_texto: string | null;
  codigo: string | null;
  grupo: string | null;
  descricao: string;
};

export default async function AgendaMetasPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  // Todas as obrigações já importadas (~300 por mês, cresce todo mês —
  // paginado). A mais recente de cada obrigação dá a descrição e o dia.
  const [itens, { data: metas }] = await Promise.all([
    buscarTudoPaginado<ItemRow>((from, to) =>
      supabase
        .from("agenda_tributaria_itens")
        .select("mes, tipo, dia, dia_texto, codigo, grupo, descricao")
        .order("mes", { ascending: false })
        .order("ordem")
        .range(from, to),
    ),
    supabase.from("agenda_tributaria_metas").select("chave, tipo, codigo, grupo, descricao, dia_meta, observacao"),
  ]);

  const porChave = new Map<string, ObrigacaoMeta>();
  for (const i of itens) {
    const chave = chaveObrigacao(i);
    const prazo = i.dia === 0 ? "Diário" : i.dia ? `dia ${i.dia}` : i.dia_texto ?? "—";
    if (!porChave.has(chave)) {
      porChave.set(chave, {
        chave,
        tipo: i.tipo,
        codigo: i.codigo,
        grupo: i.grupo,
        descricao: i.descricao,
        relevante: itemRelevante(i),
        prazoReceita: `${prazo} (${i.mes.slice(5, 7)}/${i.mes.slice(0, 4)})`,
        diaFixo: (i.dia ?? 0) > 0,
        diaMeta: null,
        observacao: null,
      });
    }
  }
  // Metas cadastradas cuja obrigação não está em nenhum mês importado
  // continuam na lista (não somem por a Receita mudar a descrição).
  for (const m of metas ?? []) {
    const o = porChave.get(m.chave);
    if (o) {
      o.diaMeta = m.dia_meta;
      o.observacao = m.observacao;
    } else {
      porChave.set(m.chave, {
        chave: m.chave,
        tipo: m.tipo,
        codigo: m.codigo,
        grupo: m.grupo,
        descricao: m.descricao,
        relevante: true,
        prazoReceita: "fora das agendas importadas",
        diaFixo: true,
        diaMeta: m.dia_meta,
        observacao: m.observacao,
      });
    }
  }

  const lista = [...porChave.values()].sort(
    (a, b) =>
      Number(b.diaMeta != null) - Number(a.diaMeta != null) ||
      Number(b.relevante) - Number(a.relevante) ||
      (a.tipo === b.tipo ? 0 : a.tipo === "TRIBUTO" ? -1 : 1) ||
      (a.grupo ?? "").localeCompare(b.grupo ?? "") ||
      (a.codigo ?? "").localeCompare(b.codigo ?? ""),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Metas da agenda tributária</h1>
        <p className="text-sm text-foreground/60">
          Dia do mês em que a SOMA quer entregar cada obrigação ao cliente. No calendário da Visão geral a
          obrigação aparece na meta (roxo) e no prazo final da Receita. Sábado/domingo antecipa para sexta;
          a meta nunca passa do prazo da Receita. Deixe em branco para mostrar só o prazo final.
        </p>
      </div>
      <MetasTabela obrigacoes={lista} />
    </div>
  );
}
