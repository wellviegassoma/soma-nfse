import Link from "next/link";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarResponsaveisLegalizacao } from "@/lib/actions/legalizacao-processos";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES } from "@/lib/formatters";
import {
  STATUS_LABELS,
  STATUS_TONES,
  hojeSaoPaulo,
  statusEfetivoFase,
  type FaseParaStatus,
} from "@/app/legalizacao/processos/status";
import { diasEntre, textoDias } from "@/lib/legalizacao-licencas";
import { ConcluirEtapaButton } from "./ConcluirEtapaButton";

export const metadata = { title: "Renovações — Legalização" };

type Processo = {
  id: string;
  nome: string;
  prazo_final: string | null;
  licenca_vencimento: string | null;
  protocolo_numero: string | null;
  guia_vencimento: string | null;
  responsavel_id: string | null;
  responsavel: { full_name: string } | null;
  fases: (FaseParaStatus & { id: string; nome: string; ordem: number })[] | null;
  requisitos: { recebido_em: string | null }[] | null;
};

export default async function RenovacoesPage(props: PageProps<"/legalizacao/renovacoes">) {
  await requirePermissao("legalizacao.ver");
  const sp = await props.searchParams;
  const responsavelId = typeof sp.responsavelId === "string" ? sp.responsavelId : "";
  const supabase = await createClient();

  let query = supabase
    .from("legalizacao_processos")
    .select(
      "id, nome, prazo_final, licenca_vencimento, protocolo_numero, guia_vencimento, responsavel_id, responsavel:profiles!legalizacao_processos_responsavel_id_fkey(full_name), fases:legalizacao_processo_fases(id, nome, ordem, data_conclusao, status_manual, prazo), requisitos:legalizacao_processo_requisitos(recebido_em)",
    )
    .eq("tipo_processo", "RENOVACAO")
    .is("data_conclusao", null)
    .is("arquivado_em", null)
    .order("licenca_vencimento", { ascending: true, nullsFirst: false });
  if (responsavelId === "sem") query = query.is("responsavel_id", null);
  else if (responsavelId) query = query.eq("responsavel_id", responsavelId);

  const [{ data }, { data: fluxo }, responsaveis, podeEditar] = await Promise.all([
    query,
    supabase
      .from("legalizacao_fluxos")
      .select("fases:legalizacao_fluxo_fases_template(nome, ordem, ativo)")
      .eq("tipo_processo", "RENOVACAO")
      .eq("ativo", true)
      .order("ordem")
      .limit(1)
      .maybeSingle(),
    listarResponsaveisLegalizacao(),
    temPermissao("legalizacao.editar"),
  ]);

  const processos = (data ?? []) as unknown as Processo[];
  const hoje = hojeSaoPaulo();
  const colunasPadrao = ((fluxo?.fases ?? []) as { nome: string; ordem: number; ativo: boolean }[])
    .filter((f) => f.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => f.nome);

  const porColuna = new Map<string, { p: Processo; fase: NonNullable<Processo["fases"]>[number] }[]>();
  for (const nome of colunasPadrao) porColuna.set(nome, []);
  for (const p of processos) {
    const fase = [...(p.fases ?? [])].sort((a, b) => a.ordem - b.ordem).find((f) => !f.data_conclusao);
    if (!fase) continue;
    const coluna = porColuna.has(fase.nome) ? fase.nome : "Outras etapas";
    if (!porColuna.has(coluna)) porColuna.set(coluna, []);
    porColuna.get(coluna)!.push({ p, fase });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Renovações</h1>
          <p className="text-sm text-foreground/60">
            Processos de renovação de licença em andamento, pela etapa em que estão. Abra uma renovação pelo
            botão “Renovar” em Alvarás e licenças.
          </p>
        </div>
        <form className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-foreground/50">
            Responsável
            <Select name="responsavelId" defaultValue={responsavelId} className="w-52">
              <option value="">Todos</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
              <option value="sem">Sem responsável</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
      </div>

      {processos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-foreground/50">
          Nenhuma renovação em andamento{responsavelId ? " para esse responsável" : ""}.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[...porColuna.entries()].map(([coluna, itens]) => (
            <div key={coluna} className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-surface-muted/60 p-2">
              <div className="flex items-center justify-between px-1 py-1 text-xs font-semibold text-foreground/70">
                <span>{coluna}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-foreground/50">{itens.length}</span>
              </div>
              {itens.map(({ p, fase }) => {
                const status = statusEfetivoFase(fase, p.prazo_final, hoje);
                const dias = p.licenca_vencimento ? diasEntre(hoje, p.licenca_vencimento) : null;
                const docs = p.requisitos ?? [];
                const recebidos = docs.filter((d) => d.recebido_em).length;
                return (
                  <div key={p.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 text-xs">
                    <Link href={`/legalizacao/processos/${p.id}`} className="text-sm font-medium text-foreground hover:underline">
                      {p.nome}
                    </Link>
                    <div className={cn(dias != null && dias < 0 ? "text-danger" : "text-foreground/60")}>
                      Licença {dias == null ? "sem vencimento" : textoDias(dias)}
                    </div>
                    {docs.length > 0 && (
                      <div className="text-foreground/60">
                        Documentos {recebidos}/{docs.length}
                      </div>
                    )}
                    {p.protocolo_numero && <div className="text-foreground/60">Prot. {p.protocolo_numero}</div>}
                    {p.guia_vencimento && (
                      <div className="text-foreground/60">Guia vence {p.guia_vencimento.split("-").reverse().join("/")}</div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-foreground/50">{p.responsavel?.full_name ?? "Sem responsável"}</span>
                      <span
                        className={cn("shrink-0 rounded-full px-2 py-0.5 font-medium", STATUS_PILL_CLASSES[STATUS_TONES[status]])}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </div>
                    {podeEditar && <ConcluirEtapaButton faseId={fase.id} processoId={p.id} hoje={hoje} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
