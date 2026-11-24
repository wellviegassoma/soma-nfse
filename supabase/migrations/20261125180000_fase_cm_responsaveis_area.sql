-- Fase CM — responsáveis por área na empresa (Contabilidade, Fiscal, DP,
-- Legalização). Pedido de 24/11/2026: aparece nos Dados fiscais e nas
-- exportações da Serena/Newton. No Fiscal, quando a empresa está na carteira
-- da Serena ou do Newton, a tela mostra a IA e esta pessoa fica como apoio.

alter table public.companies
  add column if not exists responsavel_contabil_id uuid references public.profiles(id) on delete set null,
  add column if not exists responsavel_fiscal_id uuid references public.profiles(id) on delete set null,
  add column if not exists responsavel_dp_id uuid references public.profiles(id) on delete set null,
  add column if not exists responsavel_legalizacao_id uuid references public.profiles(id) on delete set null;

comment on column public.companies.responsavel_contabil_id is 'Responsável pela contabilidade (equipe SOMA).';
comment on column public.companies.responsavel_fiscal_id is 'Responsável pelo fiscal; com Serena/Newton, é o apoio humano.';
comment on column public.companies.responsavel_dp_id is 'Responsável pelo departamento pessoal.';
comment on column public.companies.responsavel_legalizacao_id is 'Responsável pela legalização.';
