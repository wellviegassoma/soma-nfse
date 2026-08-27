"""
Situação Fiscal (Integra-Sitfis) — fluxo de duas etapas com espera
assíncrona, diferente do padrão simples de request/resposta dos outros
serviços do catálogo. Por isso não usa serpro_client.chamar() genérico:

1. SOLICITARPROTOCOLO91 (rota Apoiar — não bilhetado) — pede um protocolo.
2. RELATORIOSITFIS92 (rota Emitir — bilhetado) — usa o protocolo pra pedir
   o relatório; se ainda estiver processando, responde 202 (tempoEspera no
   corpo) ou 204 (tempoEspera no header ETag, formato "tempoEspera:4000")
   — nos dois casos, espera o tempo indicado e tenta de novo, até um
   limite total de espera.

Exige a procuração eletrônica código 00002 ("Situação Fiscal do
Contribuinte") no e-CAC — diferente do código 00146 usado pelo PGDAS-D.

Documentado em:
https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sitfis/sitfis/
"""

from __future__ import annotations

import json
import time
from typing import Any

import cache
from serpro_client import _TIPO_PJ, _chamar_gateway, _logar, _soma_cnpj

_ID_SISTEMA = "SITFIS"
_ID_SERVICO_RELATORIO = "RELATORIOSITFIS92"
_VERSAO = "2.0"
_CACHE_TTL_SEGUNDOS = 24 * 60 * 60  # relatório de situação fiscal não muda de hora em hora
_MAX_ESPERA_TOTAL_SEGUNDOS = 60
_TEMPO_ESPERA_PADRAO_MS = 5000


class ErroSitfis(Exception):
    pass


def _envelope(id_servico: str, contribuinte_cnpj: str, dados_str: str) -> dict[str, Any]:
    return {
        "contratante": {"numero": _soma_cnpj(), "tipo": _TIPO_PJ},
        "autorPedidoDados": {"numero": _soma_cnpj(), "tipo": _TIPO_PJ},
        "contribuinte": {"numero": contribuinte_cnpj, "tipo": _TIPO_PJ},
        "pedidoDados": {
            "idSistema": _ID_SISTEMA,
            "idServico": id_servico,
            "versaoSistema": _VERSAO,
            "dados": dados_str,
        },
    }


def _solicitar_protocolo(contribuinte_cnpj: str) -> str:
    envelope = _envelope("SOLICITARPROTOCOLO91", contribuinte_cnpj, "")
    resposta = _chamar_gateway("Apoiar", envelope)
    if not resposta.ok:
        raise ErroSitfis(
            f"Falha ao solicitar protocolo de situação fiscal de {contribuinte_cnpj} "
            f"(HTTP {resposta.status_code}): {resposta.text[:1000]}"
        )
    corpo = resposta.json()
    dados = json.loads(corpo["dados"]) if corpo.get("dados") else {}
    protocolo = dados.get("protocoloRelatorio")
    if not protocolo:
        raise ErroSitfis(f"Serpro não devolveu protocoloRelatorio pra {contribuinte_cnpj}: {corpo}")
    return protocolo


def _emitir_relatorio(contribuinte_cnpj: str, protocolo: str) -> dict | None:
    """Devolve o corpo do relatório (com 'pdf' em base64) ou None se ainda estiver em processamento."""
    dados_str = json.dumps({"protocoloRelatorio": protocolo}, separators=(",", ":"))
    envelope = _envelope(_ID_SERVICO_RELATORIO, contribuinte_cnpj, dados_str)
    resposta = _chamar_gateway("Emitir", envelope)

    if resposta.status_code == 204:
        etag = resposta.headers.get("ETag", "")
        try:
            tempo_espera_ms = int(etag.rsplit(":", 1)[-1].strip('"'))
        except (ValueError, IndexError):
            tempo_espera_ms = _TEMPO_ESPERA_PADRAO_MS
        time.sleep(tempo_espera_ms / 1000)
        return None

    if not resposta.ok:
        raise ErroSitfis(
            f"Falha ao emitir relatório de situação fiscal de {contribuinte_cnpj} "
            f"(HTTP {resposta.status_code}): {resposta.text[:1000]}"
        )

    corpo = resposta.json()
    if corpo.get("status") == 202:
        dados = json.loads(corpo["dados"]) if corpo.get("dados") else {}
        time.sleep(dados.get("tempoEspera", _TEMPO_ESPERA_PADRAO_MS) / 1000)
        return None

    return corpo


def obter_situacao_fiscal(contribuinte_cnpj: str) -> dict:
    """
    Executa o fluxo completo (protocolo -> relatório, com espera/retry) e
    devolve o corpo final com o PDF em base64. Cacheia o resultado final
    (é a etapa bilhetada) — repetir a consulta no mesmo dia não gasta
    chamada nova.
    """
    inicio = time.monotonic()

    cacheado = cache.buscar(_ID_SISTEMA, _ID_SERVICO_RELATORIO, contribuinte_cnpj, {}, _CACHE_TTL_SEGUNDOS)
    if cacheado is not None:
        _logar(
            _ID_SISTEMA, _ID_SERVICO_RELATORIO, contribuinte_cnpj, cacheado["status"], True,
            int((time.monotonic() - inicio) * 1000),
        )
        return cacheado["resposta"]

    protocolo = _solicitar_protocolo(contribuinte_cnpj)

    relatorio = None
    while relatorio is None:
        if time.monotonic() - inicio > _MAX_ESPERA_TOTAL_SEGUNDOS:
            raise ErroSitfis(
                f"Relatório de situação fiscal de {contribuinte_cnpj} não ficou pronto em "
                f"{_MAX_ESPERA_TOTAL_SEGUNDOS}s — tente de novo em alguns minutos."
            )
        relatorio = _emitir_relatorio(contribuinte_cnpj, protocolo)

    cache.salvar(
        _ID_SISTEMA, _ID_SERVICO_RELATORIO, contribuinte_cnpj, {}, relatorio, relatorio.get("status", 200)
    )
    _logar(
        _ID_SISTEMA, _ID_SERVICO_RELATORIO, contribuinte_cnpj, relatorio.get("status", 200), False,
        int((time.monotonic() - inicio) * 1000),
    )
    return relatorio
