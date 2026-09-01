"""
Autenticação interna deste serviço — mesmo padrão do nfse-engine
(backend/auth.py), token compartilhado próprio (NOTA_CARIOCA_INTERNAL_TOKEN),
não reaproveita o token do nfse-engine de propósito (serviços isolados).
"""

import os

from fastapi import Header, HTTPException, status


def exigir_token_interno(x_internal_token: str = Header(default="")) -> None:
    token_esperado = os.environ.get("NOTA_CARIOCA_INTERNAL_TOKEN")
    if not token_esperado:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="NOTA_CARIOCA_INTERNAL_TOKEN não configurado no servidor.",
        )
    if x_internal_token != token_esperado:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token interno inválido.")
