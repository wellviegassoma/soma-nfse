-- Fix de segurança: user_companies_insert/update deixavam um ADMIN_CLIENTE
-- conceder QUALQUER papel (inclusive SUPER_ADMIN/ADMIN_SOMA) pra si mesmo ou
-- pra outro usuário na própria empresa, chamando o PostgREST direto (fora da
-- UI, que só oferece papéis de cliente no formulário — a trava real tinha
-- que estar na RLS, não só na tela). A UI já nunca ofereceu isso; esse fix
-- fecha o caminho por fora dela.
--
-- Staff (is_soma_staff()) continua podendo conceder qualquer papel. Quem
-- não é staff só pode gravar ADMIN_CLIENTE ou EMISSOR — nunca um papel de
-- staff/analista — e só na própria empresa (user_company_role(company_id)
-- já garantia isso, mantido).
drop policy user_companies_insert on public.user_companies;
drop policy user_companies_update on public.user_companies;

create policy user_companies_insert on public.user_companies
  for insert with check (
    public.is_soma_staff()
    or (
      public.user_company_role(company_id) = 'ADMIN_CLIENTE'
      and role in ('ADMIN_CLIENTE', 'EMISSOR')
    )
  );

create policy user_companies_update on public.user_companies
  for update using (
    public.is_soma_staff() or public.user_company_role(company_id) = 'ADMIN_CLIENTE'
  ) with check (
    public.is_soma_staff()
    or (
      public.user_company_role(company_id) = 'ADMIN_CLIENTE'
      and role in ('ADMIN_CLIENTE', 'EMISSOR')
    )
  );
