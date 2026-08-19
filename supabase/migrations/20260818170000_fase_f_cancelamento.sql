-- Fase F — Cancelamento de NFS-e (evento e101101). `nfse.status` já existia
-- (text, default 'AUTORIZADA') mas não tinha policy de UPDATE — só
-- select/insert. `nfse_events` já existia pronta desde a Fase C
-- (comentário: "cancelamento/substituição — schema pronto, lógica só na
-- Fase D/E"), sem alteração de estrutura necessária.

create policy nfse_update on public.nfse
  for update using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
