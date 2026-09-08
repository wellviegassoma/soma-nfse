import "server-only";

/**
 * Cliente da API do Nibo Gestão Financeira, usado só na migração.
 *
 * Base e autenticação confirmadas na documentação oficial (nibo.readme.io):
 * https://api.nibo.com.br/empresas/v1/ com header `apitoken`. Toda listagem
 * responde { items: [...], count: n } e pagina por OData ($skip/$top).
 *
 * O token é POR EMPRESA e é credencial: nunca é gravado no banco nem logado.
 * Vem por parâmetro, lido de variável de ambiente na hora de rodar.
 */

const BASE = "https://api.nibo.com.br/empresas/v1";
const PAGINA = 200;

export type RespostaLista<T> = { items: T[]; count: number };

export class NiboError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly recurso: string,
  ) {
    super(message);
    this.name = "NiboError";
  }
}

async function buscarPagina<T>(
  recurso: string,
  apitoken: string,
  skip: number,
): Promise<RespostaLista<T>> {
  const url = `${BASE}/${recurso}?$top=${PAGINA}&$skip=${skip}`;
  const resposta = await fetch(url, {
    headers: { apitoken, Accept: "application/json" },
    cache: "no-store",
  });

  if (!resposta.ok) {
    // O corpo do erro do Nibo às vezes traz o motivo real (token expirado,
    // plano sem API). Sem ele, o diagnóstico vira adivinhação — mas o token
    // nunca entra na mensagem.
    const corpo = await resposta.text().catch(() => "");
    throw new NiboError(
      `Nibo respondeu ${resposta.status} em /${recurso}${corpo ? `: ${corpo.slice(0, 300)}` : ""}`,
      resposta.status,
      recurso,
    );
  }

  return (await resposta.json()) as RespostaLista<T>;
}

/**
 * Lê um recurso inteiro, paginando até acabar.
 *
 * Trava em 200 páginas (40 mil registros por recurso): sem isso, um `count`
 * errado do servidor viraria laço infinito consumindo a API do cliente.
 */
export async function listarTudo<T>(recurso: string, apitoken: string): Promise<T[]> {
  const todos: T[] = [];
  let skip = 0;

  for (let pagina = 0; pagina < 200; pagina++) {
    const { items } = await buscarPagina<T>(recurso, apitoken, skip);
    if (!items?.length) break;
    todos.push(...items);
    if (items.length < PAGINA) break;
    skip += PAGINA;
  }

  return todos;
}

// ---------------------------------------------------------------------------
// Formas devolvidas pela API (só os campos que a migração usa)
// ---------------------------------------------------------------------------

export type NiboConta = {
  id: string;
  name: string;
  openBalance: number | null;
  dateOfOpenBalance: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  bankNumber: number | null;
  type: string | null;
  isArchived: boolean;
};

export type NiboCategoria = {
  id: string;
  name: string;
  type: string | null;
  group: { id: string; name: string } | null;
};

export type NiboCentroCusto = {
  costCenterId?: string;
  id?: string;
  description?: string;
  name?: string;
};

export type NiboContato = {
  id: string;
  name: string;
  type: string | null;
  email: string | null;
  document: { number: string | null; type: string | null } | null;
};

export type NiboAgendamento = {
  scheduleId: string;
  type: string | null;
  dueDate: string | null;
  accrualDate: string | null;
  scheduleDate: string | null;
  value: number;
  isPaid: boolean;
  paidValue: number | null;
  openValue: number | null;
  description?: string | null;
  stakeholder: { id: string; name: string; cpfCnpj: string | null; type: string | null } | null;
  categories: { categoryId: string; categoryName: string; value: number }[] | null;
  costCenters:
    | { costCenterId: string; costCenterDescription: string; percent: number; value: number }[]
    | null;
  hasInstallment: boolean;
  installmentId: string | null;
  hasRecurrence: boolean;
};

export const nibo = {
  contas: (t: string) => listarTudo<NiboConta>("accounts", t),
  categorias: (t: string) => listarTudo<NiboCategoria>("categories", t),
  centrosCusto: (t: string) => listarTudo<NiboCentroCusto>("costcenters", t),
  contatos: (t: string) => listarTudo<NiboContato>("stakeholders", t),
  agendamentos: (t: string) => listarTudo<NiboAgendamento>("schedules", t),
};
