export const STATUS_PEDIDO: Record<string, { rotulo: string; classe: string }> = {
  RECEBIDO: { rotulo: "Sem rascunho", classe: "bg-warning-soft text-warning" },
  EXTRAINDO: { rotulo: "IA lendo…", classe: "bg-surface-muted text-foreground/70" },
  AGUARDANDO_APROVACAO: { rotulo: "Aguardando aprovação", classe: "bg-brand/10 text-brand" },
  EMITINDO: { rotulo: "Emitindo", classe: "bg-surface-muted text-foreground/70" },
  EMITIDA: { rotulo: "Emitida", classe: "bg-success-soft text-success" },
  PARCIAL: { rotulo: "Parcial", classe: "bg-warning-soft text-warning" },
  ERRO: { rotulo: "Erro", classe: "bg-danger-soft text-danger" },
  DESCARTADO: { rotulo: "Descartado", classe: "bg-surface-muted text-foreground/55" },
};

export const STATUS_ITEM: Record<string, { rotulo: string; classe: string }> = {
  RASCUNHO: { rotulo: "Rascunho", classe: "bg-brand/10 text-brand" },
  APROVADO: { rotulo: "Emitindo…", classe: "bg-surface-muted text-foreground/70" },
  EMITIDO: { rotulo: "Emitida", classe: "bg-success-soft text-success" },
  ERRO: { rotulo: "Erro", classe: "bg-danger-soft text-danger" },
  DESCARTADO: { rotulo: "Descartado", classe: "bg-surface-muted text-foreground/55" },
};

export const FONTE_EMPRESA: Record<string, string> = {
  CNPJ_COMANDO: "CNPJ no #nota",
  VINCULO: "vínculo do contato",
  TELEFONE: "telefone",
  NOME_CONTATO: "nome do grupo (confira)",
  PAINEL: "escolhida no painel",
  GRUPO_IA: "grupo com várias empresas (IA escolheu)",
};

export function Selo({ s, mapa }: { s: string; mapa: Record<string, { rotulo: string; classe: string }> }) {
  const m = mapa[s] ?? { rotulo: s, classe: "bg-surface-muted text-foreground/70" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.classe}`}>{m.rotulo}</span>;
}
