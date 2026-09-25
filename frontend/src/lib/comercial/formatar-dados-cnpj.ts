import type { DadosCnpj } from "@/lib/cnpj-lookup";

const MARCADOR_INICIO = "--- Dados da Receita Federal (CNPJ) ---";
const MARCADOR_FIM = "--- Fim dos dados da Receita Federal ---";

/** Bloco de texto com tudo que a Receita devolveu — usado porque o prospect
 * ainda não tem colunas próprias pra CNAE/endereço/situação cadastral
 * (só a empresa de verdade tem, criada em confirmarClienteAtivo). */
export function formatarBlocoCnpj(dados: DadosCnpj): string {
  const linhas = [
    MARCADOR_INICIO,
    `Razão social: ${dados.razaoSocial}`,
    dados.nomeFantasia && `Nome fantasia: ${dados.nomeFantasia}`,
    dados.cnae && `CNAE: ${dados.cnae}${dados.cnaeDescricao ? ` - ${dados.cnaeDescricao}` : ""}`,
    dados.situacaoCadastral && `Situação cadastral: ${dados.situacaoCadastral}`,
    dados.dataAbertura && `Data de abertura: ${dados.dataAbertura}`,
    [dados.logradouro, dados.numero].filter(Boolean).join(", ") || null,
    [dados.bairro, dados.municipio && dados.uf ? `${dados.municipio}/${dados.uf}` : dados.municipio, dados.cep]
      .filter(Boolean)
      .join(" - ") || null,
    `Simples Nacional: ${dados.simplesNacional ? "Sim" : "Não"}`,
    MARCADOR_FIM,
  ].filter((linha): linha is string => Boolean(linha));
  return linhas.join("\n");
}

/** Troca um bloco anterior (se já tinha buscado antes) em vez de acumular
 * duplicado a cada clique em "Buscar CNPJ". */
export function inserirBlocoCnpj(descricaoAtual: string, blocoNovo: string): string {
  const regexBlocoAntigo = new RegExp(
    `${MARCADOR_INICIO}[\\s\\S]*?${MARCADOR_FIM}\\n?`,
    "g",
  );
  const semBlocoAntigo = descricaoAtual.replace(regexBlocoAntigo, "").trimEnd();
  return semBlocoAntigo ? `${semBlocoAntigo}\n\n${blocoNovo}` : blocoNovo;
}
