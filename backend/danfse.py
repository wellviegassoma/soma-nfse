"""
danfse.py

Gera o DANFSe (Documento Auxiliar da NFS-e) em PDF a partir do XML da
NFS-e, reproduzindo o layout do DANFSe v2.0 que o próprio portal nacional
(nfse.gov.br) emite: mesma grade de 4 colunas, mesmas posições, fontes,
áreas cinza, logo oficial e rodapé de cientificação — tudo em UMA página A4.

As medidas (em pontos, origem no canto superior esquerdo) foram tiradas de
um DANFSe oficial emitido pelo portal em 10/11/2026. Os valores calculados
(ISSQN, IBS/CBS, líquido) vêm da parte da NFS-e devolvida pelo governo
(infNFSe), nunca são recalculados aqui.

Logo oficial da NFS-e Nacional (gov.br/nfse, licença CC BY-ND 3.0 — uso
permitido sem modificar a imagem) em assets/logo-nfse.png.
"""

from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Optional

from lxml import etree
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as rl_canvas

import dps_builder as db

NS = "http://www.sped.fazenda.gov.br/nfse"

PASTA_ASSETS = Path(__file__).parent / "assets"
CAMINHO_LOGO = PASTA_ASSETS / "logo-nfse.png"
CAMINHO_MUNICIPIOS = PASTA_ASSETS / "municipios_ibge.json"  # opcional: {"5103403": ["Cuiabá", "MT"], ...}

# --- Geometria do DANFSe oficial (pontos; y cresce pra baixo) ---------
LARGURA_PAGINA, ALTURA_PAGINA = A4  # 595 x 842
X0, X1 = 8.5, 586.8
COLUNAS = [8.5, 153.1, 297.6, 442.2, 586.8]
RECUO = 3.4  # texto começa 3,4 pt depois da linha da coluna
CINZA = colors.Color(0.949, 0.949, 0.949)
FONTE, FONTE_NEGRITO = "Helvetica", "Helvetica-Bold"
ASCENDENTE = 0.905  # topo da caixa do texto -> linha de base (Arial/Helvetica)
ALTURA_LINHA_CAMPO = 19.2
ENTRELINHA_VALOR = 8.0
Y_RODAPE = 795.8

DESCRICAO_TP_RET_PISCOFINS = {
    "0": "0 - PIS/COFINS/CSLL Não Retidos",
    "1": "1 - PIS/COFINS Retidos",
    "2": "2 - PIS/COFINS Não Retidos",
    "3": "3 - PIS/COFINS/CSLL Retidos",
    "4": "4 - PIS/COFINS Retidos, CSLL Não Retido",
    "5": "5 - PIS Retido, COFINS/CSLL Não Retido",
    "6": "6 - COFINS Retido, PIS/CSLL Não Retido",
    "7": "7 - PIS Não Retido, COFINS/CSLL Retidos",
    "8": "8 - PIS/COFINS Não Retidos, CSLL Retido",
    "9": "9 - COFINS Não Retido, PIS/CSLL Retidos",
}
DESCRICAO_REGIME_ESPECIAL = {str(k): v for k, v in db.REGIME_ESPECIAL_TRIBUTACAO_DESCRICAO.items()}
DESCRICAO_SIMPLES = {"1": "Não optante", "2": "Optante - Microempreendedor Individual (MEI)", "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)"}
DESCRICAO_REGIME_SN = {
    "1": "Regime de apuração dos tributos federais e municipal pelo SN",
    "2": "Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme respectiva legislação municipal do tributo",
    "3": "Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo",
}
DESCRICAO_TRIB_ISSQN = {"1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência"}
DESCRICAO_RET_ISSQN = {"1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário"}
DESCRICAO_EMITENTE = {"1": "Prestador", "2": "Tomador", "3": "Intermediário"}
DESCRICAO_FINALIDADE = {"0": "NFS-e regular"}


class ErroDanfse(Exception):
    pass


# --- Leitura do XML ----------------------------------------------------

def _no(pai, caminho: str):
    if pai is None:
        return None
    return pai.find("/".join(f"{{{NS}}}{p}" for p in caminho.split("/")))


