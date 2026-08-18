"""Assina o XML da DPS (XMLDSig + canonicalização C14N) com o certificado A1
do cliente. O certificado só existe descriptografado em memória durante a
assinatura — nunca em disco, nunca logado (ver docs/spec.md, "Como vamos
guardar certificados").
"""

from __future__ import annotations


def sign_xml(xml: str, *, certificate_bytes: bytes, certificate_password: str) -> str:
    """Retorna o XML assinado. Levanta nfse_engine.errors.SigningError em falha."""
    raise NotImplementedError("Fase C: signer.sign_xml")
