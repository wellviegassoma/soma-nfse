-- Janela fixa de 24h pra recuperar mensagem perdida era arbitrária —
-- podia sobrar (reprocessar mensagem de sobra, inofensivo por causa da
-- idempotência) ou faltar (deixar mensagem de fora se a queda durou mais
-- de 24h). Guarda o instante exato da última vez que se sabe que a
-- conexão estava sincronizada — próxima reconexão usa ESSE ponto de
-- corte, não um número redondo.
alter table public.atendimento_conexoes add column ultima_sincronizacao_em timestamptz;
