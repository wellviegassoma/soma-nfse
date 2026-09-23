// Catálogo de permissões — espelha exatamente as chaves de
// public.permissoes_catalogo (ver supabase/migrations/20260925100000_*).
// Rótulo/descrição ficam só aqui (TS), o banco guarda só o necessário pra
// integridade (chave/escopo/irreversível).

export type Permissao =
  | "usuarios.gerenciar_equipe"
  | "usuarios.gerenciar_clientes"
  | "usuarios_empresa.gerenciar"
  | "configuracoes.editar"
  | "empresas.ver"
  | "empresas.editar"
  | "certificados.ver"
  | "certificados.gerenciar"
  | "cofre_senhas.ver"
  | "cofre_senhas.revelar"
  | "cofre_senhas.editar"
  | "integra_contador.consultar"
  | "integra_contador.emitir_guias"
  | "integra_contador.declarar"
  | "impostos.ver"
  | "impostos.editar"
  | "impostos.emitir_iss"
  | "fechamento.ver"
  | "fechamento.executar"
  | "precificacao.ver"
  | "precificacao.editar"
  | "precificacao.modelos"
  | "auditoria.ver"
  | "chat_ia.usar"
  | "legalizacao.ver"
  | "legalizacao.editar"
  | "extratos.ver"
  | "extratos.editar"
  | "atendimento.atender"
  | "financeiro.ver"
  | "financeiro.editar"
  | "portal.ver"
  | "notas.emitir"
  | "notas.cancelar"
  | "tomadores.editar";

export type EscopoPermissao = "GLOBAL" | "EMPRESA" | "AMBOS";

export type PermissaoInfo = {
  chave: Permissao;
  modulo: string;
  moduloLabel: string;
  label: string;
  descricao: string;
  escopo: EscopoPermissao;
  irreversivel: boolean;
  /** Se marcada, marca automaticamente estas outras também (ex.: editar implica ver). */
  implica?: Permissao[];
};

export const MODULOS_EQUIPE = [
  "usuarios",
  "configuracoes",
  "empresas",
  "certificados",
  "cofre_senhas",
  "integra_contador",
  "impostos",
  "fechamento",
  "precificacao",
  "auditoria",
  "chat_ia",
  "legalizacao",
  "extratos",
  "atendimento",
  "financeiro",
] as const;

export const MODULO_LABELS: Record<string, string> = {
  usuarios: "Usuários",
  configuracoes: "Configurações",
  empresas: "Empresas",
  certificados: "Certificados",
  cofre_senhas: "Cofre de senhas",
  integra_contador: "Integra Contador",
  impostos: "Impostos",
  fechamento: "Fechamento / Automação",
  precificacao: "Precificação",
  auditoria: "Auditoria / Logs",
  chat_ia: "Chat IA",
  legalizacao: "Legalização",
  extratos: "Extratos",
  atendimento: "Atendimento",
  financeiro: "Financeiro",
  portal: "Portal do cliente",
};

