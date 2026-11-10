// Inclui no fechamento (notas_distribuidas, origem "emitido_sistema") as
// notas emitidas pelo próprio sistema que ainda não chegaram pela
// sincronização do ADN. Mesmo leitor de XML do frontend.
//
// Uso (de soma-nfse/frontend, com .env.local carregado):
//   node --experimental-strip-types ../scripts/tabelas-servico/incluir_emitidas_no_fechamento.mts [--executar]
import { extrairNotaDeXml } from "../../frontend/src/lib/xml-nota.ts";
import { classificarDirecao } from "../../frontend/src/lib/notas-distribuidas.ts";

const U = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/";
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const h = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" };
const executar = process.argv.includes("--executar");

const nfse = (await (await fetch(U + "nfse?select=company_id,access_key,status,xml_nfse&access_key=not.is.null&limit=1000", { headers: h })).json()) as {
  company_id: string; access_key: string; status: string; xml_nfse: string | null;
}[];
let incluidas = 0;
for (const n of nfse) {
  const ja = await (await fetch(U + `notas_distribuidas?select=id&company_id=eq.${n.company_id}&chave_acesso=eq.${n.access_key}`, { headers: h })).json();
  if (ja.length || !n.xml_nfse) continue;
  const nota = extrairNotaDeXml(n.xml_nfse);
  const [empresa] = await (await fetch(U + `companies?select=codigo_cliente,cnpj,cpf&id=eq.${n.company_id}`, { headers: h })).json();
  if (!nota) { console.log("XML não reconhecido", n.access_key); continue; }
  const documento = (empresa.cnpj || empresa.cpf || "").replace(/\D/g, "");
  const linha = {
    company_id: n.company_id, nsu: null, origem: "emitido_sistema", chave_acesso: nota.chaveAcesso ?? n.access_key,
    direcao: classificarDirecao(nota.prestadorCnpj, nota.tomadorCnpj, documento),
    cancelada: n.status === "CANCELADA", motivo_cancelamento: null, numero: nota.numero,
    data_emissao: nota.dataEmissao, competencia: nota.competencia, bate_competencia: true,
    prestador_cnpj: nota.prestadorCnpj, prestador_nome: nota.prestadorNome, tomador_cnpj: nota.tomadorCnpj,
    tomador_nome: nota.tomadorNome, descricao_servico: nota.descricaoServico, local_incidencia: nota.localIncidencia,
    codigo_trib_nacional: nota.codigoTribNacional, codigo_nbs: nota.codigoNbs, aliquota_issqn: nota.aliquotaIssqn,
    valor_servico: nota.valorServico, valor_issqn: nota.valorIssqn, valor_pis: nota.valorPis, valor_cofins: nota.valorCofins,
    valor_ret_cp: nota.valorRetCp, valor_ret_irrf: nota.valorRetIrrf, valor_ret_csll: nota.valorRetCsll, xml: nota.xml,
  };
  console.log(`${empresa.codigo_cliente} nota ${nota.numero} ${nota.competencia} R$ ${nota.valorServico} ${linha.direcao}${linha.cancelada ? " (cancelada)" : ""}`);
  if (executar) {
    const r = await fetch(U + "notas_distribuidas", { method: "POST", headers: h, body: JSON.stringify(linha) });
    if (!r.ok) console.log("   erro", r.status, await r.text());
    else incluidas++;
  }
}
console.log(executar ? `incluídas: ${incluidas}` : "simulação (use --executar para gravar)");
