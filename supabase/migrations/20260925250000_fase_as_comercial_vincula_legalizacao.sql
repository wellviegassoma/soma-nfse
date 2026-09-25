-- Fase AS — Comercial: vincula o prospect a um processo de Abertura no
-- módulo Legalização, pra o time Comercial acompanhar o andamento sem
-- precisar entrar no outro módulo (e sem precisar de legalizacao.ver, que é
-- uma permissão separada — ver a RPC abaixo).
alter table public.comercial_prospects
  add column legalizacao_processo_id uuid references public.legalizacao_processos(id) on delete set null;

-- Um processo só deveria estar amarrado a um prospect por vez (evita colar
-- o mesmo processo em dois cards por engano).
create unique index comercial_prospects_legalizacao_processo_uniq
  on public.comercial_prospects(legalizacao_processo_id) where legalizacao_processo_id is not null;

-- comercial_prospects_select já garante que o chamador tem comercial.ver
-- antes de a linha aparecer (senão nem sabe o legalizacao_processo_id pra
-- passar aqui) — dentro da função só reforça isso, já que security definer
-- pula a RLS de legalizacao_processos/legalizacao_processo_fases. Devolve os
-- dados crus das fases pro cliente calcular o status efetivo com as mesmas
-- funções puras já usadas em /legalizacao/processos/status.ts (não duplica a
-- lógica de "concluído > manual > atrasado > a fazer" aqui em SQL).
create or replace function public.comercial_status_processo_legalizacao(p_prospect_id uuid)
returns table (
  processo_id uuid,
  nome text,
  prazo_final date,
  data_conclusao date,
  arquivado_em timestamptz,
  fases jsonb
)
language sql security definer set search_path = public stable as $$
  select p.id, p.nome, p.prazo_final, p.data_conclusao, p.arquivado_em,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                 'data_conclusao', f.data_conclusao,
                 'status_manual', f.status_manual,
                 'prazo', f.prazo
               ) order by f.ordem)
         from public.legalizacao_processo_fases f
        where f.processo_id = p.id),
      '[]'::jsonb
    ) as fases
  from public.comercial_prospects cp
  join public.legalizacao_processos p on p.id = cp.legalizacao_processo_id
  where cp.id = p_prospect_id
    and public.tem_permissao('comercial.ver')
$$;
revoke all on function public.comercial_status_processo_legalizacao(uuid) from public;
grant execute on function public.comercial_status_processo_legalizacao(uuid) to authenticated;
