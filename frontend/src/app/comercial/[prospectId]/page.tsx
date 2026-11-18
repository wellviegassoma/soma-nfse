import Link from "next/link";
import { notFound } from "next/navigation";
import { requireComercialAccess, temPermissao, isSomaStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buscarStatusProcessoLegalizacao,
  buscarDadosNovoCliente,
  buscarNomesEquipeComercial,
} from "@/lib/actions/comercial";
import { MensagemNovoClienteSection } from "./MensagemNovoClienteSection";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ProspectDadosAnexos } from "./ProspectDadosAnexos";
import { ChecklistSection } from "./ChecklistSection";
import { AtividadeSection } from "./AtividadeSection";
import { ArquivarExcluirProspect } from "./ArquivarExcluirProspect";
import { MoverEtapaMenu } from "../MoverEtapaMenu";

export const metadata = { title: "Prospect — Comercial" };

export default async function ProspectDetailPage(
  props: PageProps<"/comercial/[prospectId]">,
) {
  const { prospectId } = await props.params;
  await requireComercialAccess();
  const podeEditar = await temPermissao("comercial.editar");
  const podeConfirmarCliente = podeEditar && (await isSomaStaff());
  const podeVerLegalizacao = await temPermissao("legalizacao.ver");

  const supabase = await createClient();
  const [{ data: prospect }, { data: etapas }, { data: checklist }, { data: anexos }, { data: atividades }] =
    await Promise.all([
      supabase
        .from("comercial_prospects")
        .select(
          "id, nome, tipo_onboarding, pessoa_tipo, especialidade, cidade, origem_lead, indicado_por, regime_tributario, faturamento_medio_estimado, cnpj, cpf, honorario_soma, descricao, abertura_cartorio_jucerja, abertura_capital_social, abertura_divisao_capital, abertura_administrador, abertura_cota_tipo, abertura_cnaes, abertura_opcoes_nome, novo_cliente_inicio_responsabilidade, novo_cliente_funcionarios, novo_cliente_pro_labore, novo_cliente_fase_legalizacao, novo_cliente_obs, legalizacao_processo_id, etapa_id, company_id, arquivado_em, updated_at, etapa:comercial_etapas(id, nome, cor, tipo)",
        )
        .eq("id", prospectId)
        .maybeSingle(),
      supabase
        .from("comercial_etapas")
        .select("id, nome, tipo")
        .eq("ativo", true)
        .neq("tipo", "TERMINAL_GANHO")
        .order("ordem", { ascending: true }),
      supabase
        .from("comercial_prospect_checklist")
        .select("id, categoria_nome, categoria_ordem, item_descricao, item_ordem, concluido")
        .eq("prospect_id", prospectId)
        .order("categoria_ordem", { ascending: true })
        .order("item_ordem", { ascending: true }),
      supabase
        .from("comercial_prospect_anexos")
        .select("id, blob_url, nome_arquivo, created_at")
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("comercial_prospect_atividade")
        .select("id, tipo, corpo, created_at, autor_id, autor:profiles(full_name)")
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }),
    ]);

  if (!prospect) notFound();
  const etapa = prospect.etapa as unknown as { id: string; nome: string; cor: string; tipo: string } | null;
  const statusProcesso = prospect.legalizacao_processo_id
    ? await buscarStatusProcessoLegalizacao(prospect.id)
    : null;
  const mostrarMensagemNovoCliente = etapa?.tipo === "TERMINAL_GANHO" && Boolean(prospect.company_id);
  const dadosNovoCliente = mostrarMensagemNovoCliente ? await buscarDadosNovoCliente(prospect.id) : null;
  const nomesEquipe = await buscarNomesEquipeComercial();
  const atividadesComAutor = (
    (atividades ?? []) as unknown as {
      id: string;
      tipo: string;
      corpo: string | null;
      created_at: string;
      autor_id: string | null;
      autor: { full_name: string } | null;
    }[]
  ).map(({ autor_id, autor, ...a }) => {
    const nome = autor?.full_name ?? (autor_id ? nomesEquipe.get(autor_id) : undefined);
    return { ...a, autor: nome ? { full_name: nome } : null };
  });

  return (
    <div className="flex flex-col gap-6">
      {prospect.arquivado_em && (
        <Alert tone="warning">Este prospect está arquivado — não aparece no quadro.</Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{prospect.nome}</h1>
            {etapa && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: etapa.cor }}
              >
                {etapa.nome}
              </span>
            )}
          </div>
          {prospect.company_id && (
            <Link
              href={`/admin/empresas/${prospect.company_id}`}
              className="text-sm font-medium text-brand hover:underline"
            >
              Já é cliente ativo — ver empresa →
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {podeEditar && etapa && (
            <MoverEtapaMenu prospectId={prospect.id} etapaAtualId={etapa.id} etapas={etapas ?? []} />
          )}
          <Link href="/comercial" className="text-sm text-foreground/60 hover:underline">
            ← Voltar ao quadro
          </Link>
        </div>
      </div>

      {mostrarMensagemNovoCliente && (
        <Card id="mensagem-novo-cliente" className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">
            Mensagem de novo cliente — grupo da equipe
          </h2>
          <MensagemNovoClienteSection
            key={prospect.updated_at}
            prospect={prospect}
            empresa={dadosNovoCliente}
            podeEditar={podeEditar}
          />
        </Card>
      )}

      {/* key={updated_at}: depois de um submit bem-sucedido, o React reseta
          sozinho o <form> pro estado inicial (comportamento automático de
          formulários com Server Action) — isso zera visualmente o select de
          Tipo do caso e os campos não controlados de "Dados para o contrato
          social", mesmo já salvos certo no banco. Forçar o remount aqui faz
          o formulário reaparecer com os valores recém-salvos em vez de em
          branco, e evita que um segundo "Salvar" clicado por engano apague
          tudo de verdade. */}
      <ProspectDadosAnexos
        key={prospect.updated_at}
        prospect={prospect}
        anexos={anexos ?? []}
        podeEditar={podeEditar}
        statusProcesso={statusProcesso}
        podeVerLegalizacao={podeVerLegalizacao}
      />

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Checklist</h2>
        <ChecklistSection prospectId={prospect.id} itens={checklist ?? []} podeEditar={podeEditar} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Comentários e atividade</h2>
        <AtividadeSection
          prospectId={prospect.id}
          atividades={atividadesComAutor}
          podeEditar={podeEditar}
        />
      </Card>

      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {etapa?.tipo !== "TERMINAL_GANHO" && !prospect.company_id ? (
            podeConfirmarCliente ? (
              <Link href={`/comercial/${prospect.id}/confirmar-cliente`}>
                <Button variant="secondary">✓ Virar Cliente Ativo…</Button>
              </Link>
            ) : (
              <div className="flex flex-col gap-1">
                <Button variant="secondary" disabled>
                  ✓ Virar Cliente Ativo…
                </Button>
                <span className="text-xs text-foreground/50">Fica com a equipe da SOMA (cria a empresa no sistema).</span>
              </div>
            )
          ) : (
            <span />
          )}
          <ArquivarExcluirProspect prospectId={prospect.id} arquivado={Boolean(prospect.arquivado_em)} />
        </div>
      )}
    </div>
  );
}
