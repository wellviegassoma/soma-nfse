-- Fase CE: responsável fixo por modelo de tarefa (pedido de 24/11/2026).
--
-- Algumas tarefas são sempre da mesma pessoa, independente da carteira da
-- empresa. Com responsável fixo, as tarefas do modelo nascem com ele (no
-- departamento do modelo); etapas de outro departamento continuam indo para a
-- carteira daquele departamento (cascata). Vazio = usa a carteira, como antes.
alter table public.tarefa_modelos
  add column if not exists responsavel_fixo_id uuid references public.profiles(id) on delete set null;
