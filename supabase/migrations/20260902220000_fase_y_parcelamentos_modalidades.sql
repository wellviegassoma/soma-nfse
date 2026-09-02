-- Fase Y — Central de Parcelamentos: generaliza
-- integra_contador_parcelamentos_sn (até aqui só PARCSN) pra guardar
-- qualquer uma das 8 modalidades irmãs (PARCSN-ESP/PERTSN/RELPSN/
-- PARCMEI/PARCMEI-ESP/PERTMEI/RELPMEI), confirmadas por chamada real
-- em 2026-09-02. Cada modalidade tem seu próprio botão "Verificar" na
-- tela (decisão do usuário — custo de rodar todas de uma vez seria 8x
-- maior que só PARCSN).

alter table public.integra_contador_parcelamentos_sn
  add column modalidade text not null default 'parcsn';

-- Nome exato da constraint antiga (company_id, numero_parcelamento)
-- pode ter sido truncado pelo Postgres ao gerar automaticamente — acha
-- e derruba pelo tipo em vez de arriscar o nome errado.
do $$
declare
  nome_constraint text;
begin
  select conname into nome_constraint
  from pg_constraint
  where conrelid = 'public.integra_contador_parcelamentos_sn'::regclass
    and contype = 'u';
  if nome_constraint is not null then
    execute format('alter table public.integra_contador_parcelamentos_sn drop constraint %I', nome_constraint);
  end if;
end $$;

alter table public.integra_contador_parcelamentos_sn
  add constraint integra_contador_parcelamentos_sn_company_modalidade_numero_key
    unique (company_id, modalidade, numero_parcelamento);

drop index if exists public.integra_contador_parcelamentos_sn_company_idx;
create index integra_contador_parcelamentos_sn_company_modalidade_idx
  on public.integra_contador_parcelamentos_sn (company_id, modalidade);
