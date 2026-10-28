-- Certificados > acompanhamento da tratativa. A situação do certificado
-- (sem, vencido, vencendo, válido) continua calculada pela validade em
-- `certificates`; aqui fica o que a equipe já fez com cada empresa —
-- senão a lista de vencidos/sem certificado parece intocada mesmo com a
-- equipe trabalhando nela.
--
-- Etapas: PENDENTE (nada feito) → AGUARDANDO_CLIENTE (já comunicado) →
-- AGUARDANDO_PAGAMENTO → RESOLVIDO; ou NAO_SE_APLICA (não vamos fazer).
--
-- `referente_vencimento` amarra a etapa ao certificado de quando ela foi
-- marcada (null = empresa estava sem certificado). Se o certificado muda
-- (renovou, ou venceu de novo depois de renovado), a etapa guardada é de
-- outro ciclo e a tela trata como RESOLVIDO (se o novo está válido) ou
-- PENDENTE (novo ciclo) — sem trigger nem limpeza manual.
create table public.certificado_acompanhamentos (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null check (status in (
    'PENDENTE', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_PAGAMENTO', 'RESOLVIDO', 'NAO_SE_APLICA'
  )),
  referente_vencimento timestamptz,
  observacao text,
  proximo_contato date,
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

-- Histórico: uma linha por mudança, nunca editada.
create table public.certificado_acompanhamento_eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null check (status in (
    'PENDENTE', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_PAGAMENTO', 'RESOLVIDO', 'NAO_SE_APLICA'
  )),
  referente_vencimento timestamptz,
  observacao text,
  proximo_contato date,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index certificado_acompanhamento_eventos_company_idx
  on public.certificado_acompanhamento_eventos(company_id, criado_em desc);

-- Mesma regra da tela (/admin/certificados exige certificados.ver). Não
-- toca em `certificates` (pfx/senha cifrados), que segue só is_soma_staff().
alter table public.certificado_acompanhamentos enable row level security;
create policy certificado_acompanhamentos_all on public.certificado_acompanhamentos
  for all to authenticated
  using ((select public.is_soma_staff()) or (select public.tem_permissao('certificados.ver')))
  with check ((select public.is_soma_staff()) or (select public.tem_permissao('certificados.ver')));

alter table public.certificado_acompanhamento_eventos enable row level security;
create policy certificado_acompanhamento_eventos_select on public.certificado_acompanhamento_eventos
  for select to authenticated
  using ((select public.is_soma_staff()) or (select public.tem_permissao('certificados.ver')));
create policy certificado_acompanhamento_eventos_insert on public.certificado_acompanhamento_eventos
  for insert to authenticated
  with check ((select public.is_soma_staff()) or (select public.tem_permissao('certificados.ver')));
