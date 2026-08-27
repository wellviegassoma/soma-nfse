-- Cofre de senhas por empresa: credenciais reais que o cliente entrega
-- (gov.br, portal ISS municipal, conselho profissional etc.), cifradas em
-- repouso com o mesmo esquema AES-256-GCM já usado pra certificado digital
-- (ver frontend/src/lib/certificate.ts — MASTER_ENCRYPTION_KEY nunca sai do
-- servidor). Cadastrar/editar/apagar fica restrito à SOMA completa;
-- consultar e revelar (decifrar sob demanda) também é liberado pro Analista
-- de Legalização, que precisa acessar isso no dia a dia do módulo dele.

create table public.senhas_cofre (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  servico text not null,
  usuario text,
  senha_cifrada bytea not null,
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index senhas_cofre_company_id_idx on public.senhas_cofre(company_id);

create trigger senhas_cofre_set_updated_at before update on public.senhas_cofre
  for each row execute function public.set_updated_at();

alter table public.senhas_cofre enable row level security;

create policy senhas_cofre_select on public.senhas_cofre
  for select using (public.is_soma_staff() or public.is_legalizacao_analista());

create policy senhas_cofre_write on public.senhas_cofre
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
