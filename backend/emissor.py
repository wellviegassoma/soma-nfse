"""
emissor.py

Orquestra a emissão de uma NFS-e de ponta a ponta:
  1. Monta o XML da DPS (dps_builder)
  2. Assina digitalmente (xml_signer)
  3. Envia ao Sefin Nacional (sefin_nacional_client)
  4. Interpreta o resultado

Adaptado do emissor.py original (C:\\nfse_app) para rodar como serviço na
nuvem: não depende mais de clientes.py/nuvem.py (cadastro e certificado
agora vivem no alterdata-api) — recebe todos os dados do prestador
diretamente por parâmetro, e um caminho de certificado .pfx já resolvido
localmente (ver certificado_temp.py, chamado pela camada HTTP antes desta
função). O resto da lógica (dps_builder, xml_signer, sefin_nacional_client)
é EXATAMENTE o mesmo código já validado contra notas reais aceitas — não
foi reescrito.
"""

from __future__ import annotations

import gzip
import base64
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import dps_builder as db
import evento_builder as eb
import xml_signer as xs
from certificado import carregar_certificado_pfx, limpar_certificado_temporario, ErroCertificado
from sefin_nacional_client import ClienteSefinNacional, ErroSefinNacional

_FUSO_BRASILIA = timezone(timedelta(hours=-3))


def agora_brasilia() -> datetime:
    """
    `datetime.now()` sozinho devolve o horário LOCAL do processo — que no
    Railway é UTC, não Brasília. `dps_builder.montar_xml_dps` grava esse
    valor com sufixo fixo "-03:00" (dhEmi), então usar `datetime.now()`
    cru declarava um instante 3h no FUTURO em relação ao momento real de
    processamento — a Receita rejeitava com
    "A data de emissão da DPS não pode ser posterior à data do seu
    processamento" (achado real, erro E0008, recorrente em produção).
    """
    return datetime.now(_FUSO_BRASILIA)


def extrair_xml_da_resposta(resposta: dict) -> Optional[str]:
    """
    Extrai o XML da NFS-e de uma resposta do Sefin Nacional, que pode vir
    de duas formas: texto puro (campos "nfseXml"/"xml"/"arquivo") ou
    compactado em GZIP + base64 (campo "nfseXmlGZipB64", confirmado como
    o formato real de resposta) — mesma lógica usada no envio, só que ao
    contrário.
    """
    texto_puro = resposta.get("nfseXml") or resposta.get("xml") or resposta.get("arquivo")
    if texto_puro:
        return texto_puro

    compactado_b64 = resposta.get("nfseXmlGZipB64") or resposta.get("xmlGZipB64")
    if compactado_b64:
        try:
            bytes_gzip = base64.b64decode(compactado_b64)
            return gzip.decompress(bytes_gzip).decode("utf-8")
        except Exception as e:
            raise ValueError(
                f"O campo com o XML compactado foi encontrado, mas não consegui "
                f"descompactar: {e}"
            )

    return None


class ErroEmissao(Exception):
    """Erro ao longo do processo de emissão — a mensagem já vem pronta
    para mostrar ao usuário, indicando em qual etapa falhou."""
    pass


@dataclass
class DadosPrestadorEmissao:
    """Equivalente aos campos de emissão do antigo clientes.Cliente —
    agora vindos do ConfiguracaoNfse do alterdata-api, via requisição."""
    codigo_municipio_ibge: str
    cnpj: str
    ambiente: str
    inscricao_municipal: Optional[str] = None
    telefone_emissor: Optional[str] = None
    email_emissor: Optional[str] = None
    opcao_simples_nacional: int = 3
    regime_apuracao_simples: int = 1
    regime_especial_tributacao: int = 0
    serie_dps: str = "00001"


@dataclass
class ResultadoEmissao:
    sucesso: bool
    numero_dps: int
    id_dps: str
    xml_dps_assinado: str
    chave_acesso: Optional[str] = None
    xml_nfse: Optional[str] = None
    resposta_bruta: Optional[dict] = None
    erros: Optional[list] = None


