-- IRPF: acesso só por permissão própria (irpf.ver), não mais por "ser da
-- equipe" (is_soma_staff). Pedido do Wellington 23/11/2026: só Wellington,
-- Douglas e Arthur. As concessões (usuario_permissoes) foram feitas à mão no
-- SQL Editor para esses três perfis; novas pessoas recebem pela tela de
-- Usuários (módulo IRPF).
insert into public.permissoes_catalogo (chave, modulo, escopo, irreversivel, ordem)
values ('irpf.ver', 'irpf', 'GLOBAL', false, 180)
on conflict (chave) do nothing;

do $$
declare t text;
begin
  foreach t in array array['irpf_contribuintes', 'irpf_declaracoes', 'irpf_arquivos', 'irpf_checklist_itens', 'irpf_eventos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all using ((select public.tem_permissao(''irpf.ver''))) with check ((select public.tem_permissao(''irpf.ver'')))',
      t || '_all', t
    );
  end loop;
end $$;
