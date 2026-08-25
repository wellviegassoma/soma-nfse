-- Fechamento (notas_distribuidas) passa a ser exclusivo da equipe SOMA
-- (SUPER_ADMIN/ADMIN_SOMA) — não é só uma questão de esconder a aba na
-- UI, a RLS precisa refletir isso de verdade, senão um cliente
-- (ADMIN_CLIENTE/EMISSOR) ainda conseguiria ler via SDK direto.

drop policy if exists notas_distribuidas_select on public.notas_distribuidas;
create policy notas_distribuidas_select on public.notas_distribuidas
  for select using (public.is_soma_staff());
