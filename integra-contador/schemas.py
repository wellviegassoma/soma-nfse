from __future__ import annotations

from pydantic import BaseModel


class ExtratoDasOut(BaseModel):
    contribuinte_cnpj: str
    numero_das: str
    resposta: dict
