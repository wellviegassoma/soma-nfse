-- Seed local: cria a organization/company da própria SOMA.
-- Usuários não podem ser criados por SQL puro (Supabase Auth cuida do hash de senha).
-- Depois de criar sua conta pelo /login (ou pelo Studio → Authentication → Add user),
-- promova-a a SUPER_ADMIN vinculando-a a esta company:
--
--   insert into public.user_companies (user_id, company_id, role)
--   values ('<uuid-do-seu-usuario>', '11111111-1111-1111-1111-111111111111', 'SUPER_ADMIN');

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'SOMA Contabilidade')
on conflict (id) do nothing;

insert into public.companies (id, organization_id, cnpj, legal_name, trade_name)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  null,
  'SOMA Contabilidade',
  'SOMA'
)
on conflict (id) do nothing;
