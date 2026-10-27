import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatarCnpj, formatarDataHora, formatarMoeda } from "@/lib/formatters";
import { guiaEmAberto, type GuiaFgts } from "@/lib/fgts-infosimples";
import { ConsultarFgtsLoteButton } from "./ConsultarFgtsLoteButton";

export const metadata = { title: "Central FGTS — Painel SOMA" };

type Consulta = {
  company_id: string;
  consultado_em: string;
  status: "sucesso" | "erro";
  erro: string | null;
  guias: GuiaFgts[];
  qtd_em_aberto: number;
  valor_em_aberto: number;
};

export default async function CentralFgtsPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, codigo_cliente, cnpj")
    .eq("ativa", true)
    .not("cnpj", "is", null)
    .order("legal_name");

  const { data: consultas } = await supabase
    .from("fgts_guias_consultas")
    .select("company_id, consultado_em, status, erro, guias, qtd_em_aberto, valor_em_aberto");
  const consultaPorEmpresa = new Map(((consultas ?? []) as Consulta[]).map((c) => [c.company_id, c]));

  const linhas = (companies ?? []).map((company) => ({
    id: company.id,
    nome: company.codigo_cliente
      ? `#${company.codigo_cliente} ${company.trade_name || company.legal_name}`
      : company.trade_name || company.legal_name,
    cnpj: company.cnpj!,
    consulta: consultaPorEmpresa.get(company.id) ?? null,
  }));

  // Em aberto primeiro, depois erros, depois o resto — é o que precisa de ação.
  const ordem = (l: (typeof linhas)[number]) =>
    l.consulta?.status === "sucesso" && l.consulta.qtd_em_aberto > 0 ? 0 : l.consulta?.status === "erro" ? 1 : 2;
  linhas.sort((a, b) => ordem(a) - ordem(b));

  const comAberto = linhas.filter((l) => l.consulta?.status === "sucesso" && l.consulta.qtd_em_aberto > 0);
  const totalEmAberto = comAberto.reduce((s, l) => s + Number(l.consulta!.valor_em_aberto), 0);
  const comErro = linhas.filter((l) => l.consulta?.status === "erro").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central FGTS</h1>
        <p className="text-sm text-foreground/60">
          Guias do FGTS Digital de todas as empresas com CNPJ, consultadas via Infosimples com o
          certificado da SOMA como procuradora.{" "}
          <Link href="/admin/fechamento" className="underline">
            Voltar pro Fechamento
          </Link>
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-foreground/50">
            Cada consulta é paga (cerca de R$ 0,28). Só aparece guia de cliente que tenha procuração
            pra SOMA no FGTS Digital — sem ela, a consulta volta com erro.
          </p>
          <ConsultarFgtsLoteButton empresas={linhas.map((l) => ({ id: l.id, nome: l.nome }))} />
        </div>
        {(comAberto.length > 0 || comErro > 0) && (
          <p className="mt-3 text-sm">
            <strong>{comAberto.length}</strong> empresa(s) com guia em aberto, total{" "}
            <strong>{formatarMoeda(totalEmAberto)}</strong>
            {comErro > 0 && <> · {comErro} com erro na última consulta</>}.
          </p>
        )}
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa com CNPJ cadastrado.</Alert>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-foreground/50">
                <th className="border-b border-border px-3 py-2 text-left">Nome</th>
                <th className="border-b border-border px-3 py-2 text-left">CNPJ</th>
                <th className="border-b border-border px-3 py-2 text-left">Última consulta</th>
                <th className="border-b border-border px-3 py-2 text-left">Guias em aberto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2">{linha.nome}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground/60">{formatarCnpj(linha.cnpj)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {linha.consulta ? (
                      formatarDataHora(linha.consulta.consultado_em)
                    ) : (
                      <span className="text-foreground/40">nunca consultada</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!linha.consulta ? null : linha.consulta.status === "erro" ? (
                      <span className="text-danger">{linha.consulta.erro}</span>
                    ) : linha.consulta.qtd_em_aberto === 0 ? (
                      <span className="text-foreground/40">
                        nenhuma
                        {linha.consulta.guias.length > 0 &&
                          ` — ${linha.consulta.guias
                            .map(
                              (g) =>
                                `${g.situacao ?? "sem situação"}${g.data_arrecadacao ? ` em ${g.data_arrecadacao}` : ""}${
                                  g.valor_total !== null ? ` (${formatarMoeda(g.valor_total)})` : ""
                                }`,
                            )
                            .join("; ")}`}
                      </span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {linha.consulta.guias.filter(guiaEmAberto).map((g, i) => (
                          <li key={g.numero ?? i}>
                            <strong>{g.valor_total !== null ? formatarMoeda(g.valor_total) : "valor ?"}</strong>
                            {g.data_limite_pagamento && <> · vence {g.data_limite_pagamento}</>}
                            {g.tipo && <> · {g.tipo}</>}
                            {g.situacao && <span className="text-foreground/50"> ({g.situacao})</span>}
                            {g.guia_pdf_url && (
                              <>
                                {" "}
                                <a href={g.guia_pdf_url} target="_blank" className="font-medium text-brand hover:underline">
                                  PDF
                                </a>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
