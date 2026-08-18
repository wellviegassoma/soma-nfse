"""Interpreta a resposta do Sefin Nacional (sucesso ou erro) e a normaliza
para o formato interno usado pelo notas_fiscais.service.
"""

from __future__ import annotations


def parse_response(raw_response: dict) -> dict:
    """Retorna {status, nfse_number, access_key, xml, danfse_url} ou levanta
    nfse_engine.errors.SefinError com a mensagem técnica original."""
    raise NotImplementedError("Fase C: parser.parse_response")
