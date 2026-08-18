"""Valida o XML da DPS contra o XSD oficial do Sefin Nacional antes de assinar."""

from __future__ import annotations


def validate_xml(xml: str) -> None:
    """Levanta nfse_engine.errors.ValidationError se o XML não bater com o XSD."""
    raise NotImplementedError("Fase C: validator.validate_xml")
