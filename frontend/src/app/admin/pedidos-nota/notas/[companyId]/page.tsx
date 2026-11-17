import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CopiarTexto } from "./CopiarTexto";

export const metadata = { title: "Notas emitidas — consulta" };

// Consulta rápida das notas já emitidas pela empresa, aberta em outra aba a
// partir do painel de pedidos de nota (para pegar descrição, valor, tomador
// de notas anteriores sem sair do pedido). Junta as notas sincronizadas do
// ADN (notas_distribuidas, saída — inclui as emitidas fora do SOMA Gestão)
// com as emitidas aqui que ainda não sincronizaram.

type Linha = {
  chave: string | null;
  data: string | null;
  numero: string | null;
  tomador: string | null;
  tomadorDoc: string | null;
  valor: number;
  descricao: string;
  cancelada: boolean;
  origem: "sistema" | "outro emissor";
  /** Onde abrir o PDF (DANFSe). */
  pdf: string | null;
};

const LIMITE = 300;

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default async function NotasEmitidasConsulta(props: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermissao("notas.emitir");
  const { companyId } = await props.params;
  const { q } = await props.searchParams;
  const supabase = await createClient();

  const [empresaRes, distRes, dpsRes] = await Promise.all([
    supabase.from("companies").select("legal_name, trade_name").eq("id", companyId).maybeSingle(),
    supabase
      .from("notas_distribuidas")
      .select("id, chave_acesso, numero, data_emissao, tomador_nome, tomador_cnpj, valor_servico, descricao_servico, cancelada")
      .eq("company_id", companyId)
      .eq("direcao", "saida")
      .order("data_emissao", { ascending: false })
      .limit(LIMITE),
    supabase
      .from("dps")
      .select("id, valor, descricao, created_at, customer:customers(name, cpf_cnpj), nfse(access_key, status)")
      .eq("company_id", companyId)
      .eq("status", "ACCEPTED")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  if (!empresaRes.data) notFound();
  const empresa = empresaRes.data;

  const dist = (distRes.data ?? []) as Record<string, unknown>[];
  const chavesSistema = new Set(
    (dpsRes.data ?? []).map((d) => (Array.isArray(d.nfse) ? d.nfse[0] : d.nfse)?.access_key as string | null).filter(Boolean),
  );

  const linhas: Linha[] = dist.map((n) => ({
    chave: (n.chave_acesso as string | null) ?? null,
    data: (n.data_emissao as string | null) ?? null,
    numero: (n.numero as string | null) ?? null,
    tomador: (n.tomador_nome as string | null) ?? null,
    tomadorDoc: (n.tomador_cnpj as string | null) ?? null,
    valor: Number(n.valor_servico ?? 0),
    descricao: (n.descricao_servico as string | null) ?? "",
    cancelada: Boolean(n.cancelada),
    origem: chavesSistema.has(n.chave_acesso as string) ? "sistema" : "outro emissor",
    // DANFSe gerado do XML já sincronizado (mesma rota do Fechamento).
    pdf: `/admin/empresas/${companyId}/fechamento/notas/${n.id as string}/pdf`,
  }));
  const chaves = new Set(linhas.map((l) => l.chave).filter(Boolean));
  for (const d of dpsRes.data ?? []) {
    const nfse = Array.isArray(d.nfse) ? d.nfse[0] : d.nfse;
    const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
    const chave = (nfse?.access_key as string | null) ?? null;
    if (chave && chaves.has(chave)) continue;
    linhas.push({
      chave,
      data: d.created_at as string,
      numero: null,
      tomador: (cust?.name as string | null) ?? null,
      tomadorDoc: (cust?.cpf_cnpj as string | null) ?? null,
      valor: Number(d.valor),
      descricao: (d.descricao as string | null) ?? "",
      cancelada: nfse?.status === "CANCELADA",
      origem: "sistema",
      // Ainda não sincronizada: tela da nota em Emissão de Notas (tem o PDF).
      pdf: `/admin/emissao-notas/${companyId}/notas/${d.id as string}`,
    });
  }
  linhas.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

  const termo = normalizar((q ?? "").trim());
  const filtradas = termo
    ? linhas.filter((l) => normalizar(`${l.tomador ?? ""} ${l.tomadorDoc ?? ""} ${l.descricao} ${l.numero ?? ""}`).includes(termo))
    : linhas;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notas emitidas — {empresa.trade_name || empresa.legal_name}</h1>
        <p className="text-sm text-foreground/60">
          Últimas {LIMITE} notas de saída (emitidas aqui e em outros emissores, sincronizadas do ADN). Clique em “Copiar” para usar a
          descrição no pedido.
        </p>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por tomador, CPF/CNPJ, descrição ou número"
          className="h-10 w-full max-w-xl rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        />
        <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground">
          Buscar
        </button>
      </form>

      <Card className="overflow-x-auto p-0">
        {!filtradas.length ? (
          <p className="p-6 text-sm text-foreground/60">{linhas.length ? "Nenhuma nota com esse termo." : "Nenhuma nota emitida encontrada."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-foreground/50">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Tomador</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l, i) => (
                <tr key={l.chave ?? i} className={`border-b border-border align-top last:border-0 ${l.cancelada ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2">{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {l.numero ?? "—"}
                    {l.cancelada ? <span className="block text-xs text-danger">cancelada</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {l.tomador ?? "—"}
                    {l.tomadorDoc ? <span className="block text-xs text-foreground/50">{l.tomadorDoc}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="whitespace-pre-wrap">{l.descricao || "—"}</span>
                      {l.descricao ? <CopiarTexto texto={l.descricao} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {l.pdf ? (
                      <a
                        href={l.pdf}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-xs text-brand hover:bg-surface-muted"
                      >
                        Abrir PDF
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
