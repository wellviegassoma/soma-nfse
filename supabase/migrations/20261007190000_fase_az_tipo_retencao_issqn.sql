-- Retenção de ISS (tpRetISSQN do XML da NFS-e: 1 = não retido, 2 = retido pelo
-- tomador, 3 = retido pelo intermediário). Necessário no Simples Nacional: a
-- receita com ISS retido não leva a parcela de ISS no DAS (e a declaração
-- do PGDAS-D usa atividade "com retenção"). Antes só a emissão pelo próprio
-- sistema sabia disso; nota distribuída era sempre tratada como "não retida".
alter table public.notas_distribuidas add column tipo_retencao_issqn smallint;

create or replace function pg_temp.tp_ret_issqn(x text) returns smallint
language plpgsql as $$
begin
  return ((xpath('//*[local-name()="tpRetISSQN"]/text()', x::xml))[1])::text::smallint;
exception when others then
  return null;
end;
$$;

update public.notas_distribuidas
   set tipo_retencao_issqn = pg_temp.tp_ret_issqn(xml)
 where tipo_retencao_issqn is null
   and xml like '%tpRetISSQN%';
