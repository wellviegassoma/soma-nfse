-- Simulador da Reforma Tributária (/admin/reforma-tributaria): análise
-- salva pelo contador, por empresa. Sem linha = ainda não analisada (usa
-- os dados do sistema). Com linha, a carteira usa os dados salvos aqui no
-- lugar dos do sistema e mostra o status:
--   SEM_MUDANCA  — analisado, permanece no regime atual (linha verde)
--   COM_MUDANCA  — analisado, há mudança a fazer → reunião com o cliente (linha amarela)
-- Livro caixa: médico/profissional que fatura parte pela PJ e parte na
-- pessoa física (carnê-leão). Quando marcado, a receita do livro caixa é
-- somada à da PJ na simulação (como se tudo passasse a ser faturado pela PJ).

create table if not exists public.reforma_analises (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'SEM_MUDANCA', 'COM_MUDANCA')),
  observacao text,
  tem_livro_caixa boolean not null default false,
  livro_caixa_media_mensal numeric(14, 2)
    check (livro_caixa_media_mensal is null or livro_caixa_media_mensal >= 0),
  -- {"2026-01": 12000.00, ...} — meses informados um a um (opcional).
  livro_caixa_meses jsonb not null default '{}'::jsonb,
  -- Dados da simulação editados e salvos (receita, folha, ISS, redução etc.).
  entrada jsonb,
  regime_recomendado text,
  ano_referencia int,
  analisado_por uuid references public.profiles(id) on delete set null,
  analisado_em timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.reforma_analises is
  'Análise do simulador da Reforma Tributária salva pelo contador, uma por empresa.';

alter table public.reforma_analises enable row level security;

drop policy if exists reforma_analises_all on public.reforma_analises;
create policy reforma_analises_all on public.reforma_analises
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
