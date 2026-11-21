import { requireLegalizacaoAccess } from "@/lib/auth";
import { SITUACAO_LABELS } from "@/lib/legalizacao-licencas";
import { carregarPainelLicencas, lerParametros } from "@/lib/legalizacao-painel";
import { formatarCpfCnpj } from "@/lib/formatters";
import { hojeSaoPaulo } from "@/app/legalizacao/processos/status";

// CSV do painel de licenças com os mesmos filtros da tela (separador ";" e
// BOM UTF-8 pro Excel abrir com acento certo).
export async function GET(request: Request) {
  await requireLegalizacaoAccess();
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { linhas } = await carregarPainelLicencas(lerParametros(sp));

  const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const cel = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = ["Código", "Cliente", "CNPJ/CPF", "Município", "Tipo", "Número", "Órgão", "Emissão", "Vencimento", "Dias para vencer", "Situação", "Etapa da renovação", "Responsável", "Protocolo"];
  const corpo = linhas.map((l) =>
    [
      l.codigoCliente,
      l.empresa,
      formatarCpfCnpj(l.documento),
      l.municipio,
      l.tipo,
      l.numero,
      l.orgao,
      br(l.dataEmissao),
      br(l.dataVencimento),
      l.dias,
      SITUACAO_LABELS[l.situacao],
      l.renovacao?.etapa ?? null,
      l.renovacao?.responsavel ?? null,
      l.renovacao?.protocolo ?? null,
    ]
      .map(cel)
      .join(";"),
  );
  const csv = "﻿" + [cabecalho.join(";"), ...corpo].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="licencas-${hojeSaoPaulo()}.csv"`,
    },
  });
}
