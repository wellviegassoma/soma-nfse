"""
Autenticação interna deste serviço — igual ao padrão já usado em
backend/auth.py (nfse-engine): sem domínio público, mas exige um token
compartilhado em todo request como segunda camada de defesa.
"""

import os

from fastapi import Header, HTTPException, status


def exigir_token_interno(x_internal_token: str = Header(default="")) -> None:
    token_esperado = os.environ.get("INTEGRA_CONTADOR_INTERNAL_TOKEN")
    if not token_esperado:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTEGRA_CONTADOR_INTERNAL_TOKEN não configurado no servidor.",
        )
    if x_internal_token != token_esperado:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token interno inválido.")