def _t(pai, caminho: str) -> str:
    el = _no(pai, caminho)
    return el.text.strip() if el is not None and el.text else ""


# --- Formatação (igual ao portal) ---------------------------------------

def _doc(d: str) -> str:
    d = "".join(c for c in (d or "") if c.isdigit())
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return d or "-"


def _cep(c: str) -> str:
    d = "".join(ch for ch in (c or "") if ch.isdigit())
    return f"{d[:2]}.{d[2:5]}-{d[5:]}" if len(d) == 8 else (c or "-")


def _ibge(c: str) -> str:
    d = "".join(ch for ch in (c or "") if ch.isdigit())
    return f"{d[:2]}.{d[2:]}" if len(d) == 7 else (c or "-")


def _fone(f: str) -> str:
    d = "".join(c for c in (f or "") if c.isdigit())
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return f or "-"


def _pontuado(codigo: str, grupos: list) -> str:
    d = "".join(c for c in (codigo or "") if c.isdigit())
    if not d or sum(grupos) != len(d):
        return codigo or "-"
    partes, pos = [], 0
    for g in grupos:
        partes.append(d[pos:pos + g])
        pos += g
    return ".".join(partes)


def _data(iso: str, so_data: bool = False) -> str:
    if not iso:
        return "-"
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    return dt.strftime("%d/%m/%Y" if so_data else "%d/%m/%Y %H:%M:%S")


def _num(v) -> Optional[float]:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _moeda(v) -> str:
    n = _num(v)
    if n is None:
        return "-"
    return "R$ " + f"{n:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _pct(v) -> str:
    n = _num(v)
    return "-" if n is None else f"{n:.2f}".replace(".", ",") + " %"


def _v(v) -> str:
    return v if v not in (None, "") else "-"


# --- Município (nome / UF) a partir do código IBGE ----------------------

