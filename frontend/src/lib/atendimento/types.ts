export type StatusTicket = "FILA" | "ABERTO" | "FECHADO";
export type RemetenteTipo = "CONTATO" | "ATENDENTE" | "SISTEMA" | "BOT";

export type TicketResumo = {
  id: string;
  protocolo: string;
  status: StatusTicket;
  departamento_id: string;
  atendente_id: string | null;
  aberto_em: string;
  ultima_mensagem_em: string | null;
  ultima_mensagem_preview: string | null;
  ultima_mensagem_remetente_tipo: RemetenteTipo | null;
  nao_lida: boolean;
  contato: {
    id: string;
    nome: string | null;
    telefone: string;
    company_id: string | null;
  } | null;
  departamento: { nome: string } | null;
  atendente: { full_name: string | null } | null;
};

export type TicketDetalhe = {
  id: string;
  protocolo: string;
  status: StatusTicket;
  departamento_id: string;
  atendente_id: string | null;
  contato: {
    id: string;
    nome: string | null;
    telefone: string;
    company_id: string | null;
    company: { id: string; legal_name: string; trade_name: string | null } | null;
  } | null;
};

export type Mensagem = {
  id: string;
  ticket_id: string;
  remetente_tipo: RemetenteTipo;
  atendente_id: string | null;
  corpo: string | null;
  midia_url: string | null;
  midia_tipo: string | null;
  interno: boolean;
  status: string;
  created_at: string;
  // Vem do join na carga inicial (Server Component); mensagem nova via
  // Realtime não traz join nenhum (postgres_changes só dá as colunas cruas),
  // por isso TicketChat resolve o nome por um mapa de atendentes à parte
  // quando este campo não vier preenchido.
  atendente?: { full_name: string | null } | null;
};
