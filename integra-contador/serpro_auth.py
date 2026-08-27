"""
Autenticação OAuth2 + mTLS na Serpro (Integra Contador) — obtém e cacheia
access_token/jwt_token em memória do processo (uma instância Railway, sem
necessidade de ida ao Supabase a cada chamada de negócio). Reautentica
automaticamente quando o token expira ou o gateway responde 401 — só
nesse momento o certificado da SOMA é decifrado de novo.

Fluxo documentado em:
https://apicenter.estaleiro.serpro.gov.br/pt/quick_start/
"""

from __future__ import annotations

import base64
import os
import threading
import time

import requests

from certificado import limpar_certificado_temporario
from certificado_escritorio import obter_certificado_temporario

_MARGEM_SEGURANCA_SEGUNDOS = 30


class ErroAutenticacaoSerpro(Exception):
    pass


_lock = threading.Lock()
_cache: dict[str, object] = {}


def _autenticar() -> dict:
    # .strip() porque colar do painel da Serpro costuma trazer espaço/quebra
    # de linha junto, o que quebra o parser de Basic Auth do lado deles.
    consumer_key = os.environ["INTEGRA_CONTADOR_CONSUMER_KEY"].strip()
    consumer_secret = os.environ["INTEGRA_CONTADOR_CONSUMER_SECRET"].strip()
    auth_url = os.environ.get(
        "INTEGRA_CONTADOR_AUTH_URL", "https://autenticacao.sapi.serpro.gov.br/authenticate"
    )
    basic = base64.b64encode(f"{consumer_key}:{consumer_secret}".encode("utf-8")).decode("ascii")

    cert_path, key_path = obter_certificado_temporario()
    try:
        resposta = requests.post(
            auth_url,
            headers={
                "Authorization": f"Basic {basic}",
                "role-type": "TERCEIROS",
                "content-type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
            cert=(cert_path, key_path),
            timeout=30,
        )
    finally:
        limpar_certificado_temporario(cert_path, key_path)

    if resposta.status_code != 200:
        raise ErroAutenticacaoSerpro(
            f"Falha ao autenticar na Serpro (HTTP {resposta.status_code}): {resposta.text[:500]}"
        )

    payload = resposta.json()
    payload["_obtido_em"] = time.monotonic()
    return payload


def obter_tokens() -> tuple[str, str]:
    """Retorna (access_token, jwt_token) válidos, reautenticando se preciso."""
    with _lock:
        expirado = "access_token" not in _cache or time.monotonic() >= (
            _cache["_obtido_em"] + _cache["expires_in"] - _MARGEM_SEGURANCA_SEGUNDOS
        )
        if expirado:
            _cache.clear()
            _cache.update(_autenticar())
        return _cache["access_token"], _cache["jwt_token"]


def forcar_reautenticacao() -> None:
    with _lock:
        _cache.clear()
