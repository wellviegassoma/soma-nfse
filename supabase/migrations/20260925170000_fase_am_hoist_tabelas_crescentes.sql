-- Continuação do fix de performance (20260925160000) — mesma técnica
-- ((select ...) força InitPlan em vez de reavaliação por linha), agora nas
-- tabelas que crescem sem parar (log de auditoria, mensagens de
-- atendimento/WhatsApp, cache e log do Integra Contador, chat IA,
-- fechamento). notas_distribuidas já tinha 34 mil linhas e travou o
-- painel; estas ainda são pequenas (centenas a ~1.100 linhas hoje), mas
-- são exatamente o tipo de tabela "append-only" que vai chegar lá —
-- aplicar agora evita reviver o mesmo incidente daqui a alguns meses.
--
-- Não mexi em tabelas de cadastro limitado por natureza (services,
-- certificates, precificação, folha/receita manual, societário, cofre de
-- senhas) nem em policies de insert/update/delete (que só avaliam a
-- condição uma vez, por linha escrita — não têm o problema de escala).

alter policy audit_logs_select on public.audit_logs
  using ((select public.is_soma_staff()));

alter policy integra_contador_requests_log_select on public.integra_contador_requests_log
  using ((select public.is_soma_staff()));
alter policy integra_contador_cache_all on public.integra_contador_cache
  using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

alter policy chat_ia_conversas_all on public.chat_ia_conversas
  using ((select public.is_soma_staff()) and user_id = auth.uid())
  with check ((select public.is_soma_staff()) and user_id = auth.uid());
alter policy chat_ia_mensagens_all on public.chat_ia_mensagens
  using (
    (select public.is_soma_staff())
    and exists (
      select 1 from public.chat_ia_conversas c
      where c.id = conversa_id and c.user_id = auth.uid()
    )
  )
  with check (
    (select public.is_soma_staff())
    and exists (
      select 1 from public.chat_ia_conversas c
      where c.id = conversa_id and c.user_id = auth.uid()
    )
  );

alter policy atendimento_contatos_all on public.atendimento_contatos
  using ((select public.is_soma_staff()) or (select public.is_atendimento_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_atendimento_analista()));
alter policy atendimento_tickets_all on public.atendimento_tickets
  using ((select public.is_soma_staff()) or (select public.is_atendimento_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_atendimento_analista()));
alter policy atendimento_mensagens_all on public.atendimento_mensagens
  using ((select public.is_soma_staff()) or (select public.is_atendimento_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_atendimento_analista()));
alter policy atendimento_contato_tags_all on public.atendimento_contato_tags
  using ((select public.is_soma_staff()) or (select public.is_atendimento_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_atendimento_analista()));
alter policy atendimento_transferencias_all on public.atendimento_transferencias
  using ((select public.is_soma_staff()) or (select public.is_atendimento_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_atendimento_analista()));

alter policy rotina_fechamento_execucoes_all on public.rotina_fechamento_execucoes
  using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
alter policy rotina_fechamento_itens_all on public.rotina_fechamento_itens
  using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
