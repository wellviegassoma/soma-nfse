-- Central FGTS: consulta das guias de FGTS de cada cliente no FGTS
-- Digital, via API da Infosimples (consulta fgts/guia). O FGTS Digital
-- não tem API oficial e o login gov.br tem hCaptcha, então a consulta é
-- terceirizada — autenticada com o certificado da própria SOMA como
-- procuradora (parâmetro `representado` = CNPJ do cliente), não com o
-- certificado de cada empresa.
--
-- Uma linha por empresa com o resultado da ÚLTIMA consulta: cada nova
-- consulta substitui a anterior. `resposta` guarda o JSON bruto da
-- Infosimples pra diagnóstico — o formato exato de `guias` só foi
-- confirmado contra a documentação pública, não contra uma resposta real.
create table public.fgts_guias_consultas (
  company_id uuid primary key references public.companies(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  status text not null check (status in ('sucesso', 'erro')),
  erro text,
  guias jsonb not null default '[]'::jsonb,
  qtd_em_aberto integer not null default 0,
  valor_em_aberto numeric(14, 2) not null default 0,
  resposta jsonb
);

alter table public.fgts_guias_consultas enable row level security;

create policy fgts_guias_consultas_all on public.fgts_guias_consultas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
