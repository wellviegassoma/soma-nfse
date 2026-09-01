"""Modelos Pydantic do request desse serviço."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CertificadoIn(BaseModel):
    """Certificado do cliente, em memória — nunca gravado em disco (o
    Playwright aceita os bytes do PKCS12 diretamente)."""

    pfx_base64: str
    senha: str


class GuiaIssNotaCariocaRequest(BaseModel):
    certificado: CertificadoIn
    competencia: Optional[str] = None  # "YYYY-MM" — None = guia mais recente pendente
