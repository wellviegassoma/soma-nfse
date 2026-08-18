"""Cliente HTTP (mTLS com o certificado do cliente) para a API do Sefin Nacional."""

from __future__ import annotations


def send_dps(signed_xml: str, *, ambiente: str) -> dict:
    """Envia a DPS assinada e retorna a resposta crua do Sefin Nacional."""
    raise NotImplementedError("Fase C: client.send_dps")


def cancel_nfse(access_key: str, *, reason: str, ambiente: str) -> dict:
    raise NotImplementedError("Fase D: client.cancel_nfse")
