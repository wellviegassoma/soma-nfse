// Tradução das recusas da Sefin Nacional (e do motor de emissão) pra uma
// mensagem que quem emite consegue resolver sozinho. Códigos sem tradução
// aqui caem no texto do próprio governo, que já vem em português.

export type ErroEmissaoTraduzido = {
  codigo?: string;
  /** O que aconteceu, em linguagem simples. */
  mensagem: string;
  /** O que fazer pra resolver. */
  acao?: string;
  /** Onde corrigir — o form usa pra mostrar o link certo. */
  onde?: "tomador" | "servico" | "empresa" | "sistema";
};

const TRADUCOES: Record<string, Omit<ErroEmissaoTraduzido, "codigo">> = {
  E0240: {
    mensagem: "O CEP do tomador não existe ou não é da cidade dele.",
    acao: "Abra o cadastro do tomador, confira o CEP e a cidade e emita de novo.",
    onde: "tomador",
  },
  E0206: {
    mensagem: "O CPF do tomador é inválido.",
    acao: "Corrija o CPF no cadastro do tomador.",
    onde: "tomador",
  },
  E0207: {
    mensagem: "O CNPJ do tomador é inválido.",
    acao: "Corrija o CNPJ no cadastro do tomador.",
    onde: "tomador",
  },
  E0314: {
    mensagem: "A prefeitura não reconhece o código municipal do serviço.",
    acao: "Peça pra SOMA conferir o código municipal no cadastro do serviço.",
    onde: "servico",
  },
  E0312: {
    mensagem:
      "A prefeitura não aceitou o código do serviço sem o código municipal (ou com o código municipal errado).",
    acao: "Peça pra SOMA preencher o código municipal no cadastro do serviço (ex.: 401 para Medicina em Petrópolis).",
    onde: "servico",
  },
  E0116: {
    mensagem: "A prefeitura exige a inscrição municipal da empresa na nota.",
    acao: "Peça pra SOMA cadastrar a inscrição municipal em Dados fiscais.",
    onde: "empresa",
  },
  E0120: {
    mensagem: "A prefeitura não usa inscrição municipal na NFS-e nacional, e ela foi enviada.",
    acao: "Peça pra SOMA apagar a inscrição municipal em Dados fiscais.",
    onde: "empresa",
  },
  E0008: {
    mensagem: "O horário da nota ficou à frente do horário do governo.",
    acao: "Espere um minuto e tente de novo.",
    onde: "sistema",
  },
  E1235: {
    mensagem: "A nota foi montada num formato que o governo não aceitou.",
    acao: "Avise a SOMA — é ajuste no sistema, não no seu cadastro.",
    onde: "sistema",
  },
};

function extrair(erro: unknown): { codigo?: string; descricao?: string } {
  if (typeof erro === "string") {
    const m = erro.match(/(E\d{4})\s*:?\s*(.*)/);
    return m ? { codigo: m[1], descricao: m[2] || erro } : { descricao: erro };
  }
  if (erro && typeof erro === "object") {
    const o = erro as Record<string, unknown>;
    const codigo = (o.Codigo ?? o.codigo) as string | undefined;
    const descricao = (o.Descricao ?? o.descricao ?? o.mensagem) as string | undefined;
    return { codigo, descricao };
  }
  return {};
}

export function traduzirErrosSefin(erros: unknown[] | null | undefined): ErroEmissaoTraduzido[] {
  const lista = (erros ?? []).map((erro) => {
    const { codigo, descricao } = extrair(erro);
    const t = codigo ? TRADUCOES[codigo] : undefined;
    if (t) return { codigo, ...t };
    return {
      codigo,
      mensagem: descricao?.trim() || "O governo recusou a nota sem dizer o motivo.",
      acao: "Se não souber o que corrigir, fale com a SOMA.",
    };
  });
  // Mesmo código repetido (ex.: dois campos com o mesmo problema) aparece uma vez só.
  return lista.filter((e, i) => !e.codigo || lista.findIndex((x) => x.codigo === e.codigo) === i);
}

/** Texto único (pra gravar em nfse_errors.user_message). */
export function resumoErros(erros: ErroEmissaoTraduzido[]): string {
  return erros.map((e) => (e.codigo ? `${e.codigo}: ${e.mensagem}` : e.mensagem)).join(" | ");
}
