-- O dashboard de Legalização passou a mostrar certificados digitais
-- vencendo, mas a tabela `certificates` guarda campos cifrados (pfx e
-- senha) e sua RLS é só is_soma_staff() de propósito. Em vez de abrir a
-- tabela crua pro papel de Analista de Legalização (o que exporia esses
-- campos cifrados a quem não deveria nem saber que existem), esta function
-- SECURITY DEFINER devolve só o que é necessário (company_id, expires_at),
-- com a própria checagem de papel embutida — mesmo padrão de
-- is_soma_staff()/is_legalizacao_analista() já usado no projeto.
create or replace function public.certificados_vencendo_legalizacao()
returns table (company_id uuid, expires_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select c.company_id, c.expires_at
  from public.certificates c
  where public.is_soma_staff() or public.is_legalizacao_analista();
$$;

grant execute on function public.certificados_vencendo_legalizacao() to authenticated;
