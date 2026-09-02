-- Fase U — Integra Contador (MIT): histórico auditável de apurações do
-- MIT (IRPJ/CSLL/PIS/COFINS) encerradas pelo sistema pra clientes Lucro
-- Presumido. Mesmo espírito das outras tabelas `integra_contador_*`
-- (contribuintes/cache/requests_log, ver 20260827280000) — o serviço em
-- integra-contador/ não escreve aqui (ele não conhece `companies`), quem
-- escreve é o frontend logo após um POST bem-sucedido em
-- /mit/apuracao/declarar.

create table public.integra_contador_mit_encerramentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null, -- "YYYY-MM"
  protocolo_encerramento text not null,
  id_apuracao bigint,
  situacao_apuracao text not null default 'ENVIADO', -- espelha o texto que a Serpro devolve (ENVIADO/PROCESSANDO/ENCERRADA/ERRO) — atualizado quando a UI consulta a situação
  dados_enviados jsonb not null, -- payload exato transmitido (Debitos por tributo) — auditoria de exatamente o que foi declarado em nome do cliente
  transmitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integra_contador_mit_encerramentos_company_competencia_idx
  on public.integra_contador_mit_encerramentos (company_id, competencia);

create trigger integra_contador_mit_encerramentos_set_updated_at
  before update on public.integra_contador_mit_encerramentos
  for each row execute function public.set_updated_at();

alter table public.integra_contador_mit_encerramentos enable row level security;

create policy integra_contador_mit_encerramentos_all on public.integra_contador_mit_encerramentos
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
