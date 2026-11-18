-- Nomes da equipe pro Comercial — profiles_select só deixa is_soma_staff
-- (empresas.ver) ler outros perfis; um usuário só-Comercial veria "—" no
-- responsável dos cards e no autor dos comentários sem isto. Devolve só id e
-- nome (nunca e-mail), de quem tem alguma permissão global (equipe) ou é
-- autor/responsável de algum prospect. Mesmo padrão de legalizacao_responsaveis.
create or replace function public.comercial_nomes_equipe()
returns table (id uuid, full_name text)
language sql security definer set search_path = public stable as $$
  select p.id, p.full_name from public.profiles p
   where public.tem_permissao('comercial.ver')
     and (
       exists (select 1 from public.usuario_permissoes up where up.user_id = p.id and up.company_id is null)
       or exists (select 1 from public.comercial_prospects cp where cp.responsavel_id = p.id)
       or exists (select 1 from public.comercial_prospect_atividade a where a.autor_id = p.id)
     );
$$;
revoke all on function public.comercial_nomes_equipe() from public;
grant execute on function public.comercial_nomes_equipe() to authenticated;
