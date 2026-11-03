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
    # Sociedade uniprofissional: o Nota Carioca pede a quantidade pra emitir.
    quantidade_profissionais: Optional[int] = None
    # Reabre a guia uniprofissional já emitida do mês (nunca emite).
    uniprofissional_existente: bool = False
    # Matriz × filial quando o certificado enxerga as duas inscrições no Rio.
    filial: Optional[bool] = None
    # Só leitura: devolve a estrutura da tela de guias (ou da página
    # `diagnostico_pagina`, relativa a /contribuinte/) em vez do PDF.
    diagnostico: bool = False
    diagnostico_pagina: Optional[str] = None
    # Ids a marcar/clicar na página antes de descrevê-la (nunca emitir).
    diagnostico_cliques: Optional[list[str]] = None
