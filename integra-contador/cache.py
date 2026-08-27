"""
Cache de respostas do Integra Contador — cada requisição de produção tem
custo real, então nada é chamado de novo enquanto o cache pra aquele
(serviço, contribuinte, payload) ainda estiver dentro do TTL definido em
catalogo.py.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase_client import obter_cliente


def calcular_hash(dados: dict[str, Any]) -> str:
    canonico = json.dumps(dados, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def buscar(
    id_sistema: str, id_servico: str, contribuinte_cnpj: str, dados: dict[str, Any], ttl_segundos: int
) -> dict | None:
    limite = (datetime.now(timezone.utc) - timedelta(seconds=ttl_segundos)).isoformat()
    resposta = (
        obter_cliente()
        .table("integra_contador_cache")
        .select("resposta,status")
        .eq("id_sistema", id_sistema)
        .eq("id_servico", id_servico)
        .eq("contribuinte_cnpj", contribuinte_cnpj)
        .eq("dados_hash", calcular_hash(dados))
        .gte("fetched_at", limite)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    return resposta.data[0] if resposta.data else None


def salvar(
    id_sistema: str,
    id_servico: str,
    contribuinte_cnpj: str,
    dados: dict[str, Any],
    resposta_corpo: dict,
    status_code: int,
) -> None:
    obter_cliente().table("integra_contador_cache").upsert(
        {
            "id_sistema": id_sistema,
            "id_servico": id_servico,
            "contribuinte_cnpj": contribuinte_cnpj,
            "dados_hash": calcular_hash(dados),
            "resposta": resposta_corpo,
            "status": status_code,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="id_sistema,id_servico,contribuinte_cnpj,dados_hash",
    ).execute()
