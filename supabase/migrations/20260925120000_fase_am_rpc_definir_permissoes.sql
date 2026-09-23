-- Fase AM — Redesenho de permissões: RPC de escrita. usuario_permissoes não
-- tem policy de insert/update/delete (ver migration de fundação) — só esta
-- função (security definer, roda como owner) grava. Cobre os dois telas
-- previstas no plano com o mesmo mecanismo:
--
-- - Tela central da SOMA (/admin/usuarios/[userId]): p_company_id = null,
--   substitui TODO o conjunto de permissões do usuário (global + todas as
--   empresas) — exige usuarios.gerenciar_equipe (pra linhas GLOBAIS) ou
--   usuarios.gerenciar_clientes (pra linhas EMPRESA).
-- - Autoatendimento do cliente (/empresas/[companyId]/usuarios): p_company_id
--   preenchido, mexe só nas permissões daquela empresa — exige
--   usuarios_empresa.gerenciar naquela empresa, e só pode conceder o que o
--   próprio chamador já tem ali (nunca mais do que ele mesmo possui).
--
-- Sempre "substitui o conjunto inteiro" (delete + insert), não "diff" — mais
-- simples de raciocinar a partir de uma grade de checkboxes, e a trava do
-- "não pode remover o último gerenciar_equipe" garante que ninguém tranca o
-- sistema por engano.

create or replace function public.definir_permissoes_usuario(
  p_user_id uuid,
  p_permissoes jsonb,
  p_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_pode_equipe boolean := public.tem_permissao('usuarios.gerenciar_equipe');
  v_pode_clientes boolean := public.tem_permissao('usuarios.gerenciar_clientes');
  v_eh_staff boolean := coalesce(public.tem_permissao('usuarios.gerenciar_equipe') or public.tem_permissao('usuarios.gerenciar_clientes'), false);
  v_pode_empresa boolean;
  v_item jsonb;
  v_permissao text;
  v_item_company_id uuid;
  v_escopo text;
  v_outros_gerenciar_equipe int;
  v_tinha_gerenciar_equipe boolean;
  v_tera_gerenciar_equipe boolean;
begin
  if v_caller is null then
    raise exception 'Não autenticado.';
  end if;

  if p_permissoes is null or jsonb_typeof(p_permissoes) <> 'array' then
    raise exception 'p_permissoes precisa ser um array JSON.';
  end if;

  if p_company_id is not null then
    v_pode_empresa := v_eh_staff or public.tem_permissao('usuarios_empresa.gerenciar', p_company_id);
    if not v_pode_empresa then
      raise exception 'Sem permissão para gerenciar usuários dessa empresa.';
    end if;
  else
    if not v_eh_staff then
      raise exception 'Sem permissão para gerenciar usuários.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_permissoes)
  loop
    v_permissao := v_item->>'permissao';
    v_item_company_id := nullif(v_item->>'company_id', '')::uuid;

    select escopo into v_escopo from public.permissoes_catalogo where chave = v_permissao;
    if v_escopo is null then
      raise exception 'Permissão desconhecida: %', v_permissao;
    end if;

    if p_company_id is not null then
      if v_item_company_id is distinct from p_company_id then
        raise exception 'Permissão % fora do escopo da empresa informada.', v_permissao;
      end if;
      if v_escopo = 'GLOBAL' then
        raise exception 'Permissão % é global, não pode ser concedida por empresa.', v_permissao;
      end if;
      if not v_eh_staff and not public.tem_permissao(v_permissao, p_company_id) then
        raise exception 'Você não pode conceder uma permissão (%) que você mesmo não tem nessa empresa.', v_permissao;
      end if;
    else
      if v_item_company_id is null then
        if v_escopo = 'EMPRESA' then
          raise exception 'Permissão % exige uma empresa.', v_permissao;
        end if;
        if not v_pode_equipe then
          raise exception 'Só quem tem usuarios.gerenciar_equipe pode conceder permissões globais (%).', v_permissao;
        end if;
      else
        if v_escopo = 'GLOBAL' then
          raise exception 'Permissão % é global, não pode ser escopada a uma empresa.', v_permissao;
        end if;
      end if;
    end if;
  end loop;

  if p_company_id is null then
    v_tinha_gerenciar_equipe := exists (
      select 1 from public.usuario_permissoes
      where user_id = p_user_id and permissao = 'usuarios.gerenciar_equipe' and company_id is null
    );
    v_tera_gerenciar_equipe := exists (
      select 1 from jsonb_array_elements(p_permissoes) e
      where e->>'permissao' = 'usuarios.gerenciar_equipe' and nullif(e->>'company_id', '') is null
    );
    if v_tinha_gerenciar_equipe and not v_tera_gerenciar_equipe then
      select count(*) into v_outros_gerenciar_equipe
      from public.usuario_permissoes
      where permissao = 'usuarios.gerenciar_equipe' and company_id is null and user_id <> p_user_id;
      if v_outros_gerenciar_equipe = 0 then
        raise exception 'Não é possível remover o último usuário com usuarios.gerenciar_equipe.';
      end if;
    end if;
  end if;

  if p_company_id is null then
    delete from public.usuario_permissoes where user_id = p_user_id;
  else
    delete from public.usuario_permissoes where user_id = p_user_id and company_id = p_company_id;
  end if;

  insert into public.usuario_permissoes (user_id, company_id, permissao, concedido_por)
  select p_user_id, nullif(e->>'company_id', '')::uuid, e->>'permissao', v_caller
  from jsonb_array_elements(p_permissoes) e;
end;
$$;

comment on function public.definir_permissoes_usuario(uuid, jsonb, uuid) is
  'Única forma de escrever em usuario_permissoes. p_company_id null = tela central da SOMA, substitui tudo do usuário; preenchido = autoatendimento do cliente, substitui só aquela empresa e só com o que o chamador já tem.';

revoke all on function public.definir_permissoes_usuario(uuid, jsonb, uuid) from public;
grant execute on function public.definir_permissoes_usuario(uuid, jsonb, uuid) to authenticated;