def emitir_nota(
    prestador: DadosPrestadorEmissao,
    caminho_pfx_local: str,
    senha_certificado: str,
    tomador_documento: str,
    tomador_nome: str,
    codigo_tributacao_nacional: str,
    descricao_servico: str,
    valor_servico: float,
    numero_dps: int,
    data_competencia: Optional[date] = None,
    codigo_tributacao_municipal: Optional[str] = None,
    tomador_email: Optional[str] = None,
    tomador_cep: Optional[str] = None,
    tomador_logradouro: Optional[str] = None,
    tomador_numero: Optional[str] = None,
    tomador_complemento: Optional[str] = None,
    tomador_bairro: Optional[str] = None,
    tomador_codigo_municipio: Optional[str] = None,
    codigo_nbs: Optional[str] = None,
    tipo_retencao_issqn: int = 1,
    aliquota_issqn_informada: Optional[float] = None,
    cst_pis_cofins: str = "01",
    valor_bc_pis_cofins: Optional[float] = None,
    aliquota_pis: Optional[float] = None,
    aliquota_cofins: Optional[float] = None,
    valor_pis_proprio: Optional[float] = None,
    valor_cofins_proprio: Optional[float] = None,
    tipo_retencao_pis_cofins: int = 0,
    percentual_total_tributos_federal: Optional[float] = None,
    percentual_total_tributos_estadual: Optional[float] = None,
    percentual_total_tributos_municipal: Optional[float] = None,
    percentual_total_tributos_simples: Optional[float] = None,
    valor_retido_inss: Optional[float] = None,
    valor_retido_irrf: Optional[float] = None,
    valor_retido_contribuicoes_sociais: Optional[float] = None,
    campo_forcado_envio: Optional[str] = "dpsXmlGZipB64",
) -> ResultadoEmissao:
    """
    Emite uma nota para o `prestador` informado, prestando serviço para o
    tomador informado. `numero_dps` deve vir já resolvido (incremento
    atômico feito pelo alterdata-api antes de chamar este serviço).

    Levanta ErroEmissao com uma mensagem clara em qualquer etapa que
    falhar (dados incompletos, certificado, assinatura, ou rejeição do
    Sefin Nacional).
    """
    dados_dps = db.DadosDPS(
        codigo_municipio_emissor=prestador.codigo_municipio_ibge,
        serie=prestador.serie_dps or "00001",
        numero_dps=numero_dps,
        data_emissao=agora_brasilia(),
        data_competencia=data_competencia or agora_brasilia().date(),
        prestador=db.DadosPrestador(
            cnpj=prestador.cnpj,
            inscricao_municipal=prestador.inscricao_municipal,
            telefone=prestador.telefone_emissor,
            email=prestador.email_emissor,
            regime=db.RegimeTributario(
                opcao_simples_nacional=prestador.opcao_simples_nacional,
                regime_apuracao_simples=prestador.regime_apuracao_simples,
                regime_especial_tributacao=prestador.regime_especial_tributacao,
            ),
        ),
        tomador=db.DadosTomador(
            documento=tomador_documento, nome=tomador_nome, email=tomador_email,
            endereco_codigo_municipio=tomador_codigo_municipio or prestador.codigo_municipio_ibge,
            endereco_cep=tomador_cep, endereco_logradouro=tomador_logradouro,
            endereco_numero=tomador_numero, endereco_complemento=tomador_complemento,
            endereco_bairro=tomador_bairro,
        ),
        servico=db.DadosServico(
            codigo_tributacao_nacional=codigo_tributacao_nacional,
            codigo_tributacao_municipal=codigo_tributacao_municipal,
            descricao=descricao_servico,
            valor_servico=valor_servico,
            codigo_nbs=codigo_nbs,
        ),
        tributacao=db.DadosTributacao(
            tipo_retencao_issqn=tipo_retencao_issqn,
            aliquota_issqn_informada=aliquota_issqn_informada,
            cst_pis_cofins=cst_pis_cofins,
            valor_bc_pis_cofins=valor_bc_pis_cofins,
            aliquota_pis=aliquota_pis,
            aliquota_cofins=aliquota_cofins,
            valor_pis_proprio=valor_pis_proprio,
            valor_cofins_proprio=valor_cofins_proprio,
            tipo_retencao_pis_cofins=tipo_retencao_pis_cofins,
            percentual_total_tributos_federal=percentual_total_tributos_federal,
            percentual_total_tributos_estadual=percentual_total_tributos_estadual,
            percentual_total_tributos_municipal=percentual_total_tributos_municipal,
            percentual_total_tributos_simples=percentual_total_tributos_simples,
            valor_retido_inss=valor_retido_inss,
            valor_retido_irrf=valor_retido_irrf,
            valor_retido_contribuicoes_sociais=valor_retido_contribuicoes_sociais,
        ),
        ambiente_producao=(prestador.ambiente == "producao"),
    )

    try:
        xml_dps, id_dps = db.gerar_xml_dps(dados_dps)
    except db.ErroDadosDPS as e:
        raise ErroEmissao(f"Dados inválidos para montar a DPS: {e}")

    # --- Assinar ---
    try:
        chave_privada, cert_der, cadeia_der = xs.carregar_chave_e_certificado_de_pfx(
            caminho_pfx_local, senha_certificado
        )
    except xs.ErroAssinatura as e:
        raise ErroEmissao(f"Erro ao abrir o certificado para assinar: {e}")

    try:
        xml_assinado = xs.assinar_elemento(xml_dps, id_dps, chave_privada, cert_der, cadeia_der)
    except Exception as e:
        raise ErroEmissao(f"Erro ao assinar a DPS: {e}")

    # --- Enviar ao Sefin Nacional (mTLS) ---
    cert_path, key_path = None, None
    try:
        cert_path, key_path = carregar_certificado_pfx(caminho_pfx_local, senha_certificado)
    except ErroCertificado as e:
        raise ErroEmissao(f"Erro ao preparar o certificado para conexão: {e}")

    try:
        with ClienteSefinNacional(cert_path, key_path, ambiente=prestador.ambiente) as sefin:
            try:
                resposta = sefin.enviar_dps(xml_assinado, campo_forcado=campo_forcado_envio)
            except ErroSefinNacional as e:
                return ResultadoEmissao(
                    sucesso=False,
                    numero_dps=numero_dps,
                    id_dps=id_dps,
                    xml_dps_assinado=xml_assinado,
                    erros=e.detalhes or [str(e)],
                    resposta_bruta=None,
                )
    finally:
        if cert_path and key_path:
            limpar_certificado_temporario(cert_path, key_path)

    chave_acesso = (
        resposta.get("chaveAcesso") or resposta.get("chave_acesso") or resposta.get("chave")
    )
    xml_nfse = extrair_xml_da_resposta(resposta)

    return ResultadoEmissao(
        sucesso=True,
        numero_dps=numero_dps,
        id_dps=id_dps,
        xml_dps_assinado=xml_assinado,
        chave_acesso=chave_acesso,
        xml_nfse=xml_nfse,
        resposta_bruta=resposta,
    )


