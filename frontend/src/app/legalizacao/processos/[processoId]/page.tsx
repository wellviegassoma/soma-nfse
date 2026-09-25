import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarResponsaveisLegalizacao } from "@/lib/actions/legalizacao-processos";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES } from "@/lib/formatters";
import {
  STATUS_LABELS,
  STATUS_TONES,
  TIPO_PROCESSO_LABELS,
  andamento,
  hojeSaoPaulo,
  statusEfetivoProcesso,
  type FaseParaStatus,
} from "@/app/legalizacao/processos/status";
import { EditarProcessoForm } from "./EditarProcessoForm";
import { FasesSection } from "./FasesSection";
import { AnexoSection } from "./AnexoSection";
import { AtividadeSection } from "./AtividadeSection";
import { ArquivarExcluirProcesso } from "./ArquivarExcluirProcesso";
import { InativarEmpresaCard } from "./InativarEmpresaCard";

export const metadata = { title: "Processo — Legalização" };

export default async function ProcessoDetailPage(
  props: PageProps<"/legalizacao/processos/[processoId]">,
) {
  const { processoId } = await props.params;
  await requirePermissao("legalizacao.ver");
  const podeEditar = await temPermissao("legalizacao.editar");

  const supabase = await createClient();
  const [
    { data: processo },
    { data: fases, error: fasesError },
    { data: anexos },
    { data: atividades },
    { data: historico },
    responsaveis,
  ] = await Promise.all([
    supabase
      .from("legalizacao_processos")
      .select(
        "id, tipo_processo, nome, fluxo_nome, company_id, cnpj, data_inicio, prazo_final, data_conclusao, responsavel_id, detalhes, contato_nome, contato_email, contato_whatsapp, alteracao_itens, arquivado_em, company:companies(id, legal_name, trade_name, ativa)",
      )
      .eq("id", processoId)
      .maybeSingle(),
    supabase
      .from("legalizacao_processo_fases")
      .select(
        "id, nome, ordem, acao, prazo, status_manual, data_conclusao, responsavel_id, responsavel:profiles!legalizacao_processo_fases_responsavel_id_fkey(full_name)",
      )
      .eq("processo_id", processoId)
      .order("ordem", { ascending: true }),
    supabase
      .from("legalizacao_processo_anexos")
      .select("id, nome_arquivo, created_at")
      .eq("processo_id", processoId)
      .order("created_at", { ascending: false }),
    supabase
      .from("legalizacao_processo_atividade")
      .select("id, tipo, corpo, created_at, autor:profiles(full_name)")
      .eq("processo_id", processoId)
      .order("created_at", { ascending: false }),
    supabase
      .from("legalizacao_processo_historico")
      .select("id, fase_nome, campo, de_valor, para_valor, comentario, created_at, user:profiles(full_name)")
      .eq("processo_id", processoId)
      .order("created_at", { ascending: false })
      .limit(50),
    listarResponsaveisLegalizacao(),
  ]);

  if (!processo) notFound();
  if (fasesError) throw fasesError;
  const company = processo.company as unknown as { id: string; legal_name: string; trade_name: string | null; ativa: boolean } | null;

  const fasesTipadas = (fases ?? []).map((f) => ({
    id: f.id,
    nome: f.nome,
    ordem: f.ordem,
    acao: f.acao,
    prazo: f.prazo,
    status_manual: f.status_manual,
    data_conclusao: f.data_conclusao,
    responsavel_id: f.responsavel_id,
    responsavel_nome: (f.responsavel as unknown as { full_name: string } | null)?.full_name ?? null,
  }));

  const hoje = hojeSaoPaulo();
  const status = statusEfetivoProcesso(processo, fasesTipadas as FaseParaStatus[], hoje);
  const progresso = andamento(fasesTipadas);

  const faseCriarEmpresaPendente = fasesTipadas.some((f) => f.acao === "CRIAR_EMPRESA" && !f.data_conclusao);
  const mostrarCadastrarEmpresa = processo.tipo_processo === "ABERTURA" && !processo.company_id && faseCriarEmpresaPendente;
  const mostrarInativarEmpresa =
    processo.tipo_processo === "ENCERRAMENTO" && Boolean(processo.data_conclusao) && company?.ativa;

  return (
    <div className="flex flex-col gap-6">
      {processo.arquivado_em && (
        <Alert tone="warning">Este processo está arquivado — não aparece na lista principal.</Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{processo.nome}</h1>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_PILL_CLASSES[STATUS_TONES[status]])}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-sm text-foreground/60">
            {TIPO_PROCESSO_LABELS[processo.tipo_processo]} · {processo.fluxo_nome} · {progresso}% concluído
          </p>
          {company && (
            <Link href={`/legalizacao/empresas/${company.id}`} className="text-sm font-medium text-brand hover:underline">
              Ver empresa →
            </Link>
          )}
        </div>
        <Link href="/legalizacao/processos" className="text-sm text-foreground/60 hover:underline">
          ← Voltar aos processos
        </Link>
      </div>

      {mostrarCadastrarEmpresa && podeEditar && (
        <Alert tone="warning">
          A última fase deste processo cria a empresa de verdade —{" "}
          <Link href={`/legalizacao/processos/${processo.id}/cadastrar-empresa`} className="underline">
            cadastre a empresa
          </Link>{" "}
          pra poder concluir.
        </Alert>
      )}

      {mostrarInativarEmpresa && company && podeEditar && (
        <InativarEmpresaCard companyId={company.id} processoId={processo.id} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">Dados</h2>
          <EditarProcessoForm processo={processo} responsaveis={responsaveis} podeEditar={podeEditar} />
        </Card>

        <Card className="self-start p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">Anexos</h2>
          <AnexoSection processoId={processo.id} anexos={anexos ?? []} podeEditar={podeEditar} />
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Fases</h2>
        <FasesSection
          processoId={processo.id}
          prazoFinalProcesso={processo.prazo_final}
          fases={fasesTipadas}
          podeEditar={podeEditar}
          responsaveis={responsaveis}
        />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Comentários e atividade</h2>
        <AtividadeSection
          processoId={processo.id}
          atividades={
            (atividades ?? []) as unknown as {
              id: string;
              tipo: string;
              corpo: string | null;
              created_at: string;
              autor: { full_name: string } | null;
            }[]
          }
          podeEditar={podeEditar}
        />
      </Card>

      {historico && historico.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">Histórico</h2>
          <div className="flex flex-col gap-2 text-xs text-foreground/60">
            {historico.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-foreground/80">
                  {(h.user as unknown as { full_name: string } | null)?.full_name ?? "Sistema"}
                </span>
                <span>{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                <span>·</span>
                <span>{h.fase_nome ? `${h.fase_nome} — ` : ""}{h.campo}</span>
                {h.para_valor && <span>→ {h.para_valor}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span />
          <ArquivarExcluirProcesso processoId={processo.id} arquivado={Boolean(processo.arquivado_em)} />
        </div>
      )}
    </div>
  );
}
