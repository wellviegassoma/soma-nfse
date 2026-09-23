export type StatusTicket = "FILA" | "ABERTO" | "FECHADO";
export type RemetenteTipo = "CONTATO" | "ATENDENTE" | "SISTEMA" | "BOT";

export type TicketResumo = {
  id: string;
  protocolo: string;
  status: StatusTicket;
  departamento_id: string;
  atendente_id: string | null;
  aberto_em: string;
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
};