export const PERMISSOES: Record<Permissao, PermissaoInfo> = {
  "usuarios.gerenciar_equipe": {
    chave: "usuarios.gerenciar_equipe",
    modulo: "usuarios",
    moduloLabel: "Usuários",
    label: "Gerenciar equipe SOMA",
    descricao: "Criar, editar e definir permissões de membros da equipe interna (inclusive outros administradores).",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "usuarios.gerenciar_clientes": {
    chave: "usuarios.gerenciar_clientes",
    modulo: "usuarios",
    moduloLabel: "Usuários",
    label: "Gerenciar usuários de clientes",
    descricao: "Convidar e definir o acesso de usuários das empresas clientes (não dá acesso a permissões internas da SOMA).",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "usuarios_empresa.gerenciar": {
    chave: "usuarios_empresa.gerenciar",
    modulo: "usuarios",
    moduloLabel: "Usuários",
    label: "Gerenciar usuários da empresa",
    descricao: "Convidar e definir o acesso de outros usuários dentro da própria empresa — só pode conceder o que já tem.",
    escopo: "EMPRESA",
    irreversivel: false,
  },
  "configuracoes.editar": {
    chave: "configuracoes.editar",
    modulo: "configuracoes",
    moduloLabel: "Configurações",
    label: "Editar configurações do sistema",
    descricao: "Dados sensíveis compartilhados por todo o sistema, como o contador responsável usado nas declarações do MIT.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "empresas.ver": {
    chave: "empresas.ver",
    modulo: "empresas",
    moduloLabel: "Empresas",
    label: "Ver empresas",
    descricao: "Acessar o painel administrativo e ver os dados cadastrais de qualquer empresa cliente.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "empresas.editar": {
    chave: "empresas.editar",
    modulo: "empresas",
    moduloLabel: "Empresas",
    label: "Editar empresas",
    descricao: "Alterar cadastro, serviços e configurações fiscais de qualquer empresa cliente.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["empresas.ver"],
  },
  "certificados.ver": {
    chave: "certificados.ver",
    modulo: "certificados",
    moduloLabel: "Certificados",
    label: "Ver certificados",
    descricao: "Ver metadados de certificados digitais cadastrados (validade, titular).",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "certificados.gerenciar": {
    chave: "certificados.gerenciar",
    modulo: "certificados",
    moduloLabel: "Certificados",
    label: "Gerenciar certificados",
    descricao: "Fazer upload, substituir e remover certificados digitais.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["certificados.ver"],
  },
  "cofre_senhas.ver": {
    chave: "cofre_senhas.ver",
    modulo: "cofre_senhas",
    moduloLabel: "Cofre de senhas",
    label: "Ver cofre de senhas",
    descricao: "Ver que senhas existem cadastradas (sem revelar o valor).",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "cofre_senhas.revelar": {
    chave: "cofre_senhas.revelar",
    modulo: "cofre_senhas",
    moduloLabel: "Cofre de senhas",
    label: "Revelar senhas",
    descricao: "Ver o valor real das senhas guardadas no cofre.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["cofre_senhas.ver"],
  },
  "cofre_senhas.editar": {
    chave: "cofre_senhas.editar",
    modulo: "cofre_senhas",
    moduloLabel: "Cofre de senhas",
    label: "Editar cofre de senhas",
    descricao: "Cadastrar, alterar e remover senhas do cofre.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["cofre_senhas.ver"],
  },
  "integra_contador.consultar": {
    chave: "integra_contador.consultar",
    modulo: "integra_contador",
    moduloLabel: "Integra Contador",
    label: "Consultar Integra Contador",
    descricao: "Fazer consultas (situação fiscal, extratos, caixa postal) via Integra Contador — sem custo/risco.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "integra_contador.emitir_guias": {
    chave: "integra_contador.emitir_guias",
    modulo: "integra_contador",
    moduloLabel: "Integra Contador",
    label: "Emitir guias via Integra Contador",
    descricao: "Gerar guias de pagamento (DAS, DARF) via Integra Contador.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["integra_contador.consultar"],
  },
  "integra_contador.declarar": {
    chave: "integra_contador.declarar",
    modulo: "integra_contador",
    moduloLabel: "Integra Contador",
    label: "Transmitir declarações (PGDAS-D, MIT, DCTFWeb)",
    descricao: "Transmitir declarações oficiais à Receita Federal — ação irreversível e com custo de requisição real.",
    escopo: "GLOBAL",
    irreversivel: true,
    implica: ["integra_contador.consultar"],
  },
  "impostos.ver": {
    chave: "impostos.ver",
    modulo: "impostos",
    moduloLabel: "Impostos",
    label: "Ver impostos",
    descricao: "Ver guias e apurações de impostos municipais/estaduais.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "impostos.editar": {
    chave: "impostos.editar",
    modulo: "impostos",
    moduloLabel: "Impostos",
    label: "Editar impostos",
    descricao: "Alterar parâmetros de apuração de impostos.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["impostos.ver"],
  },
  "impostos.emitir_iss": {
    chave: "impostos.emitir_iss",
    modulo: "impostos",
    moduloLabel: "Impostos",
    label: "Emitir guia de ISS (Petrópolis)",
    descricao: "Consolidar e emitir a guia oficial de ISS — ação irreversível junto à prefeitura.",
    escopo: "GLOBAL",
    irreversivel: true,
    implica: ["impostos.ver"],
  },
  "fechamento.ver": {
    chave: "fechamento.ver",
    modulo: "fechamento",
    moduloLabel: "Fechamento / Automação",
    label: "Ver fechamento",
    descricao: "Ver relatórios e status da rotina de fechamento mensal.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "fechamento.executar": {
    chave: "fechamento.executar",
    modulo: "fechamento",
    moduloLabel: "Fechamento / Automação",
    label: "Executar fechamento",
    descricao: "Disparar manualmente a rotina de fechamento mensal.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["fechamento.ver"],
  },
  "precificacao.ver": {
    chave: "precificacao.ver",
    modulo: "precificacao",
    moduloLabel: "Precificação",
    label: "Ver precificação",
    descricao: "Ver parâmetros, custos e procedimentos de precificação de uma empresa.",
    escopo: "AMBOS",
    irreversivel: false,
  },
  "precificacao.editar": {
    chave: "precificacao.editar",
    modulo: "precificacao",
    moduloLabel: "Precificação",
    label: "Editar precificação",
    descricao: "Alterar parâmetros, custos e procedimentos de precificação de uma empresa.",
    escopo: "AMBOS",
    irreversivel: false,
    implica: ["precificacao.ver"],
  },
  "precificacao.modelos": {
    chave: "precificacao.modelos",
    modulo: "precificacao",
    moduloLabel: "Precificação",
    label: "Gerenciar modelos de precificação",
    descricao: "Criar/editar modelos de precificação reutilizáveis entre empresas.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "auditoria.ver": {
    chave: "auditoria.ver",
    modulo: "auditoria",
    moduloLabel: "Auditoria / Logs",
    label: "Ver logs de auditoria",
    descricao: "Ver o histórico de ações e erros registrados pelo sistema.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "chat_ia.usar": {
    chave: "chat_ia.usar",
    modulo: "chat_ia",
    moduloLabel: "Chat IA",
    label: "Usar o chat IA",
    descricao: "Usar o assistente de IA interno.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "legalizacao.ver": {
    chave: "legalizacao.ver",
    modulo: "legalizacao",
    moduloLabel: "Legalização",
    label: "Ver legalização",
    descricao: "Ver processos do módulo de legalização.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "legalizacao.editar": {
    chave: "legalizacao.editar",
    modulo: "legalizacao",
    moduloLabel: "Legalização",
    label: "Editar legalização",
    descricao: "Criar e alterar processos do módulo de legalização.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["legalizacao.ver"],
  },
  "extratos.ver": {
    chave: "extratos.ver",
    modulo: "extratos",
    moduloLabel: "Extratos",
    label: "Ver extratos",
    descricao: "Ver o módulo de extratos bancários.",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "extratos.editar": {
    chave: "extratos.editar",
    modulo: "extratos",
    moduloLabel: "Extratos",
    label: "Editar extratos",
    descricao: "Classificar e conciliar lançamentos de extratos.",
    escopo: "GLOBAL",
    irreversivel: false,
    implica: ["extratos.ver"],
  },
  "atendimento.atender": {
    chave: "atendimento.atender",
    modulo: "atendimento",
    moduloLabel: "Atendimento",
    label: "Atender no inbox",
    descricao: "Ver e responder mensagens no inbox de atendimento (WhatsApp).",
    escopo: "GLOBAL",
    irreversivel: false,
  },
  "financeiro.ver": {
    chave: "financeiro.ver",
    modulo: "financeiro",
    moduloLabel: "Financeiro",
    label: "Ver financeiro",
    descricao: "Ver lançamentos, extratos e orçamento financeiro de uma empresa.",
    escopo: "AMBOS",
    irreversivel: false,
  },
  "financeiro.editar": {
    chave: "financeiro.editar",
    modulo: "financeiro",
    moduloLabel: "Financeiro",
    label: "Editar financeiro",
    descricao: "Lançar, editar e cobrar no módulo financeiro de uma empresa.",
    escopo: "AMBOS",
    irreversivel: false,
    implica: ["financeiro.ver"],
  },
  "portal.ver": {
    chave: "portal.ver",
    modulo: "portal",
    moduloLabel: "Portal do cliente",
    label: "Acessar o portal",
    descricao: "Entrar no portal da empresa (obrigatório pra qualquer outro acesso do lado do cliente).",
    escopo: "EMPRESA",
    irreversivel: false,
  },
  "notas.emitir": {
    chave: "notas.emitir",
    modulo: "portal",
    moduloLabel: "Portal do cliente",
    label: "Emitir notas fiscais",
    descricao: "Emitir NFS-e para tomadores dessa empresa.",
    escopo: "EMPRESA",
    irreversivel: false,
    implica: ["portal.ver"],
  },
  "notas.cancelar": {
    chave: "notas.cancelar",
    modulo: "portal",
    moduloLabel: "Portal do cliente",
    label: "Cancelar notas fiscais",
    descricao: "Cancelar uma NFS-e já emitida — ação irreversível junto à prefeitura.",
    escopo: "EMPRESA",
    irreversivel: true,
    implica: ["portal.ver"],
  },
  "tomadores.editar": {
    chave: "tomadores.editar",
    modulo: "portal",
    moduloLabel: "Portal do cliente",
    label: "Editar tomadores",
    descricao: "Cadastrar e alterar tomadores (clientes que recebem a nota) dessa empresa.",
    escopo: "EMPRESA",
    irreversivel: false,
    implica: ["portal.ver"],
  },
};

export function permissoesDoModulo(modulo: string): PermissaoInfo[] {
  return Object.values(PERMISSOES)
    .filter((p) => p.modulo === modulo)
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

/** Expande um conjunto de chaves marcadas com tudo que elas implicam (fecho transitivo). */
export function expandirImplicacoes(chaves: Permissao[]): Permissao[] {
  const resultado = new Set<Permissao>(chaves);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const chave of resultado) {
      const info = PERMISSOES[chave];
      for (const implicada of info?.implica ?? []) {
        if (!resultado.has(implicada)) {
          resultado.add(implicada);
          mudou = true;
        }
      }
    }
  }
  return [...resultado];
}

/** Marca uma permissão num conjunto, arrastando junto tudo que ela implica. */
export function marcarComCascata(atual: Set<Permissao>, chave: Permissao): Set<Permissao> {
  return new Set([...atual, ...expandirImplicacoes([chave])]);
}

/** Desmarca uma permissão, arrastando junto quem dependia dela (senão o conjunto fica inconsistente). */
export function desmarcarComCascata(atual: Set<Permissao>, chave: Permissao): Set<Permissao> {
  const resultado = new Set(atual);
  resultado.delete(chave);
  for (const p of [...resultado]) {
    if (expandirImplicacoes([p]).includes(chave)) resultado.delete(p);
  }
  return resultado;
}