@dataclass
class ResultadoCancelamento:
    sucesso: bool
    chave_nfse: str
    xml_evento_assinado: str
    resposta_bruta: Optional[dict] = None
    erros: Optional[list] = None


def cancelar_nota(
    ambiente: str,
    caminho_pfx_local: str,
    senha_certificado: str,
    chave_nfse: str,
    autor_documento: str,
    motivo_codigo: str,
    motivo_descricao: str,
) -> ResultadoCancelamento:
    """
    Solicita o cancelamento (evento e101101) de uma NFS-e já emitida.

    ATENÇÃO: ao contrário de emitir_nota, essa função NUNCA foi validada
    contra um cancelamento real aceito pelo Sefin Nacional (ver
    evento_builder.py) — a estrutura vem de fontes externas confiáveis
    (XSD oficial + implementação de terceiros em produção), não de um
    exemplo real da SOMA. Trate o primeiro uso com cautela redobrada.
    """
    try:
        xml_evento, id_pedido = eb.gerar_xml_evento_cancelamento(
            eb.DadosCancelamento(
                chave_nfse=chave_nfse,
                autor_documento=autor_documento,
                motivo_codigo=motivo_codigo,
                motivo_descricao=motivo_descricao,
                data_evento=agora_brasilia(),
                ambiente_producao=(ambiente == "producao"),
            )
        )
    except eb.ErroDadosEvento as e:
        raise ErroEmissao(f"Dados inválidos para o cancelamento: {e}")

    try:
        chave_privada, cert_der, cadeia_der = xs.carregar_chave_e_certificado_de_pfx(
            caminho_pfx_local, senha_certificado
        )
    except xs.ErroAssinatura as e:
        raise ErroEmissao(f"Erro ao abrir o certificado para assinar: {e}")

    try:
        xml_assinado = xs.assinar_elemento(xml_evento, id_pedido, chave_privada, cert_der, cadeia_der)
    except Exception as e:
        raise ErroEmissao(f"Erro ao assinar o evento de cancelamento: {e}")

    cert_path, key_path = None, None
    try:
        cert_path, key_path = carregar_certificado_pfx(caminho_pfx_local, senha_certificado)
    except ErroCertificado as e:
        raise ErroEmissao(f"Erro ao preparar o certificado para conexão: {e}")

    try:
        with ClienteSefinNacional(cert_path, key_path, ambiente=ambiente) as sefin:
            try:
                resposta = sefin.enviar_evento(chave_nfse, xml_assinado)
            except ErroSefinNacional as e:
                return ResultadoCancelamento(
                    sucesso=False,
                    chave_nfse=chave_nfse,
                    xml_evento_assinado=xml_assinado,
                    erros=e.detalhes or [str(e)],
                    resposta_bruta=None,
                )
    finally:
        if cert_path and key_path:
            limpar_certificado_temporario(cert_path, key_path)

    return ResultadoCancelamento(
        sucesso=True,
        chave_nfse=chave_nfse,
        xml_evento_assinado=xml_assinado,
        resposta_bruta=resposta,
    )
