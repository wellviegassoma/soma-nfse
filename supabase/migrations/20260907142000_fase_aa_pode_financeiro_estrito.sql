-- pode_financeiro() estava devolvendo NULL (não false) para usuário sem
-- vínculo com a empresa: user_company_role() devolve NULL nesse caso, e
-- `NULL = 'ADMIN_CLIENTE'` é NULL, então `false or false or NULL` = NULL.
--
-- Na RLS isso já negava (policy que avalia NULL não libera a linha), então
-- não houve brecha. O risco é futuro: em plpgsql, `if not pode_financeiro(x)
-- then raise` NÃO dispara quando a expressão é NULL — uma checagem escrita
-- assim falharia ABERTA. coalesce fecha isso de vez.

create or replace function public.pode_financeiro(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.is_soma_staff()
    or public.is_financeiro_analista()
    or public.user_company_role(target_company_id) = 'ADMIN_CLIENTE',
    false
  );
$$;
