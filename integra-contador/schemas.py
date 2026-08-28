from __future__ import annotations

from pydantic import BaseModel


class ExtratoDasOut(BaseModel):
    contribuinte_cnpj: str
    numero_das: str
    resposta: dict


class DeclaracoesPeriodoOut(BaseModel):
    contribuinte_cnpj: str
    periodo_apuracao: str
    resposta: dict


class SituacaoFiscalOut(BaseModel):
    contribuinte_cnpj: str
    resposta: dict


class ChamarServicoIn(BaseModel):
    id_sistema: str
    id_servico: str
    dados: dict = {}


class ChamarServicoOut(BaseModel):
    contribuinte_cnpj: str
    id_sistema: str
    id_servico: str
    resposta: dict


class CndOut(BaseModel):
    contribuinte_cnpj: str
    resposta: dict


class DeclararPgdasIn(BaseModel):
    dados: dict


class DeclararPgdasOut(BaseModel):
    contribuinte_cnpj: str
    resposta: dict


class GerarDasOut(BaseModel):
    contribuinte_cnpj: str
    periodo_apuracao: str
    resposta: dict
