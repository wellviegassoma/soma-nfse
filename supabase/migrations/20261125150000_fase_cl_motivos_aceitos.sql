-- Fase CL: Serena e Newton — "aceitar e seguir" (pedido do Wellington,
-- 24/11/2026). A equipe pode passar por cima de um motivo da conferência (ex.:
-- erro de login na prefeitura → fechar com base nas notas do portal), com
-- justificativa registrada. Lista de {codigo, justificativa, por, em}.
alter table public.serena_fechamentos add column if not exists motivos_aceitos jsonb;
alter table public.newton_fechamentos add column if not exists motivos_aceitos jsonb;
