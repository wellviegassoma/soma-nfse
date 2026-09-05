-- Fase Z — Inativação de empresa: quando o cliente encerra com a SOMA,
-- marca a empresa como inativa (some dos controles e para de buscar
-- notas) em vez de excluir o cadastro (histórico fica intacto).
alter table public.companies
  add column ativa boolean not null default true,
  add column data_encerramento_soma date;

create index companies_ativa_idx on public.companies (ativa);