@lru_cache(maxsize=1)
def _tabela_municipios() -> dict:
    try:
        return json.loads(CAMINHO_MUNICIPIOS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@lru_cache(maxsize=512)
def _municipio_por_cep(cep: str) -> Optional[tuple]:
    d = "".join(c for c in (cep or "") if c.isdigit())
    if len(d) != 8:
        return None
    try:
        with urllib.request.urlopen(f"https://viacep.com.br/ws/{d}/json/", timeout=4) as r:
            j = json.loads(r.read())
        if j.get("erro"):
            return None
        return j.get("localidade"), j.get("uf")
    except Exception:
        return None


def _municipio(cmun: str, conhecidos: dict, cep: str = "") -> str:
    """'Cidade / UF'. Usa nomes que já vêm no XML, depois a tabela IBGE
    (assets/municipios_ibge.json, se houver) e por último o ViaCEP pelo CEP."""
    if not cmun:
        return "-"
    if cmun in conhecidos:
        return conhecidos[cmun]
    tab = _tabela_municipios().get(cmun)
    if tab:
        return f"{tab[0]} / {tab[1]}"
    via = _municipio_por_cep(cep)
    if via and via[0]:
        return f"{via[0]} / {via[1]}"
    return cmun


# --- Desenho -----------------------------------------------------------

class _Pagina:
    def __init__(self, c: rl_canvas.Canvas):
        self.c = c

    def _y(self, topo: float, tamanho: float) -> float:
        return ALTURA_PAGINA - (topo + tamanho * ASCENDENTE)

    def texto(self, x: float, topo: float, s: str, tamanho: float = 7, negrito: bool = False, centro: bool = False):
        self.c.setFont(FONTE_NEGRITO if negrito else FONTE, tamanho)
        if centro:
            self.c.drawCentredString(x, self._y(topo, tamanho), s)
        else:
            self.c.drawString(x, self._y(topo, tamanho), s)

    def linhas_quebradas(self, s: str, largura: float, tamanho: float = 7) -> list:
        """Quebra o texto em linhas que caibam na largura (por palavra)."""
        saida = []
        for paragrafo in (s or "").split("\n"):
            atual = ""
            for palavra in paragrafo.split(" "):
                tentativa = f"{atual} {palavra}".strip()
                if stringWidth(tentativa, FONTE, tamanho) <= largura or not atual:
                    atual = tentativa
                else:
                    saida.append(atual)
                    atual = palavra
            saida.append(atual)
        return saida or ["-"]

    def linha_h(self, y: float, x0: float = X0, x1: float = X1, espessura: float = 0.5):
        self.c.setLineWidth(espessura)
        self.c.line(x0, ALTURA_PAGINA - y, x1, ALTURA_PAGINA - y)

    def faixa_cinza(self, x0: float, y0: float, x1: float, y1: float):
        self.c.setFillColor(CINZA)
        self.c.rect(x0, ALTURA_PAGINA - y1, x1 - x0, y1 - y0, stroke=0, fill=1)
        self.c.setFillColor(colors.black)


def _largura_celula(col: int, span: int) -> float:
    return COLUNAS[min(col + span, 4)] - COLUNAS[col] - 2 * RECUO


def gerar_danfse_pdf(xml_nfse: str, caminho_saida: str, cancelada: bool = False) -> str:
    """Gera o PDF do DANFSe (uma página A4) a partir do XML da NFS-e.
    `cancelada=True` só muda a situação e põe a marca d'água — o XML é o
    documento autorizado original e nunca é alterado."""
    try:
        raiz = etree.fromstring(xml_nfse.encode("utf-8") if isinstance(xml_nfse, str) else xml_nfse)
    except Exception as e:
        raise ErroDanfse(f"Não consegui ler o XML da NFS-e para gerar o DANFSe: {e}")
    inf = raiz.find(f"{{{NS}}}infNFSe") if raiz.tag != f"{{{NS}}}infNFSe" else raiz
    if inf is None:
        raise ErroDanfse("XML da NFS-e não tem o elemento infNFSe esperado.")

    emit = _no(inf, "emit")
    end_emit = _no(emit, "enderNac")
    inf_dps = _no(inf, "DPS/infDPS")
    prest = _no(inf_dps, "prest")
    reg_trib = _no(prest, "regTrib")
    toma = _no(inf_dps, "toma")
    end_toma = _no(toma, "end")
    interm = _no(inf_dps, "interm")
    serv = _no(inf_dps, "serv")
    trib = _no(inf_dps, "valores/trib")
    trib_mun = _no(trib, "tribMun")
    trib_fed = _no(trib, "tribFed")
    piscofins = _no(trib_fed, "piscofins")
    ibs_dps = _no(inf_dps, "IBSCBS")
    ibs_nfse = _no(inf, "IBSCBS")
    valores_nfse = _no(inf, "valores")

    chave = inf.get("Id", "").replace("NFS", "")
    uf_emit = _t(end_emit, "UF")
    x_loc_emi = _t(inf, "xLocEmi")
    # Nomes de município que já vêm no próprio XML (código -> "Nome / UF").
    conhecidos = {}
    if _t(end_emit, "cMun") and x_loc_emi:
        conhecidos[_t(end_emit, "cMun")] = f"{x_loc_emi} / {uf_emit or '-'}"

    def _loc(cod: str, nome: str) -> str:
        if not cod and not nome:
            return "-"
        uf = conhecidos.get(cod, " / -").split(" / ")[-1] if cod in conhecidos else (
            (_tabela_municipios().get(cod) or [None, "-"])[1]
        )
        return f"{nome or cod} / {uf or '-'} / -"

    numero = _t(inf, "nNFSe")
    Path(caminho_saida).parent.mkdir(parents=True, exist_ok=True)
    pdf = rl_canvas.Canvas(caminho_saida, pagesize=A4)
    pdf.setTitle(f"DANFSe {numero}")
    pg = _Pagina(pdf)

    # Moldura externa
    pdf.setLineWidth(1)
    pdf.rect(5, 5, LARGURA_PAGINA - 10, ALTURA_PAGINA - 10)

    # --- Cabeçalho ---
    pg.faixa_cinza(X0, 5.7, X1, 39.7)
    pg.linha_h(39.9)
    if CAMINHO_LOGO.exists():
        pdf.drawImage(str(CAMINHO_LOGO), 11.9, ALTURA_PAGINA - 33.24, width=115.65, height=22.92)
    else:
        pg.texto(11.9, 14, "NFS-e", 14, True)
    pg.texto(297.65, 12.6, "DANFSe v2.0", 9, True, centro=True)
    pg.texto(297.65, 23.0, "Documento Auxiliar da NFS-e", 9, True, centro=True)
    pg.texto(445.6, 11.4, f"Município: {x_loc_emi or '-'} - {uf_emit or '-'}", 8)
    pg.texto(445.6, 20.4, f"Ambiente Gerador: {_v(_t(inf, 'ambGer'))}", 6)
    pg.texto(445.6, 27.2, f"Tipo de Ambiente: {_v(_t(inf_dps, 'tpAmb'))}", 6)

    # --- Chave, números e QR ---
    pg.texto(11.9, 44.7, "CHAVE DE ACESSO DA NFS-e", 7, True)
    pg.texto(11.9, 52.5, chave or "-", 7)
    widget = qr.QrCodeWidget(f"https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave}")
    b = widget.getBounds()
    esc = 45.0 / (b[2] - b[0])
    desenho = Drawing(45, 45, transform=[esc, 0, 0, esc, 0, 0])
    desenho.add(widget)
    renderPDF.draw(desenho, pdf, 491.99, ALTURA_PAGINA - 89.76)
    for i, linha in enumerate([
        "A autenticidade desta NFS-e pode ser verificada",
        "pela leitura deste código QR ou pela consulta da",
        "chave de acesso no portal nacional da NFS-e",
    ]):
        pg.texto(445.6, 91.9 + 6.8 * i, linha, 6)

    pg.faixa_cinza(X0, 105.1, COLUNAS[1], 125.3)
    situacao = "NFS-e Cancelada" if cancelada else "NFS-e Gerada"
    blocos = [
        [("NÚMERO DA NFS-e", _v(numero)), ("COMPETÊNCIA DA NFS-e", _data(_t(inf_dps, "dCompet"), True)),
         ("DATA E HORA DA EMISSÃO DA NFS-e", _data(_t(inf, "dhProc")))],
        [("NÚMERO DA DPS", _v(_t(inf_dps, "nDPS"))), ("SÉRIE DA DPS", _v(_t(inf_dps, "serie"))),
         ("DATA E HORA DA EMISSÃO DA DPS", _data(_t(inf_dps, "dhEmi")))],
        [("EMITENTE DA NFS-e", DESCRICAO_EMITENTE.get(_t(inf_dps, "tpEmit") or "1", "Prestador")),
         ("SITUAÇÃO DA NFS-e", situacao),
         ("FINALIDADE", DESCRICAO_FINALIDADE.get(_t(ibs_dps, "finNFSe") or "0", "NFS-e regular"))],
    ]
    for i, linha in enumerate(blocos):
        topo = 64.9 + 20.2 * i
        for col, (rot, val) in enumerate(linha):
            pg.texto(COLUNAS[col] + RECUO, topo, rot, 7, True)
            pg.texto(COLUNAS[col] + RECUO, topo + 7.8, val, 7)

    # --- Motor de seções (4 colunas, como no portal) ---
    y = 125.6

    def secao(titulo: str, linhas: list, linha_ate: Optional[list] = None):
        """linhas: lista de linhas; cada linha = lista de (coluna, span, rótulo, valor).
        A primeira linha tem o título na coluna 0 (fundo cinza)."""
        nonlocal y
        pg.faixa_cinza(X0, y + 0.2, COLUNAS[1], y + ALTURA_LINHA_CAMPO + 0.1)
        pg.linha_h(y)
        pg.texto(COLUNAS[0] + RECUO, y + 0.5, titulo, 7, True)
        for i, celulas in enumerate(linhas):
            # Linha só de texto (sem rótulo, ex.: "Medicina.") é mais baixa.
            altura = ALTURA_LINHA_CAMPO if any(c[2] for c in celulas) else 0
            for col, span, rot, val in celulas:
                larg = _largura_celula(col, span)
                quebradas = pg.linhas_quebradas(val, larg)
                if rot:
                    pg.texto(COLUNAS[col] + RECUO, y + 0.4, rot, 6, True)
                    base = y + 7.1
                else:
                    base = y + 0.5
                for k, s in enumerate(quebradas):
                    pg.texto(COLUNAS[col] + RECUO, base + ENTRELINHA_VALOR * k, s, 7)
                altura = max(altura, (base - y) + ENTRELINHA_VALOR * len(quebradas) + 4.1)
            y += altura

    def faixa_centro(texto: str):
        nonlocal y
        pg.linha_h(y + 0.2)
        pg.texto(297.65, y + 0.5, texto, 7, centro=True)
        y += 8.4

    # Prestador
    opsimp = _t(reg_trib, "opSimpNac")
    secao("PRESTADOR / FORNECEDOR", [
        [(1, 1, "CNPJ / CPF / NIF", _doc(_t(prest, "CNPJ") or _t(prest, "CPF") or _t(emit, "CNPJ") or _t(emit, "CPF"))),
         (2, 1, "Indicador Municipal (Inscrição)", _v(_t(prest, "IM") or _t(emit, "IM"))),
         (3, 1, "Telefone", _fone(_t(prest, "fone") or _t(emit, "fone")))],
        [(0, 2, "Nome / Nome Empresarial", _v(_t(emit, "xNome") or _t(prest, "xNome"))),
         (2, 1, "Município / Sigla UF", _municipio(_t(end_emit, "cMun"), conhecidos, _t(end_emit, "CEP"))),
         (3, 1, "Código IBGE / CEP", f"{_ibge(_t(end_emit, 'cMun'))} / {_cep(_t(end_emit, 'CEP'))}")],
        [(0, 2, "Endereço", ", ".join(p for p in (_t(end_emit, "xLgr"), _t(end_emit, "nro"), _t(end_emit, "xCpl"), _t(end_emit, "xBairro")) if p) or "-"),
         (2, 2, "E-mail", _v(_t(prest, "email") or _t(emit, "email")))],
        [(0, 1, "Simples Nacional na Data de Competência", DESCRICAO_SIMPLES.get(opsimp, "-")),
         (1, 3, "Regime de Apuração Tributária pelo SN", DESCRICAO_REGIME_SN.get(_t(reg_trib, "regApTribSN"), "-") if opsimp == "3" else "-")],
    ])

    # Tomador
    if toma is not None:
        end_nac_toma = _no(end_toma, "endNac")
        end_ext_toma = _no(end_toma, "endExt")
        cmun_toma = _t(end_nac_toma, "cMun")
        cep_toma = _t(end_nac_toma, "CEP")
        mun_toma = _municipio(cmun_toma, conhecidos, cep_toma) if cmun_toma else (
            f"{_t(end_ext_toma, 'xCidade')} / {_t(end_ext_toma, 'cPais')}" if end_ext_toma is not None else "-"
        )
        secao("TOMADOR / ADQUIRENTE", [
            [(1, 1, "CNPJ / CPF / NIF", _doc(_t(toma, "CNPJ") or _t(toma, "CPF") or _t(toma, "NIF"))),
             (2, 1, "Indicador Municipal (Inscrição)", _v(_t(toma, "IM"))),
             (3, 1, "Telefone", _fone(_t(toma, "fone")))],
            [(0, 2, "Nome / Nome Empresarial", _v(_t(toma, "xNome"))),
             (2, 1, "Município / Sigla UF", mun_toma),
             (3, 1, "Código IBGE / CEP", f"{_ibge(cmun_toma)} / {_cep(cep_toma)}" if cmun_toma else "-")],
            [(0, 2, "Endereço", ", ".join(p for p in (_t(end_toma, "xLgr"), _t(end_toma, "nro"), _t(end_toma, "xCpl"), _t(end_toma, "xBairro")) if p) or "-"),
             (2, 2, "E-mail", _v(_t(toma, "email")))],
        ])
    else:
        faixa_centro("TOMADOR / ADQUIRENTE NÃO IDENTIFICADO NA NFS-e")

    dest = _no(ibs_dps, "dest")
    if dest is not None:
        secao("DESTINATÁRIO DA OPERAÇÃO", [
            [(1, 1, "CNPJ / CPF / NIF", _doc(_t(dest, "CNPJ") or _t(dest, "CPF") or _t(dest, "NIF"))),
             (2, 2, "Nome / Nome Empresarial", _v(_t(dest, "xNome")))],
        ])
    else:
        faixa_centro("DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")
    if interm is not None:
        secao("INTERMEDIÁRIO DA OPERAÇÃO", [
            [(1, 1, "CNPJ / CPF / NIF", _doc(_t(interm, "CNPJ") or _t(interm, "CPF") or _t(interm, "NIF"))),
             (2, 2, "Nome / Nome Empresarial", _v(_t(interm, "xNome")))],
        ])
    else:
        faixa_centro("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")

    # Serviço
    secao("SERVIÇO PRESTADO", [
        [(1, 1, "Código de Tributação Nacional/Municipal",
          f"{_pontuado(_t(serv, 'cServ/cTribNac'), [2, 2, 2])} / {_v(_t(serv, 'cServ/cTribMun'))}"),
         (2, 1, "Código da NBS", _pontuado(_t(serv, "cServ/cNBS"), [1, 4, 2, 2]) if _t(serv, "cServ/cNBS") else "-"),
         (3, 1, "Local da Prestação / Sigla UF / País", _loc(_t(serv, "locPrest/cLocPrestacao"), _t(inf, "xLocPrestacao")))],
        [(0, 4, "", _v(_t(inf, "xTribNac")))],
        [(0, 4, "Descrição do Serviço", _v(_t(serv, "cServ/xDescServ")))],
    ])

    # Tributação municipal
    tp_ret = _t(trib_mun, "tpRetISSQN")
    secao("TRIBUTAÇÃO MUNICIPAL (ISSQN)", [
        [(1, 1, "Tipo de Tributação do ISSQN", DESCRICAO_TRIB_ISSQN.get(_t(trib_mun, "tribISSQN"), "-")),
         (2, 2, "Município / Sigla UF / País de Incidência do ISSQN", _loc(_t(inf, "cLocIncid"), _t(inf, "xLocIncid")))],
        [(0, 1, "Regime Especial de Tributação do ISSQN", DESCRICAO_REGIME_ESPECIAL.get(_t(reg_trib, "regEspTrib"), "-")),
         (1, 1, "Tipo de Imunidade do ISSQN", _v(_t(trib_mun, "tpImunidade"))),
         (2, 1, "Suspensão da Exigibilidade do ISSQN", _v(_t(trib_mun, "exigSusp/tpSusp"))),
         (3, 1, "Número Processo Suspensão", _v(_t(trib_mun, "exigSusp/nProcesso")))],
        [(0, 1, "BC ISSQN", _moeda(_t(valores_nfse, "vBC"))),
         (1, 1, "Alíquota Aplicada", _pct(_t(valores_nfse, "pAliqAplic"))),
         (2, 1, "Retenção do ISSQN", DESCRICAO_RET_ISSQN.get(tp_ret, "-")),
         (3, 1, "ISSQN Apurado", _moeda(_t(valores_nfse, "vISSQN")))],
    ])

    # Tributação federal
    secao("TRIBUTAÇÃO FEDERAL (EXCETO CBS)", [
        [(1, 1, "IRRF", _moeda(_t(trib_fed, "vRetIRRF"))),
         (2, 1, "Contribuição Previdenciária - Retida", _moeda(_t(trib_fed, "vRetCP"))),
         (3, 1, "Contribuições Sociais - Retidas", _moeda(_t(trib_fed, "vRetCSLL")))],
        [(0, 1, "PIS - Débito Apuração Própria", _moeda(_t(piscofins, "vPis"))),
         (1, 1, "COFINS - Débito Apuração Própria", _moeda(_t(piscofins, "vCofins"))),
         (2, 2, "Descrição Contrib. Sociais - Retidas",
          DESCRICAO_TP_RET_PISCOFINS.get(_t(piscofins, "tpRetPisCofins"), "-") if _t(trib_fed, "vRetCSLL") else "-")],
    ])

    # Tributação IBS/CBS
    v_serv = _num(_t(inf_dps, "valores/vServPrest/vServ"))
    v_bc_ibs = _num(_t(ibs_nfse, "valores/vBC"))
    exclusoes = (v_serv - v_bc_ibs) if v_serv is not None and v_bc_ibs is not None else None
    v_ibs = _num(_t(ibs_nfse, "totCIBS/gIBS/vIBSTot"))
    v_cbs = _num(_t(ibs_nfse, "totCIBS/gCBS/vCBS"))
    gib = _no(ibs_dps, "valores/trib/gIBSCBS")
    cst_ibs, cclass = _t(gib, "CST"), _t(gib, "cClassTrib")
    cloc = _t(ibs_nfse, "cLocalidadeIncid")
    uf_loc = conhecidos.get(cloc, "").split(" / ")[-1] if cloc in conhecidos else (_tabela_municipios().get(cloc) or [None, ""])[1]
    red = [_t(ibs_nfse, "valores/uf/pRedAliqUF"), _t(ibs_nfse, "valores/mun/pRedAliqMun"), _t(ibs_nfse, "valores/fed/pRedAliqCBS")]
    secao("TRIBUTAÇÃO IBS/CBS", [
        [(1, 1, "CST / cClassTrib", f"{cst_ibs} / {cclass}" if cst_ibs else "-"),
         (2, 2, "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF",
          " / ".join(p or "-" for p in (_t(ibs_dps, "cIndOp"), cloc, _t(ibs_nfse, "xLocalidadeIncid"), uf_loc)) if ibs_dps is not None else "-")],
        [(0, 1, "Exclusões e Reduções da Base de Cálculo", _moeda(exclusoes)),
         (1, 1, "Base de Cálculo Após Exclusões e Reduções", _moeda(v_bc_ibs)),
         (2, 1, "Red. Alíquota IBS / Red. Alíquota CBS", " / ".join(_pct(r) for r in red) if any(red) else "-"),
         (3, 1, "Alíquota - IBS UF / IBS Mun",
          f"{_pct(_t(ibs_nfse, 'valores/uf/pIBSUF'))} / {_pct(_t(ibs_nfse, 'valores/mun/pIBSMun'))}" if ibs_nfse is not None else "-")],
        [(0, 1, "Alíq. Efetiva Municipal - IBS", _pct(_t(ibs_nfse, "valores/mun/pAliqEfetMun"))),
         (1, 1, "Valor Apurado Municipal - IBS", _moeda(_t(ibs_nfse, "totCIBS/gIBS/gIBSMunTot/vIBSMun"))),
         (2, 1, "Alíq. Efetiva Estadual - IBS", _pct(_t(ibs_nfse, "valores/uf/pAliqEfetUF"))),
         (3, 1, "Valor Apurado Estadual - IBS", _moeda(_t(ibs_nfse, "totCIBS/gIBS/gIBSUFTot/vIBSUF")))],
        [(0, 1, "Valor Total Apurado - IBS", _moeda(v_ibs)),
         (1, 1, "Alíquota - CBS", _pct(_t(ibs_nfse, "valores/fed/pCBS"))),
         (2, 1, "Alíquota Efetiva - CBS", _pct(_t(ibs_nfse, "valores/fed/pAliqEfetCBS"))),
         (3, 1, "Valor Total Apurado - CBS", _moeda(v_cbs))],
    ])

    # Valor total
    v_ret = _num(_t(valores_nfse, "vTotalRet"))
    if v_ret is None:
        soma = [_num(_t(trib_fed, k)) for k in ("vRetIRRF", "vRetCP", "vRetCSLL")]
        soma = [s for s in soma if s]
        v_ret = sum(soma) if soma else None
    v_liq = _num(_t(valores_nfse, "vLiq"))
    total_ibscbs = (v_ibs or 0) + (v_cbs or 0) if (v_ibs is not None or v_cbs is not None) else None
    v_liq_ibs = _num(_t(ibs_nfse, "totCIBS/vTotNF"))
    y_valor = y
    pg.faixa_cinza(COLUNAS[3], y_valor + ALTURA_LINHA_CAMPO, X1, y_valor + 2 * ALTURA_LINHA_CAMPO - 0.1)
    secao("VALOR TOTAL DA NFS-e", [
        [(1, 1, "VALOR DA OPERAÇÃO / SERVIÇO", _moeda(v_serv)),
         (2, 1, "Desconto Incondicionado", _moeda(_t(inf_dps, "valores/vDescCondIncond/vDescIncond"))),
         (3, 1, "Desconto Condicionado", _moeda(_t(inf_dps, "valores/vDescCondIncond/vDescCond")))],
        [(0, 1, "Total das Retenções (ISSQN / Federais)", _moeda(v_ret)),
         (1, 1, "VALOR LÍQUIDO DA NFS-e", _moeda(v_liq if v_liq is not None else v_serv)),
         (2, 1, "Total do IBS/CBS", _moeda(total_ibscbs)),
         (3, 1, "VALOR LÍQUIDO DA NFS-e + IBS/CBS", _moeda(v_liq_ibs))],
    ])

    # Informações complementares
    pg.linha_h(y + 0.2)
    pg.texto(COLUNAS[0] + RECUO, y + 0.5, "INFORMAÇÕES COMPLEMENTARES", 7, True)
    p_fed = _t(trib, "totTrib/pTotTrib/pTotTribFed")
    p_est = _t(trib, "totTrib/pTotTrib/pTotTribEst")
    p_mun = _t(trib, "totTrib/pTotTrib/pTotTribMun")
    p_sn = _t(trib, "totTrib/pTotTribSN")
    if p_fed or p_est or p_mun:
        lei = (f"Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: {_pct(p_fed)}; "
               f"Estaduais: {_pct(p_est)}; Municipais: {_pct(p_mun)};")
    elif p_sn:
        lei = f"Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: {_pct(p_sn)} (Simples Nacional);"
    else:
        lei = ""
    complementos = [s for s in (_t(inf_dps, "infoCompl/xInfComp"), lei) if s]
    topo_info = y + 20.5
    limite = Y_RODAPE - 6
    for k, s in enumerate(pg.linhas_quebradas("\n".join(complementos), X1 - X0 - 2 * RECUO)):
        if topo_info + ENTRELINHA_VALOR * k > limite:
            break
        pg.texto(COLUNAS[0] + RECUO, topo_info + ENTRELINHA_VALOR * k, s, 7)

    # Rodapé de cientificação (caixas com borda de 1 pt)
    pdf.setLineWidth(1)
    for x0, x1 in ((8.5, 153.6), (153.6, 298.1), (298.1, 587.3)):
        pdf.rect(x0 + 0.5, ALTURA_PAGINA - 816.1, x1 - x0, 20.3)
    pg.texto(12.9, 796.5, "DATA CIENTIFICAÇÃO:", 6, True)
    pg.texto(157.5, 796.5, "IDENTIFICAÇÃO E ASSINATURA", 6, True)
    pg.texto(302.0, 796.5, "N° NFS-e / CHAVE NFS-e", 6, True)
    pg.texto(302.0, 803.2, f"{numero} / {chave}", 7)

    if cancelada:
        pdf.saveState()
        pdf.setFont(FONTE_NEGRITO, 90)
        pdf.setFillColor(colors.Color(0.75, 0, 0, alpha=0.28))
        pdf.translate(LARGURA_PAGINA / 2, ALTURA_PAGINA / 2)
        pdf.rotate(45)
        pdf.drawCentredString(0, 0, "CANCELADA")
        pdf.restoreState()

    pdf.showPage()
    pdf.save()
    return caminho_saida
