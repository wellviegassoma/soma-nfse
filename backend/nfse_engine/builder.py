"""Monta o XML da DPS (Declaração de Prestação de Serviços) a partir dos dados
já carregados (empresa, certificado, serviço, tomador, valor) — ver
notas_fiscais.service e a sequência completa em docs/spec.md.

Fase C: portar/reimplementar a montagem do XML da DPS conforme o layout do
Sefin Nacional (schema DPS v1.00).
"""

from __future__ import annotations


def build_dps(*, company: dict, customer: dict, service: dict, amount: float, description: str) -> str:
    """Retorna o XML da DPS (ainda sem assinatura)."""
    raise NotImplementedError("Fase C: builder.build_dps")
