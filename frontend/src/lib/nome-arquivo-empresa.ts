type EmpresaNomeArquivo = {
  codigo_cliente: string | null;
  trade_name: string | null;
  legal_name: string;
};

function limpar(texto: string): string {
  return texto.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

// "036 - LR Pena" — código do cliente + nome fantasia (ou razão social).
export function prefixoArquivoEmpresa(empresa: EmpresaNomeArquivo): string {
  const nome = limpar(empresa.trade_name || empresa.legal_name);
  return empresa.codigo_cliente ? `${empresa.codigo_cliente} - ${nome}` : nome;
}

// "2026-09" -> "09-2026"
export function competenciaParaArquivo(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}-${ano}`;
}

// Content-Disposition com nome acentuado (RFC 5987) + fallback ASCII.
export function contentDispositionInline(nomeArquivo: string): string {
  const ascii = nomeArquivo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`;
}
