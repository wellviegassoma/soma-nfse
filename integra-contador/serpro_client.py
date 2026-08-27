"""
Chamada de negócio ao Integra Contador — monta o envelope
(contratante/autorPedidoDados/contribuinte/pedidoDados), olha o cache
antes de gastar uma chamada de produção, e loga toda chamada real em
`integra_contador_requests_log` (cache hit ou não) pra dar visibilidade de
custo real vs. economizado.

Formato do envelope documentado em:
https://apicenter.estaleiro.serpro.gov.br/pt/quick_start/
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests

import cache
from catalogo import ServicoDesconhecidoError, obter_servico
from serpro_auth import forcar_reautenticacao, obter_tokens
from supabase_client import obter_cliente

_TIPO_PJ = 2


class ErroIntegraContador(Exception):
    pass


def _soma_cnpj() -> str:
    cnpj = os.environ.get("SOMA_CNPJ")
    if not cnpj:
        raise ErroIntegraContador("SOMA_CNPJ não configurado.")
    return cnpj


def _gateway_url() -> str:
    return os.environ.get(
        "INTEGRA_CONTADOR_GATEWAY_URL", "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1"
    )


def _logar(
    id_sistema: str, id_servico: str, contribuinte_cnpj: str, status_code: int, from_cache: bool, duracao_ms: int
) -> None:
    obter_cliente().table("integra_contador_requests_log").insert(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "id_sistema": id_sistema,
            "id_servico": id_servico,
            "contribuinte_cnpj": contribuinte_cnpj,
            "status_code": status_code,
            "from_cache": from_cache,
            "duracao_ms": duracao_ms,
        }
    ).execute()


def _chamar_gateway(rota: str, envelope: dict, tentativa_apos_401: bool = False) -> requests.Response:
    access_token, jwt_token = obter_tokens()
    resposta = requests.post(
        f"{_gateway_url()}/{rota}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "jwt_token": jwt_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json=envelope,
        timeout=60,
    )
    if resposta.status_code == 401 and not tentativa_apos_401:
        # Token expirou entre a checagem em memória e agora — reautentica 1x e tenta de novo.
        forcar_reautenticacao()
        return _chamar_gateway(rota, envelope, tentativa_apos_401=True)
    return resposta


def chamar(id_sistema: str, id_servico: str, contribuinte_cnpj: str, dados: dict[str, Any]) -> dict:
    try:
        servico = obter_servico(id_sistema, id_servico)
    except ServicoDesconhecidoError as e:
        raise ErroIntegraContador(str(e))
    inicio = time.monotonic()

    cacheado = cache.buscar(id_sistema, id_servico, contribuinte_cnpj, dados, servico.cache_ttl_segundos)
    if cacheado is not None:
        _logar(
            id_sistema, id_servico, contribuinte_cnpj, cacheado["status"], True, int((time.monotonic() - inicio) * 1000)
        )
        return cacheado["resposta"]

    envelope = {
        "contratante": {"numero": _soma_cnpj(), "tipo": _TIPO_PJ},
        "autorPedidoDados": {"numero": _soma_cnpj(), "tipo": _TIPO_PJ},
        "contribuinte": {"numero": contribuinte_cnpj, "tipo": _TIPO_PJ},
        "pedidoDados": {
            "idSistema": servico.id_sistema,
            "idServico": servico.id_servico,
            "versaoSistema": servico.versao_sistema,
            "dados": json.dumps(dados, separators=(",", ":")),
        },
    }

    resposta = _chamar_gateway(servico.rota, envelope)
    if not resposta.ok:
        _logar(
            id_sistema, id_servico, contribuinte_cnpj, resposta.status_code, False, int((time.monotonic() - inicio) * 1000)
        )
        raise ErroIntegraContador(
            f"Serpro respondeu HTTP {resposta.status_code} para {id_sistema}.{id_servico} "
            f"(contribuinte {contribuinte_cnpj}): {resposta.text[:1000]}"
        )
    corpo = resposta.json()

    cache.salvar(id_sistema, id_servico, contribuinte_cnpj, dados, corpo, resposta.status_code)
    _logar(id_sistema, id_servico, contribuinte_cnpj, resposta.status_code, False, int((time.monotonic() - inicio) * 1000))
    return corpo
