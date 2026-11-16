import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Selo, STATUS_PEDIDO, FONTE_EMPRESA } from "../status";
import { EscolherEmpresa, AcoesPedido } from "./AcoesPedido";
import { ItemRascunho, type ItemView } from "./ItemRascunho";

export const metadata = { title: "Pedido de nota — Painel SOMA" };

type Mensagem = { id: string; timestamp: string; tipo: string; texto: string | null; anexo_index: number | null };
type Anexo = { nome: string | null; mimetype: string | null };

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function PedidoNotaPage(props: { params: Promise<{ pedidoId: string }> }) {
  await requirePermissao("notas.emitir");
  const { pedidoId } = await props.params;
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("pedidos_nota")
    .select(
      "id, created_at, status, contato_nome, contato_eh_grupo, company_id, empresa_fonte, companies_candidatas, dica_atendente, mensagens, anexos, erro, ia_modelo, ia_custo_usd, company:companies(legal_name, trade_name)",
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido) notFound();

  const companyId = pedido.company_id as string | null;
  const empresa = Array.isArray(pedido.company) ? pedido.company[0] : pedido.company;

  const [itensRes, servicosRes, tomadoresRes, empresasRes] = await Promise.all([
    supabase
      .from("pedido_nota_itens")
      .select("id, ordem, status, customer_id, tomador_documento, tomador_nome, service_id, valor, descricao, competencia, iss_retido, confianca, alertas, pergunta_ao_cliente, erro, dps_id")
      .eq("pedido_id", pedidoId)
      .order("ordem"),
    companyId
      ? supabase.from("services").select("id, name").eq("company_id", companyId).eq("active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    companyId
      ? supabase.from("customers").select("id, name, cpf_cnpj").eq("company_id", companyId).order("name").limit(2000)
      : Promise.resolve({ data: [] as { id: string; name: string; cpf_cnpj: string | null }[] }),
    !companyId || pedido.status === "ERRO" || pedido.status === "RECEBIDO"
      ? supabase.from("companies").select("id, legal_name, trade_name, codigo_cliente, cnpj, cpf").eq("ativa", true).order("legal_name")
      : Promise.resolve({ data: [] }),
  ]);

  const itens = (itensRes.data ?? []) as ItemView[];
  const mensagens = (pedido.mensagens ?? []) as Mensagem[];
  const anexos = (pedido.anexos ?? []) as Anexo[];
  const candidatas = new Set((pedido.companies_candidatas ?? []) as string[]);
  const empresas = ((empresasRes.data ?? []) as { id: string; legal_name: string; trade_name: string | null; codigo_cliente: string | null; cnpj: string | null; cpf: string | null }[])
    .map((c) => ({
      id: c.id,
      nome: `${c.codigo_cliente ? `#${c.codigo_cliente} ` : ""}${c.trade_name || c.legal_name}${c.cnpj ? ` · ${c.cnpj}` : c.cpf ? ` · CPF ${c.cpf}` : ""}`,
      candidata: candidatas.has(c.id),
    }))
    .sort((a, b) => Number(b.candidata) - Number(a.candidata));

  const aberto = ["RECEBIDO", "ERRO", "AGUARDANDO_APROVACAO", "PARCIAL"].includes(pedido.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/pedidos-nota" className="text-sm text-foreground/55 hover:text-foreground">
            ← Pedidos de nota
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {pedido.contato_nome ?? "Contato"}
            {pedido.contato_eh_grupo ? <span className="ml-2 text-sm font-normal text-foreground/50">(grupo)</span> : null}
          </h1>
          <p className="text-sm text-foreground/60">
            {hora(pedido.created_at)} ·{" "}
            {empresa ? (
              <>
                <Link href={`/empresas/${companyId}`} className="text-brand hover:underline">
                  {empresa.trade_name || empresa.legal_name}
                </Link>
                {pedido.empresa_fonte ? ` (${FONTE_EMPRESA[pedido.empresa_fonte]})` : ""}
              </>
            ) : (
              "empresa não identificada"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Selo s={pedido.status} mapa={STATUS_PEDIDO} />
          {aberto ? <AcoesPedido pedidoId={pedidoId} podeReler={Boolean(companyId)} /> : null}
        </div>
      </div>

      {pedido.erro ? <Alert tone="warning">{pedido.erro}</Alert> : null}

      {aberto && (!companyId || pedido.status === "RECEBIDO" || pedido.status === "ERRO") && empresas.length ? (
        <Card className="p-5">
          <EscolherEmpresa pedidoId={pedidoId} empresas={empresas} atual={companyId} />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">Mensagens do cliente</h2>
          {mensagens.length ? (
            mensagens.map((m) => {
              const a = m.anexo_index != null ? anexos[m.anexo_index] : null;
              const url = m.anexo_index != null ? `/api/pedidos-nota/${pedidoId}/anexos/${m.anexo_index}` : null;
              const mime = a?.mimetype ?? "";
              return (
                <div key={m.id} className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
                  <div className="text-xs text-foreground/50">{hora(m.timestamp)}</div>
                  {m.texto ? <p className="whitespace-pre-wrap text-foreground">{m.texto}</p> : null}
                  {url && mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a?.nome ?? "imagem do cliente"} className="mt-2 max-h-80 rounded-md" />
                  ) : null}
                  {url && mime.startsWith("audio/") ? <audio controls src={url} className="mt-2 w-full" /> : null}
                  {url && !mime.startsWith("image/") && !mime.startsWith("audio/") ? (
                    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-brand hover:underline">
                      📎 {a?.nome ?? "anexo"}
                    </a>
                  ) : null}
                  {m.anexo_index == null && m.tipo !== "chat" ? (
                    <p className="text-xs text-foreground/50">({m.tipo} não copiado)</p>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-foreground/60">Nenhuma mensagem capturada.</p>
          )}
          {pedido.dica_atendente ? (
            <p className="text-xs text-foreground/60">
              Dica do atendente: <span className="font-medium text-foreground">{pedido.dica_atendente}</span>
            </p>
          ) : null}
          {pedido.ia_modelo ? (
            <p className="text-xs text-foreground/40">
              Lido por {pedido.ia_modelo}
              {pedido.ia_custo_usd != null ? ` · US$ ${Number(pedido.ia_custo_usd).toFixed(3)}` : ""}
            </p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-4">
          {itens.length ? (
            itens.map((it) => (
              <ItemRascunho
                key={it.id}
                item={it}
                companyId={companyId}
                servicos={(servicosRes.data ?? []).map((s) => ({ id: s.id as string, nome: s.name as string }))}
                tomadores={(tomadoresRes.data ?? []).map((t) => ({
                  id: t.id as string,
                  nome: `${t.name}${t.cpf_cnpj ? ` · ${t.cpf_cnpj}` : ""}`,
                }))}
              />
            ))
          ) : (
            <Card className="p-5 text-sm text-foreground/60">
              {companyId ? "Nenhum rascunho. Use “Ler de novo” ou descarte o pedido." : "Escolha a empresa para a IA montar o rascunho."}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
