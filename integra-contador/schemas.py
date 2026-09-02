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


class ReciboDeclaracaoOut(BaseModel):
    contribuinte_cnpj: str
    periodo_apuracao: str
    resposta: dict


class ListarApuracoesMitOut(BaseModel):
    contribuinte_cnpj: str
    ano_apuracao: int
    mes_apuracao: int | None
    resposta: dict


class ConsultarApuracaoMitOut(BaseModel):
    contribuinte_cnpj: str
    id_apuracao: int
    resposta: dict


class DeclararMitIn(BaseModel):
    dados: dict


class DeclararMitOut(BaseModel):
    contribuinte_cnpj: str
    resposta: dict


class SituacaoEncerramentoMitOut(BaseModel):
    contribuinte_cnpj: str
    protocolo_encerramento: str
    resposta: dict


class GerarGuiaDctfWebOut(BaseModel):
    contribuinte_cnpj: str
    ano_pa: str
    mes_pa: str
    resposta: dict


class ConsultarXmlDctfWebOut(BaseModel):
    contribuinte_cnpj: str
    ano_pa: str
    mes_pa: str
    resposta: dict
