"""Modelos Pydantic dos requests/responses da API HTTP do nfse-engine."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel


class CertificadoIn(BaseModel):
    """Certificado do cliente, em memória — nunca gravado em disco além
    do arquivo temporário de curtíssima duração usado pra assinar/conectar
    (ver certificado_temp.py), sempre apagado ao final da requisição."""

    pfx_base64: str
    senha: str


class PrestadorIn(BaseModel):
    codigo_municipio_ibge: str
    cnpj: str
    ambiente: Literal["producao", "producao_restrita"] = "producao_restrita"
    inscricao_municipal: Optional[str] = None
    telefone_emissor: Optional[str] = None
    email_emissor: Optional[str] = None
    opcao_simples_nacional: int = 3
    regime_apuracao_simples: int = 1
    regime_especial_tributacao: int = 0
    serie_dps: str = "00001"


class EmitirNotaRequest(BaseModel):
    prestador: PrestadorIn
    certificado: CertificadoIn
    numero_dps: int

    tomador_documento: str
    tomador_nome: str
    tomador_email: Optional[str] = None
    tomador_cep: Optional[str] = None
    tomador_logradouro: Optional[str] = None
    tomador_numero: Optional[str] = None
    tomador_complemento: Optional[str] = None
    tomador_bairro: Optional[str] = None
    tomador_codigo_municipio: Optional[str] = None

    codigo_tributacao_nacional: str
    codigo_tributacao_municipal: Optional[str] = None
    codigo_nbs: Optional[str] = None
    descricao_servico: str
    valor_servico: float
    data_competencia: Optional[date] = None

    tipo_retencao_issqn: int = 1
    aliquota_issqn_informada: Optional[float] = None

    cst_pis_cofins: str = "01"
    valor_bc_pis_cofins: Optional[float] = None
    aliquota_pis: Optional[float] = None
    aliquota_cofins: Optional[float] = None
    valor_pis_proprio: Optional[float] = None
    valor_cofins_proprio: Optional[float] = None
    tipo_retencao_pis_cofins: int = 0

    percentual_total_tributos_federal: Optional[float] = None
    percentual_total_tributos_estadual: Optional[float] = None
    percentual_total_tributos_municipal: Optional[float] = None
    percentual_total_tributos_simples: Optional[float] = None

    valor_retido_inss: Optional[float] = None
    valor_retido_irrf: Optional[float] = None
    valor_retido_contribuicoes_sociais: Optional[float] = None


class EmitirNotaResponse(BaseModel):
    sucesso: bool
    numero_dps: int
    id_dps: str
    xml_dps_assinado: str
    chave_acesso: Optional[str] = None
    xml_nfse: Optional[str] = None
    erros: Optional[list[dict[str, Any]] | list[str]] = None


class CancelarNotaRequest(BaseModel):
    certificado: CertificadoIn
    ambiente: Literal["producao", "producao_restrita"] = "producao_restrita"
    chave_nfse: str
    autor_documento: str  # CNPJ ou CPF de quem está pedindo o cancelamento
    motivo_codigo: Literal["1", "2", "9"]
    motivo_descricao: str


class CancelarNotaResponse(BaseModel):
    sucesso: bool
    chave_nfse: str
    xml_evento_assinado: str
    erros: Optional[list[dict[str, Any]] | list[str]] = None


class BuscarNotasRequest(BaseModel):
    certificado: CertificadoIn
    ambiente: Literal["producao", "producao_restrita"] = "producao_restrita"
    ano: int
    mes: int
    nsu_inicial: int = 0
    max_lotes: int = 2000
    # 0 = só o mês (ano, mes) informado (comportamento original). N>0 =
    # janela de N+1 meses terminando em (ano, mes) — usado na busca de
    # histórico (ex.: "últimos 12 meses" = meses_anteriores=11).
    meses_anteriores: int = 0
    # CNPJ do contribuinte cujas notas estão sendo consultadas — o app
    # desktop original SEMPRE envia esse parâmetro (mesmo consultando com
    # o certificado da própria empresa); API de distribuição retornou 403
    # num teste real sem ele, mesmo com raiz de CNPJ batendo com o
    # certificado.
    cnpj_consulta: Optional[str] = None


class NotaEncontradaOut(BaseModel):
    nsu: str
    chave_acesso: Optional[str] = None
    data_emissao: Optional[datetime] = None
    xml: str
    prestador_cnpj: Optional[str] = None
    tomador_cnpj: Optional[str] = None
    valor: Optional[str] = None
    numero: Optional[str] = None
    competencia: Optional[str] = None
    tomador_nome: Optional[str] = None
    prestador_nome: Optional[str] = None
    descricao_servico: Optional[str] = None
    local_incidencia: Optional[str] = None
    codigo_trib_nacional: Optional[str] = None
    codigo_nbs: Optional[str] = None
    aliquota_issqn: Optional[float] = None
    valor_servico: Optional[float] = None
    valor_issqn: Optional[float] = None
    valor_pis: Optional[float] = None
    valor_cofins: Optional[float] = None
    valor_ret_cp: Optional[float] = None
    valor_ret_irrf: Optional[float] = None
    cancelada: bool = False
    motivo_cancelamento: Optional[str] = None
    bate_competencia: bool = True


class DiagnosticoBuscaOut(BaseModel):
    total_documentos_vistos: int = 0
    documentos_sem_xml_decodificavel: int = 0
    documentos_sem_data_reconhecida: int = 0
    documentos_com_data_fora_do_mes: int = 0
    resumo_texto: str


class BuscarNotasResponse(BaseModel):
    notas: list[NotaEncontradaOut]
    ultimo_nsu: int
    diagnostico: DiagnosticoBuscaOut


class DanfseRequest(BaseModel):
    xml_nfse: str
    cancelada: bool = False


class RelatorioFaturamentoRequest(BaseModel):
    nome_empresa: str
    cnpj_empresa: str
    ano: int
    mes: int
    notas: list[NotaEncontradaOut]


class ParametrosServicoRequest(BaseModel):
    certificado: CertificadoIn
    ambiente: Literal["producao", "producao_restrita"] = "producao_restrita"
    codigo_municipio: str
    codigo_servico: str
