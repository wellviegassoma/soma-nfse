// Rótulos e cores dos status do extrato e das etapas do painel (client-safe).

export type StatusMes = "PENDENTE" | "RECEBIDO" | "CONFERIDO" | "CONCILIADO" | "SEM_MOVIMENTO" | "ENCERRADA";

export const STATUS_INFO: Record<StatusMes, { rotulo: string; ponto: string; pill: string }> = {
  PENDENTE: { rotulo: "Pendente", ponto: "bg-foreground/20", pill: "bg-surface-muted text-foreground/60" },
  RECEBIDO: { rotulo: "Recebido", ponto: "bg-brand", pill: "bg-brand/10 text-brand" },
  CONFERIDO: { rotulo: "Conferido", ponto: "bg-success/60", pill: "bg-success/10 text-success" },
  CONCILIADO: { rotulo: "Conciliado", ponto: "bg-success", pill: "bg-success text-white" },
  SEM_MOVIMENTO: { rotulo: "Sem movimento", ponto: "bg-foreground/45", pill: "bg-foreground/10 text-foreground/70" },
  ENCERRADA: { rotulo: "Conta encerrada", ponto: "bg-foreground/10", pill: "bg-foreground/5 text-foreground/45 line-through" },
};

export const STATUS_ORDEM: StatusMes[] = ["PENDENTE", "RECEBIDO", "CONFERIDO", "CONCILIADO", "SEM_MOVIMENTO", "ENCERRADA"];

export type Etapa = "AGUARDANDO" | "PARCIAL" | "CONFERIR" | "PRONTO" | "CONCILIADO";

export const ETAPAS: { chave: Etapa; titulo: string; dica: string; cor: string }[] = [
  { chave: "AGUARDANDO", titulo: "Aguardando cliente", dica: "Nenhum extrato do mês ainda", cor: "text-warning" },
  { chave: "PARCIAL", titulo: "Recebido parcial", dica: "Falta extrato de alguma conta", cor: "text-warning" },
  { chave: "CONFERIR", titulo: "A conferir", dica: "Tudo recebido — conferir", cor: "text-brand" },
  { chave: "PRONTO", titulo: "Pronto para lançar", dica: "Conferido, falta conciliar", cor: "text-success" },
  { chave: "CONCILIADO", titulo: "Conciliado", dica: "Mês fechado", cor: "text-success" },
];
