-- Fase L — ISS retido pelo tomador: o cadastro de serviço nunca teve esse
-- campo, então toda nota emitida até aqui foi sempre com tpRetISSQN=1 (não
-- retido) no XML, mesmo quando o tomador de fato retém o ISS na fonte
-- (situação prevista no layout nacional desde o início — dps_builder.py já
-- aceita o campo, só nunca foi exposto no cadastro nem preenchido).

alter table public.services
  add column tipo_retencao_issqn smallint not null default 1
    check (tipo_retencao_issqn in (1, 2, 3));

comment on column public.services.tipo_retencao_issqn is
  'tpRetISSQN do layout nacional: 1=Não retido (prestador recolhe), 2=Retido pelo tomador, 3=Retido pelo intermediário.';
