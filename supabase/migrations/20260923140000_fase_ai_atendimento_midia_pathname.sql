-- Mídia recebida (foto, áudio, vídeo, figurinha, documento) passa a ser
-- baixada do WhatsApp e guardada no Vercel Blob (access privado, mesmo
-- padrão de Legalização — arquivo não vai pro Postgres, só o caminho).
-- midia_url já existia (usado até aqui só como marcador — sempre null);
-- midia_pathname é o novo, é ele que a rota de download usa pra buscar no
-- Blob (get() precisa do pathname, não da URL, pra blob privado).
alter table public.atendimento_mensagens add column midia_pathname text;
