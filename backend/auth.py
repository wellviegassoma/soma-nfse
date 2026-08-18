"""
Autenticação interna do nfse-engine — o serviço não tem domínio público
(fica só na rede privada do Railway), mas ainda exige um token
compartilhado em todo request, como segunda camada de defesa. Só o
alterdata-api conhece o valor de NFSE_ENGINE_INTERNAL_TOKEN.
"""

import os

from fastapi import Header, HTTPException, status


def exigir_token_interno(x_internal_token: str = Header(default="")) -> None:
    token_esperado = os.environ.get("NFSE_ENGINE_INTERNAL_TOKEN")
    if not token_esperado:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="NFSE_ENGINE_INTERNAL_TOKEN não configurado no servidor.",
        )
    if x_internal_token != token_esperado:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token interno inválido.")
