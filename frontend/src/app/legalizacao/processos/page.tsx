import Link from "next/link";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarResponsaveisLegalizacao } from "@/lib/actions/legalizacao-processos";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  STATUS_LABELS,
  TIPO_PROCESSO_LABELS,
  andamento,
  hojeSaoPaulo,
  statusEfetivoProcesso,
  type FaseParaStatus,
  type StatusEfetivo,
} from "@/app/legalizacao/processos/status";
import { ProcessosTable, type ProcessoLinha } from "./ProcessosTable";

export const metadata = { title: "Processos — Legalização" };

const STATUS_ORDEM: StatusEfetivo[] = [
  "ATRASADA",
  "A_FAZER",
  "AGUARDANDO_DADOS",
  "A_CONFERIR",
  "PARALISADO",
  "CONCLUIDO",
];

export default async function ProcessosPage(
  props: PageProps<"/legalizacao/processos">,
) {
  await requirePermissao("legalizacao.ver");
  const podeEditar = await temPermissao("legalizacao.editar");
  const searchParams = await props.searchParams;

  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const tipo = typeof searchParams.tipo === "string" ? searchParams.tipo : "";
  const responsavelId = typeof searchParams.responsavelId === "string" ? searchParams.responsavelId : "";
  const statusFiltro = typeof searchParams.status === "string" ? searchParams.status : "";
  const dataInicioDe = typeof searchParams.dataInicioDe === "string" ? searchParams.dataInicioDe : "";
  const dataInicioAte = typeof searchParams.dataInicioAte === "string" ? searchParams.dataInicioAte : "";

  const supabase = await createClient();

  let query = supabase
    .from("legalizacao_processos")
    .select(
      "id, tipo_processo, nome, fluxo_nome, company_id, data_inicio, prazo_final, data_conclusao, responsavel:profiles!legalizacao_processos_responsavel_id_fkey(id, full_name)",
    )
    .is("arquivado_em", null)
    .order("prazo_final", { ascending: true, nullsFirst: false });

  if (q) query = query.ilike("nome", `%${q.replace(/[,()]/g, " ").trim()}%`);
  if (tipo) query = query.eq("tipo_processo", tipo);
  if (responsavelId) query = query.eq("responsavel_id", responsavelId);
  if (dataInicioDe) query = query.gte("data_inicio", dataInicioDe);
  if (dataInicioAte) query = query.lte("data_inicio", dataInicioAte);

  const [{ data: processos, error }, responsaveis] = await Promise.all([
    query,
    listarResponsaveisLegalizacao(),
  ]);
  if (error) throw error;

  const ids = (processos ?? []).map((p) => p.id);
  const { data: todasFases, error: fasesError } = ids.length
    ? await supabase
        .from("legalizacao_processo_fases")
        .select(
          "id, processo_id, nome, ordem, acao, responsavel_id, prazo, status_manual, data_conclusao, responsavel:profiles!legalizacao_processo_fases_responsavel_id_fkey(full_name)",
        )
        .in("processo_id", ids)
        .order("ordem", { ascending: true })
    : { data: [] as never[], error: null };
  if (fasesError) throw fasesError;

  const fasesPorProcesso = new Map<string, typeof todasFases>();
  for (const fase of todasFases ?? []) {
    const lista = fasesPorProcesso.get(fase.processo_id) ?? [];
    lista.push(fase);
    fasesPorProcesso.set(fase.processo_id, lista as never[]);
  }

  const hoje = hojeSaoPaulo();
  const linhas: ProcessoLinha[] = (processos ?? []).map((p) => {
    const fases = (fasesPorProcesso.get(p.id) ?? []) as unknown as FaseParaStatus[];
    const status = statusEfetivoProcesso(p, fases, hoje);
    return {
      id: p.id,
      tipo_processo: p.tipo_processo,
      nome: p.nome,
      fluxo_nome: p.fluxo_nome,
      company_id: p.company_id,
      data_inicio: p.data_inicio,
      prazo_final: p.prazo_final,
      data_conclusao: p.data_conclusao,
      responsavel_nome: (p.responsavel as unknown as { full_name: string } | null)?.full_name ?? null,
      status,
      andamento: andamento(fases),
      fases: (fasesPorProcesso.get(p.id) ?? []).map((f) => ({
        id: f.id,
        nome: f.nome,
        ordem: f.ordem,
        acao: f.acao,
        prazo: f.prazo,
        status_manual: f.status_manual,
        data_conclusao: f.data_conclusao,
        responsavel_id: f.responsavel_id,
        responsavel_nome: (f.responsavel as unknown as { full_name: string } | null)?.full_name ?? null,
      })) as ProcessoLinha["fases"],
    };
  });

  const contagemPorStatus = new Map<StatusEfetivo, number>();
  for (const linha of linhas) {
    contagemPorStatus.set(linha.status, (contagemPorStatus.get(linha.status) ?? 0) + 1);
  }

  const linhasFiltradas = statusFiltro ? linhas.filter((l) => l.status === statusFiltro) : linhas;

  const query2 = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tipo) params.set("tipo", tipo);
    if (responsavelId) params.set("responsavelId", responsavelId);
    if (dataInicioDe) params.set("dataInicioDe", dataInicioDe);
    if (dataInicioAte) params.set("dataInicioAte", dataInicioAte);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    return qs ? `/legalizacao/processos?${qs}` : "/legalizacao/processos";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Processos</h1>
          <p className="text-sm text-foreground/60">
            Abertura, alteração contratual e encerramento de empresas — {linhas.length} processo(s) ativo(s).
          </p>
        </div>
        {podeEditar && (
          <Link href="/legalizacao/processos/novo">
            <Button>+ Novo processo</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDEM.map((status) => (
          <Link key={status} href={query2({ status: status === statusFiltro ? "" : status })}>
            <Card
              className={`p-4 transition-colors ${statusFiltro === status ? "border-brand ring-2 ring-brand/20" : "hover:bg-surface-muted"}`}
            >
              <div className="text-2xl font-semibold text-foreground">{contagemPorStatus.get(status) ?? 0}</div>
              <div className="text-xs text-foreground/50">{STATUS_LABELS[status]}</div>
            </Card>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60">Nome</label>
          <Input name="q" defaultValue={q} placeholder="Buscar por nome..." className="w-48" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60">Tipo</label>
          <Select name="tipo" defaultValue={tipo} className="w-48">
            <option value="">Todos</option>
            {Object.entries(TIPO_PROCESSO_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60">Responsável</label>
          <Select name="responsavelId" defaultValue={responsavelId} className="w-48">
            <option value="">Todos</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60">Início de</label>
          <Input name="dataInicioDe" type="date" defaultValue={dataInicioDe} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60">Início até</label>
          <Input name="dataInicioAte" type="date" defaultValue={dataInicioAte} className="w-40" />
        </div>
        {statusFiltro && <input type="hidden" name="status" value={statusFiltro} />}
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {(q || tipo || responsavelId || dataInicioDe || dataInicioAte || statusFiltro) && (
          <Link href="/legalizacao/processos">
            <Button type="button" variant="ghost">
              Limpar
            </Button>
          </Link>
        )}
        <Link href="/legalizacao/processos/arquivados" className="ml-auto text-sm font-medium text-foreground/60 hover:underline">
          Arquivados
        </Link>
      </form>

      <ProcessosTable linhas={linhasFiltradas} podeEditar={podeEditar} responsaveis={responsaveis} />
    </div>
  );
}
