-- Se a inscrição municipal do prestador vai na DPS. Depende do cadastro de
-- cada empresa no CNC da NFS-e nacional (na mesma Petrópolis tem empresa que
-- exige — E0116 — e empresa que recusa — E0120). null = ainda não se sabe:
-- envia se tiver IM cadastrada. A emissão aprende sozinha com a recusa.
alter table public.companies add column if not exists nfse_envia_im boolean;

-- Aproveita o que o governo já respondeu: o último E0116/E0120 de cada empresa.
with ultimo as (
  select distinct on (company_id) company_id,
    case when technical_message like '%E0120%' then false else true end as envia
  from public.nfse_errors
  where technical_message like '%E0120%' or technical_message like '%E0116%'
  order by company_id, created_at desc
)
update public.companies c set nfse_envia_im = u.envia
from ultimo u where u.company_id = c.id;
