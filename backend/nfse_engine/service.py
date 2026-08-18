"""Fachada do motor de NFS-e — a única coisa que o resto do backend deveria
importar de nfse_engine. Mantém builder/validator/signer/client/parser como
detalhe de implementação (ver docs/spec.md, "Stack técnica").

Uso alvo (Fase C):

    nfse = NFSeService(company)
    result = nfse.issue(customer=customer, service=service, amount=500)
"""

from __future__ import annotations

from . import builder, client, parser, signer, validator


class NFSeService:
    def __init__(self, company: dict):
        self.company = company

    def issue(self, *, customer: dict, service: dict, amount: float, description: str = ""):
        xml = builder.build_dps(
            company=self.company,
            customer=customer,
            service=service,
            amount=amount,
            description=description,
        )
        validator.validate_xml(xml)
        signed_xml = signer.sign_xml(
            xml,
            certificate_bytes=self.company["certificate_bytes"],
            certificate_password=self.company["certificate_password"],
        )
        raw_response = client.send_dps(signed_xml, ambiente=self.company["ambiente"])
        return parser.parse_response(raw_response)

    def cancel(self, *, access_key: str, reason: str):
        raw_response = client.cancel_nfse(
            access_key, reason=reason, ambiente=self.company["ambiente"]
        )
        return parser.parse_response(raw_response)
