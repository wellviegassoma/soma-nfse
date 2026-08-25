// Extrai os campos de uma nota (NFS-e completa ou DPS) de XML já
// disponível — usado no Fechamento Importado, quando o usuário sobe
// manualmente XMLs baixados por fora (ex.: pela própria aplicação
// Python dele) em vez de depender só da sincronização automática pela
// API de distribuição do Sefin Nacional. Mesma técnica de extração por
// regex do motor legado (nfse_client.py:_extrair_campos_relatorio) —
// tolerante a variação de onde exatamente a tag aparece, mas sempre
// dentro do bloco certo (nunca cai pra busca global, pra não pegar o
// CNPJ do prestador quando procura o do tomador, por exemplo).

function extrairBloco(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function extrairTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? m[1].trim() : undefined;
}

function extrairNumero(xml: string, tag: string): number | undefined {
  const v = extrairTag(xml, tag);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function extrairChaveAcesso(xml: string): string | null {
  // Id="NFS<chave>" no elemento infNFSe.
  const m = xml.match(/<infNFSe\s+Id="NFS([^"]+)"/);
  return m ? m[1] : null;
}

export type NotaExtraidaXml = {
  chaveAcesso: string | null;
  numero: string | undefined;
  dataEmissao: string | undefined;
  competencia: string | undefined;
  prestadorCnpj: string | undefined;
  prestadorNome: string | undefined;
  tomadorCnpj: string | undefined;
  tomadorNome: string | undefined;
  descricaoServico: string | undefined;
  localIncidencia: string | undefined;
  codigoTribNacional: string | undefined;
  codigoNbs: string | undefined;
  aliquotaIssqn: number | undefined;
  valorServico: number | undefined;
  valorIssqn: number | undefined;
  valorPis: number | undefined;
  valorCofins: number | undefined;
  valorRetCp: number | undefined;
  valorRetIrrf: number | undefined;
  xml: string;
};

export function extrairNotaDeXml(xml: string): NotaExtraidaXml | null {
  // Precisa ao menos parecer uma NFS-e/DPS válida — senão não tem o que
  // extrair (arquivo errado, XML de outra coisa, etc).
  if (!xml.includes("infDPS") && !xml.includes("infNFSe")) return null;

  const prest = extrairBloco(xml, "prest");
  const emit = extrairBloco(xml, "emit");
  const toma = extrairBloco(xml, "toma");

  const cnpjPrest =
    (prest && extrairTag(prest, "CNPJ")) || (emit && extrairTag(emit, "CNPJ"));
  const nomePrest =
    (prest && extrairTag(prest, "xNome")) || (emit && extrairTag(emit, "xNome")) || undefined;
  const cnpjToma = toma ? extrairTag(toma, "CNPJ") : undefined;
  const nomeToma = toma ? extrairTag(toma, "xNome") : undefined;

  const numero = extrairTag(xml, "nNFSe") ?? extrairTag(xml, "Numero");
  const dataEmissao = extrairTag(xml, "dhEmi") ?? extrairTag(xml, "dhProc");
  const competencia = extrairTag(xml, "dCompet");

  if (!cnpjPrest && !cnpjToma) return null; // não conseguiu identificar nenhum dos lados

  return {
    chaveAcesso: extrairChaveAcesso(xml),
    numero,
    dataEmissao,
    competencia,
    prestadorCnpj: cnpjPrest ? cnpjPrest.replace(/\D/g, "") : undefined,
    prestadorNome: nomePrest,
    tomadorCnpj: cnpjToma ? cnpjToma.replace(/\D/g, "") : undefined,
    tomadorNome: nomeToma,
    descricaoServico: extrairTag(xml, "xDescServ"),
    localIncidencia: extrairTag(xml, "xLocIncid") ?? extrairTag(xml, "xMunIncid"),
    codigoTribNacional: extrairTag(xml, "cTribNac"),
    codigoNbs: extrairTag(xml, "cNBS"),
    aliquotaIssqn: extrairNumero(xml, "pAliqAplic") ?? extrairNumero(xml, "pAliq"),
    valorServico: extrairNumero(xml, "vServ") ?? extrairNumero(xml, "vServPrest"),
    valorIssqn: extrairNumero(xml, "vISSQN") ?? extrairNumero(xml, "vIssqn"),
    valorPis: extrairNumero(xml, "vPis"),
    valorCofins: extrairNumero(xml, "vCofins"),
    valorRetCp: extrairNumero(xml, "vRetCP"),
    valorRetIrrf: extrairNumero(xml, "vRetIRRF"),
    xml,
  };
}
