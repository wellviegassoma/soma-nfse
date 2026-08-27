import "server-only";

export type AnaliseDocumentoLegalizacao = {
  dataVencimentoSugerida: string | null; // "YYYY-MM-DD"
  cnpjEncontrado: string | null; // só os dígitos
};

const PALAVRAS_CHAVE_VENCIMENTO =
  /(validade|v[aá]lid[ao]\s+at[ée]|vencimento|vence\s+em|expira)/i;

// Documento de legalização não tem um layout fixo (varia por município e
// tipo, diferente do PGDAS-D que é sempre gerado pela Receita) — então
// isso é uma sugestão por aproximação de texto, não uma extração
// garantida. Só funciona em PDF com camada de texto real; documento
// escaneado/fotografado sem OCR não tem texto nenhum pra procurar, e
// nesse caso a função simplesmente não encontra nada (sem erro).
//
// Estratégia: acha toda data no formato dd/mm/aaaa (ou com hífen) no
// texto e usa a primeira que aparecer logo depois de uma palavra-chave
// de vencimento/validade nas ~60 posições anteriores — evita pegar a
// data de emissão do documento por engano, que costuma vir sem essas
// palavras por perto.
export function extrairDataValidade(texto: string): string | null {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const regexData = /(\d{2})[/-](\d{2})[/-](\d{4})/g;
  let match: RegExpExecArray | null;
  while ((match = regexData.exec(normalizado))) {
    const janelaAntes = normalizado.slice(Math.max(0, match.index - 60), match.index);
    if (PALAVRAS_CHAVE_VENCIMENTO.test(janelaAntes)) {
      const [, dia, mes, ano] = match;
      const data = `${ano}-${mes}-${dia}`;
      // Descarta data claramente inválida (mês/dia fora do range) —
      // mais seguro não sugerir nada do que sugerir uma data quebrada.
      if (Number(mes) >= 1 && Number(mes) <= 12 && Number(dia) >= 1 && Number(dia) <= 31) {
        return data;
      }
    }
  }
  return null;
}

export function extrairCnpj(texto: string): string | null {
  const match = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  if (!match) return null;
  const digitos = match[0].replace(/\D/g, "");
  return digitos.length === 14 ? digitos : null;
}

export function analisarTextoDocumento(texto: string): AnaliseDocumentoLegalizacao {
  return {
    dataVencimentoSugerida: extrairDataValidade(texto),
    cnpjEncontrado: extrairCnpj(texto),
  };
}
