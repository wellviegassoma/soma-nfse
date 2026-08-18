"""Erros do motor de NFS-e.

NFSeError carrega a mensagem técnica crua (para nfse_errors/logs do painel SOMA)
separada da mensagem amigável exibida ao cliente — o front nunca deve renderizar
`technical_message` diretamente (ver docs/spec.md, seção "Se der erro").
"""

from __future__ import annotations


class NFSeError(Exception):
    def __init__(self, technical_message: str, user_message: str = "Não foi possível emitir esta nota."):
        self.technical_message = technical_message
        self.user_message = user_message
        super().__init__(technical_message)


class ValidationError(NFSeError):
    """XML não bate com o XSD antes de ser assinado."""


class SigningError(NFSeError):
    """Falha ao assinar (certificado inválido/vencido, XMLDSig, etc.)."""


class SefinError(NFSeError):
    """Sefin Nacional recusou ou não respondeu a requisição."""
