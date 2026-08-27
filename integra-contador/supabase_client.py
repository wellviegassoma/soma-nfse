"""
Cliente Supabase (service role) — leitura da tabela `certificates` (dona é
o soma-nfse/frontend) e das tabelas integra_contador_* (próprias deste
serviço). Service role ignora RLS: este serviço roda sem sessão de usuário
(jobs agendados), então já opera com o mesmo nível de acesso de
`is_soma_staff()` por definição.
"""

from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def obter_cliente() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
