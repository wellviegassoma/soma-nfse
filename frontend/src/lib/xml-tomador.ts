// Extrai os dados do tomador de um XML de DPS/NFS-e já emitida (padrão
// nacional, xmlns "http://www.sped.fazenda.gov.br/nfse") — usado pra
// importar tomadores em lote a partir de notas emitidas fora do
// soma-nfse. Extração por regex sobre o texto cru, mesma técnica já
// usada no motor legado (nfse_client.py) pra ler campos de um XML de
// NFS-e sem depender de um parser XML completo — funciona tanto num
// arquivo de DPS isolado quanto numa NFS-e completa, já que <toma>
// aparece uma vez só em ambos os casos.

export type TomadorExtraido = {
  tipo: "PF" | "PJ";
  cpfCnpj: string;
  nome: string;
  email?: string;
  zipCode?: string;
  address?: string;
  number?: string;
  complement?: string;
  district?: string;
};

function extrairBloco(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function extrairTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? m[1].trim() : undefined;
}

export function extrairTomadorDeXml(xml: string): TomadorExtraido | null {
  const toma = extrairBloco(xml, "toma");
  if (!toma) return null;

  const cnpj = extrairTag(toma, "CNPJ");
  const cpf = extrairTag(toma, "CPF");
  const cpfCnpj = (cnpj || cpf || "").replace(/\D/g, "");
  const nome = extrairTag(toma, "xNome");
  if (!cpfCnpj || !nome) return null;

  const end = extrairBloco(toma, "end");
  const endNac = end ? extrairBloco(end, "endNac") : null;

  return {
    tipo: cnpj ? "PJ" : "PF",
    cpfCnpj,
    nome,
    email: extrairTag(toma, "email"),
    zipCode: endNac ? extrairTag(endNac, "CEP") : undefined,
    address: end ? extrairTag(end, "xLgr") : undefined,
    number: end ? extrairTag(end, "nro") : undefined,
    complement: end ? extrairTag(end, "xCpl") : undefined,
    district: end ? extrairTag(end, "xBairro") : undefined,
  };
}
