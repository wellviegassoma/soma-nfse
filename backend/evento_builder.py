"""
evento_builder.py

Monta o XML do Pedido de Registro de Evento — hoje só o cancelamento de
NFS-e (evento e101101). Estrutura confirmada contra o XSD oficial
(tiposEventos v1.01 / pedRegEvento v1.01, mesmo namespace da DPS:
http://www.sped.fazenda.gov.br/nfse) e contra uma implementação de
terceiros já em produção (nfse-php) que usa exatamente esse leiaute e
esse endpoint — ver sefin_nacional_client.enviar_evento.

IMPORTANTE: ao contrário do dps_builder (validado byte a byte contra
notas reais aceitas), este módulo NUNCA foi testado contra um
cancelamento real aceito pelo Sefin Nacional. A estrutura vem de fontes
externas (XSD público + lib de terceiros), não de um exemplo real da
SOMA. Teste com cuidado.

Domínio de cMotivo (TSCodJustCanc): 1 = Erro na Emissão; 2 = Serviço não
Prestado; 9 = Outros.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


class ErroDadosEvento(Exception):
    pass


def _somente_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def _escapar(texto: str) -> str:
    if texto is None:
        return ""
    texto = str(texto)
    texto = "".join(ch for ch in texto if ch == "\t" or ord(ch) >= 0x20)
    return (
        texto.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


@dataclass
class DadosCancelamento:
    chave_nfse: str  # chNFSe — 50 dígitos
    autor_documento: str  # CNPJ ou CPF do autor do evento (prestador, tomador ou intermediário)
    motivo_codigo: str  # cMotivo — "1", "2" ou "9"
    motivo_descricao: str  # xMotivo — texto livre explicando o motivo (15 a 255 caracteres)
    data_evento: datetime
    ambiente_producao: bool = True


CMOTIVO_VALIDOS = {"1", "2", "9"}


def montar_id_pedido_registro_evento(chave_nfse: str) -> str:
    """TSIdPedRegEvt: "PRE" + chave da NFS-e (50 dígitos) + código do
    evento (101101 para cancelamento) — confirmado contra o XSD oficial
    e uma implementação de terceiros (nfse-php), que usa exatamente este
    formato: idPedReg = 'PRE'.chNFSe.'101101'."""
    return f"PRE{chave_nfse}101101"


def gerar_xml_evento_cancelamento(dados: DadosCancelamento) -> tuple[str, str]:
    """Monta o XML (ainda não assinado) do pedido de registro de evento
    de cancelamento (e101101). Retorna (xml, id_do_elemento_a_assinar) —
    o Id é do elemento <infPedReg>, mesmo padrão usado para assinar
    <infDPS> na emissão (ver xml_signer.assinar_elemento)."""
    chave = _somente_digitos(dados.chave_nfse)
    if len(chave) != 50:
        raise ErroDadosEvento(f"Chave de acesso da NFS-e inválida (esperado 50 dígitos, veio {len(chave)}).")

    if dados.motivo_codigo not in CMOTIVO_VALIDOS:
        raise ErroDadosEvento(
            f"Código de motivo de cancelamento inválido: {dados.motivo_codigo!r}. "
            "Use 1 (Erro na Emissão), 2 (Serviço não Prestado) ou 9 (Outros)."
        )
    if not (15 <= len(dados.motivo_descricao or "") <= 255):
        raise ErroDadosEvento("A descrição do motivo precisa ter entre 15 e 255 caracteres.")

    documento = _somente_digitos(dados.autor_documento)
    if len(documento) == 14:
        autor_tag, autor_valor = "CNPJAutor", documento
    elif len(documento) == 11:
        autor_tag, autor_valor = "CPFAutor", documento
    else:
        raise ErroDadosEvento(f"Documento do autor do evento inválido: {dados.autor_documento!r}.")

    id_pedido = montar_id_pedido_registro_evento(chave)
    tp_amb = "1" if dados.ambiente_producao else "2"
    dh_evento = dados.data_evento.strftime("%Y-%m-%dT%H:%M:%S-03:00")

    xml_evento = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<pedRegEvento versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">'
        f'<infPedReg Id="{id_pedido}">'
        f"<tpAmb>{tp_amb}</tpAmb>"
        "<verAplic>BuscadorNFSe_1.0</verAplic>"
        f"<dhEvento>{dh_evento}</dhEvento>"
        f"<{autor_tag}>{autor_valor}</{autor_tag}>"
        f"<chNFSe>{chave}</chNFSe>"
        "<e101101>"
        "<xDesc>Cancelamento de NFS-e</xDesc>"
        f"<cMotivo>{dados.motivo_codigo}</cMotivo>"
        f"<xMotivo>{_escapar(dados.motivo_descricao)}</xMotivo>"
        "</e101101>"
        "</infPedReg>"
        "</pedRegEvento>"
    )
    return xml_evento, id_pedido
