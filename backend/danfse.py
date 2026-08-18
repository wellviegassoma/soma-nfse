"""
danfse.py

Gera o DANFSe (Documento Auxiliar da NFS-e) em PDF localmente, a partir
do XML da NFS-e — o mesmo caminho usado por outras ferramentas do
mercado (confirmado observando o tráfego de uma extensão de navegador
que também gera o DANFSe localmente a partir do XML, em vez de buscar
um PDF pronto do governo, que é instável).

Layout com as mesmas seções e campos do DANFSe v2.0 oficial (cabeçalho,
prestador, tomador, serviço, tributação municipal completa, tributação
federal, tributação IBS/CBS, valor total, informações complementares e
rodapé) — usando um cabeçalho neutro próprio (não reproduz a logo/marca
oficial do governo), mas com a mesma organização e os mesmos rótulos de
campo, que são do padrão nacional público, não de uma marca específica.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from lxml import etree
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

import dps_builder as db

NS = "http://www.sped.fazenda.gov.br/nfse"

# Logo oficial da NFS-e Nacional, baixada de
# gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/logos-da-nfs-e —
# publicada sob licença Creative Commons Atribuição-SemDerivações 3.0
# (uso permitido sem modificar a imagem). Aceita tanto dentro de
# assets/ quanto na mesma pasta do danfse.py, pra reduzir chance de
# erro de onde o arquivo foi salvo.
_CANDIDATOS_LOGO = [
    Path(__file__).parent / "assets" / "logo-nfse-horizontal.png",
    Path(__file__).parent / "logo-nfse-horizontal.png",
]
CAMINHO_LOGO_OFICIAL = next((c for c in _CANDIDATOS_LOGO if c.exists()), None)

COR_CABECALHO_SECAO = colors.HexColor("#dce6ea")
COR_BORDA = colors.HexColor("#9fb3ba")
COR_DESTAQUE = colors.HexColor("#1f6f8b")

# Descrições curtas para os códigos mais comuns — usadas só como texto
# de apoio, nunca inventamos um valor que o XML não tenha.
DESCRICAO_TP_RET_PISCOFINS = {
    "0": "PIS/COFINS/CSLL Não Retidos",
    "1": "PIS e COFINS Retidos",
    "2": "PIS e COFINS Não Retidos",
    "3": "PIS, COFINS e CSLL Retidos",
    "4": "PIS e COFINS Retidos, CSLL Não Retida",
    "5": "PIS Retido, COFINS e CSLL Não Retidos",
    "6": "COFINS Retido, PIS e CSLL Não Retidos",
    "7": "PIS Não Retido, COFINS e CSLL Retidos",
    "8": "PIS e COFINS Não Retidos, CSLL Retida",
    "9": "COFINS Não Retido, PIS e CSLL Retidos",
}
DESCRICAO_REGIME_ESPECIAL = {str(k): v for k, v in db.REGIME_ESPECIAL_TRIBUTACAO_DESCRICAO.items()}
DESCRICAO_SIMPLES = {
    "1": "Não optante", "2": "Optante - MEI", "3": "Optante - ME/EPP",
}
DESCRICAO_AMB_GERADOR = {"1": "Sistema Municipal", "2": "Sefin Nacional NFS-e"}
DESCRICAO_TP_AMB = {"1": "Produção", "2": "Produção Restrita"}
DESCRICAO_CSTAT = {"100": "NFS-e regular (Autorizada)"}


class ErroDanfse(Exception):
    pass


def _t(elemento, tag: str) -> str:
    if elemento is None:
        return ""
    achado = elemento.find(f"{{{NS}}}{tag}")
    return achado.text if achado is not None and achado.text else ""


def _fmt_cpf_cnpj(documento: str) -> str:
    d = "".join(ch for ch in (documento or "") if ch.isdigit())
    if len(d) == 11:
        return f"{d[0:3]}.{d[3:6]}.{d[6:9]}-{d[9:11]}"
    if len(d) == 14:
        return f"{d[0:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:14]}"
    return documento or "-"


def _fmt_cep(cep: str) -> str:
    d = "".join(ch for ch in (cep or "") if ch.isdigit())
    return f"{d[0:5]}-{d[5:8]}" if len(d) == 8 else (cep or "-")


def _fmt_codigo_pontuado(codigo: str, grupos: list) -> str:
    """Formata um código numérico com pontos separando grupos de
    dígitos (ex: cTribNac '171901' -> '17.19.01', NBS '113022100' ->
    '1.1302.21.00'). Se o tamanho não bater com os grupos esperados,
    devolve o código original sem formatar (nunca inventa dígitos)."""
    d = "".join(ch for ch in (codigo or "") if ch.isdigit())
    if not d or sum(grupos) != len(d):
        return codigo or "-"
    partes, pos = [], 0
    for tam in grupos:
        partes.append(d[pos:pos + tam])
        pos += tam
    return ".".join(partes)


def _fmt_data(data_iso: str, so_data: bool = False) -> str:
    if not data_iso:
        return "-"
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(data_iso)
        return dt.strftime("%d/%m/%Y") if so_data else dt.strftime("%d/%m/%Y %H:%M:%S")
    except ValueError:
        return data_iso


def _fmt_moeda(texto) -> str:
    if texto in (None, ""):
        return "-"
    try:
        return f"R$ {float(texto):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    except (ValueError, TypeError):
        return str(texto)


def _v(texto) -> str:
    return texto if texto not in (None, "") else "-"


def gerar_danfse_pdf(xml_nfse: str, caminho_saida: str) -> str:
    """Gera o PDF do DANFSe a partir do XML da NFS-e (string). Retorna o
    caminho do arquivo gerado."""
    try:
        raiz = etree.fromstring(xml_nfse.encode("utf-8") if isinstance(xml_nfse, str) else xml_nfse)
    except Exception as e:
        raise ErroDanfse(f"Não consegui ler o XML da NFS-e para gerar o DANFSe: {e}")

    inf_nfse = raiz.find(f"{{{NS}}}infNFSe")
    if inf_nfse is None:
        raise ErroDanfse("XML da NFS-e não tem o elemento infNFSe esperado.")

    emit = inf_nfse.find(f"{{{NS}}}emit")
    ender_nac_emit = emit.find(f"{{{NS}}}enderNac") if emit is not None else None
    dps = inf_nfse.find(f"{{{NS}}}DPS")
    inf_dps = dps.find(f"{{{NS}}}infDPS") if dps is not None else None
    prest = inf_dps.find(f"{{{NS}}}prest") if inf_dps is not None else None
    reg_trib = prest.find(f"{{{NS}}}regTrib") if prest is not None else None
    toma = inf_dps.find(f"{{{NS}}}toma") if inf_dps is not None else None
    end_toma = toma.find(f"{{{NS}}}end") if toma is not None else None
    end_nac_toma = end_toma.find(f"{{{NS}}}endNac") if end_toma is not None else None
    serv = inf_dps.find(f"{{{NS}}}serv") if inf_dps is not None else None
    loc_prest = serv.find(f"{{{NS}}}locPrest") if serv is not None else None
    cServ = serv.find(f"{{{NS}}}cServ") if serv is not None else None
    valores_dps = inf_dps.find(f"{{{NS}}}valores") if inf_dps is not None else None
    v_serv_prest = valores_dps.find(f"{{{NS}}}vServPrest") if valores_dps is not None else None
    trib = valores_dps.find(f"{{{NS}}}trib") if valores_dps is not None else None
    trib_mun = trib.find(f"{{{NS}}}tribMun") if trib is not None else None
    trib_fed = trib.find(f"{{{NS}}}tribFed") if trib is not None else None
    piscofins = trib_fed.find(f"{{{NS}}}piscofins") if trib_fed is not None else None
    tot_trib = trib.find(f"{{{NS}}}totTrib") if trib is not None else None
    p_tot_trib = tot_trib.find(f"{{{NS}}}pTotTrib") if tot_trib is not None else None

    chave_acesso = inf_nfse.get("Id", "").replace("NFS", "")
    numero_nfse = _t(inf_nfse, "nNFSe")
    x_loc_emi = _t(inf_nfse, "xLocEmi")
    competencia = _t(inf_dps, "dCompet") if inf_dps is not None else ""
    dh_emissao_nfse = _t(inf_nfse, "dhProc")
    numero_dps = _t(inf_dps, "nDPS") if inf_dps is not None else ""
    serie_dps = _t(inf_dps, "serie") if inf_dps is not None else ""
    dh_emissao_dps = _t(inf_dps, "dhEmi") if inf_dps is not None else ""
    cstat = _t(inf_nfse, "cStat")
    amb_ger = _t(inf_nfse, "ambGer")
    tp_amb = _t(inf_dps, "tpAmb")
    x_nbs_desc = _t(inf_nfse, "xNBS")

    prestador_cnpj = _t(prest, "CNPJ") or _t(emit, "CNPJ")
    prestador_im = _t(prest, "IM")
    prestador_nome = _t(emit, "xNome")
    prestador_fone = _t(prest, "fone")
    prestador_email = _t(prest, "email")
    prestador_lgr = _t(ender_nac_emit, "xLgr")
    prestador_nro = _t(ender_nac_emit, "nro")
    prestador_bairro = _t(ender_nac_emit, "xBairro")
    prestador_cep = _t(ender_nac_emit, "CEP")
    prestador_cmun = _t(ender_nac_emit, "cMun")
    opsimp = _t(reg_trib, "opSimpNac")
    reg_esp_trib = _t(reg_trib, "regEspTrib")
    simples_desc = DESCRICAO_SIMPLES.get(opsimp, "-")
    regime_ap_desc = (
        "Regime de apuração dos tributos federais e municipal pelo Simples Nacional"
        if opsimp in ("2", "3") else "-"
    )

    tomador_doc = _t(toma, "CNPJ") or _t(toma, "CPF")
    tomador_im = _t(toma, "IM")
    tomador_nome = _t(toma, "xNome")
    tomador_email = _t(toma, "email")
    tomador_fone = _t(toma, "fone")
    tomador_lgr = _t(end_toma, "xLgr")
    tomador_nro = _t(end_toma, "nro")
    tomador_cpl = _t(end_toma, "xCpl")
    tomador_bairro = _t(end_toma, "xBairro")
    tomador_cep = _t(end_nac_toma, "CEP")
    tomador_cmun = _t(end_nac_toma, "cMun")

    ctrib_nac = _t(cServ, "cTribNac")
    ctrib_mun = _t(cServ, "cTribMun")
    x_trib_nac = _t(inf_nfse, "xTribNac")
    cnbs = _t(cServ, "cNBS")
    descricao_servico = _t(cServ, "xDescServ")
    local_prestacao = _t(loc_prest, "cLocPrestacao")

    # IMPORTANTE: BC/alíquota/valor do ISSQN NÃO vêm da DPS que o
    # prestador envia (o prestador não sabe a alíquota configurada pelo
    # município para aquele código de serviço) — vêm da RESPOSTA do
    # Sefin Nacional/prefeitura, calculados por eles, em
    # infNFSe/valores (não em infDPS/valores/trib/tribMun, que só tem a
    # indicação de tributável/retenção). Tag correta é "pAliqAplic", não
    # "pAliq" (nomes confirmados em nota real aceita — bug corrigido em
    # 12/08/2026, antes disso esses três campos sempre saíam em branco).
    valores_gerais = inf_nfse.find(f"{{{NS}}}valores")
    tp_ret_issqn = _t(trib_mun, "tpRetISSQN")
    retencao_issqn = "Retido" if tp_ret_issqn == "2" else "Não Retido"
    v_bc_issqn = _t(valores_gerais, "vBC")
    p_aliq_issqn = _t(valores_gerais, "pAliqAplic")
    v_issqn = _t(valores_gerais, "vISSQN")

    valor_servico = _t(v_serv_prest, "vServ")
    valor_liquido_el = inf_nfse.find(f"{{{NS}}}valores/{{{NS}}}vLiq")
    valor_liquido = valor_liquido_el.text if valor_liquido_el is not None and valor_liquido_el.text else valor_servico

    irrf = _t(trib_fed, "vRetIRRF")
    ret_cp = _t(trib_fed, "vRetCP")
    ret_csll = _t(trib_fed, "vRetCSLL")
    vbc_piscofins = _t(piscofins, "vBCPisCofins")
    paliq_pis = _t(piscofins, "pAliqPis")
    paliq_cofins = _t(piscofins, "pAliqCofins")
    vpis = _t(piscofins, "vPis")
    vcofins = _t(piscofins, "vCofins")
    cst_piscofins = _t(piscofins, "CST")
    tp_ret_piscofins = _t(piscofins, "tpRetPisCofins")
    desc_ret_piscofins = DESCRICAO_TP_RET_PISCOFINS.get(tp_ret_piscofins, "-")

    total_retencoes = None
    valores_retidos = [v for v in (irrf, ret_cp, ret_csll) if v]
    if valores_retidos:
        try:
            total_retencoes = sum(float(v) for v in valores_retidos)
        except ValueError:
            total_retencoes = None

    pct_fed = _t(p_tot_trib, "pTotTribFed")
    pct_est = _t(p_tot_trib, "pTotTribEst")
    pct_mun = _t(p_tot_trib, "pTotTribMun")

    # ------------------------------------------------------------------
    styles = getSampleStyleSheet()
    estilo_normal = ParagraphStyle("Normal8", parent=styles["Normal"], fontSize=7, leading=8.6)

    def celula(rotulo: str, valor: str) -> Paragraph:
        return Paragraph(f"<b>{rotulo}</b><br/>{valor if valor else '-'}", estilo_normal)

    def secao(titulo: str) -> Table:
        t = Table([[titulo]], colWidths=[19 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COR_CABECALHO_SECAO),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("BOX", (0, 0), (-1, -1), 0.6, COR_BORDA),
        ]))
        return t

    def linha_campos(pares, larguras: Optional[list] = None) -> Table:
        n = len(pares)
        larguras = larguras or [19 * cm / n] * n
        t = Table([[celula(r, v) for r, v in pares]], colWidths=larguras)
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, COR_BORDA),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, COR_BORDA),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        return t

    elementos = []

    # --- Cabeçalho (neutro — sem reproduzir logo/marca oficial) ---
    qr_widget = qr.QrCodeWidget(f"https://www.nfse.gov.br/ConsultaPublica/?chave={chave_acesso}")
    bounds = qr_widget.getBounds()
    largura_qr = bounds[2] - bounds[0]
    escala = (2.0 * cm) / largura_qr if largura_qr else 1
    desenho_qr = Drawing(2 * cm, 2 * cm, transform=[escala, 0, 0, escala, 0, 0])
    desenho_qr.add(qr_widget)

    if CAMINHO_LOGO_OFICIAL is not None:
        # Mantém a proporção original da logo (1920x389)
        largura_logo = 7.5 * cm
        altura_logo = largura_logo * (389 / 1920)
        elemento_logo = Image(str(CAMINHO_LOGO_OFICIAL), width=largura_logo, height=altura_logo)
    else:
        elemento_logo = Paragraph(
            "<b>DANFSe v2.0</b><br/>Documento Auxiliar da NFS-e",
            ParagraphStyle("TituloDoc", parent=estilo_normal, fontSize=12, leading=15, textColor=COR_DESTAQUE),
        )

    cabecalho = Table(
        [[
            elemento_logo,
            Paragraph(
                f"<b>DANFSe v2.0</b> — Documento Auxiliar da NFS-e<br/>"
                f"Município: {x_loc_emi} / RJ<br/>"
                f"Ambiente Gerador: {DESCRICAO_AMB_GERADOR.get(amb_ger, '-')}<br/>"
                f"Tipo de Ambiente: {DESCRICAO_TP_AMB.get(tp_amb, '-')}",
                ParagraphStyle("InfoTopo", parent=estilo_normal, alignment=2),
            ),
            desenho_qr,
        ]],
        colWidths=[7.7 * cm, 8.8 * cm, 2.5 * cm],
    )
    cabecalho.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (2, 0), (2, 0), "RIGHT")]))
    elementos.append(cabecalho)
    elementos.append(Spacer(1, 0.15 * cm))
    elementos.append(Paragraph(f"<b>CHAVE DE ACESSO DA NFS-e</b><br/>{chave_acesso}", estilo_normal))
    elementos.append(Spacer(1, 0.2 * cm))

    elementos.append(linha_campos([
        ("NÚMERO DA NFS-e", _v(numero_nfse)), ("COMPETÊNCIA DA NFS-e", _fmt_data(competencia, so_data=True)),
        ("DATA E HORA DA EMISSÃO DA NFS-e", _fmt_data(dh_emissao_nfse)),
    ]))
    elementos.append(linha_campos([
        ("NÚMERO DA DPS", _v(numero_dps)), ("SÉRIE DA DPS", _v(serie_dps)),
        ("DATA E HORA DA EMISSÃO DA DPS", _fmt_data(dh_emissao_dps)),
    ]))
    elementos.append(linha_campos([
        ("EMITENTE DA NFS-e", "Prestador"),
        ("SITUAÇÃO DA NFS-e", DESCRICAO_CSTAT.get(cstat, "NFS-e Gerada")),
        ("FINALIDADE", "NFS-e"),
    ]))

    # --- Prestador ---
    elementos.append(secao("PRESTADOR / FORNECEDOR"))
    elementos.append(linha_campos([
        ("CNPJ / CPF / NIF", _fmt_cpf_cnpj(prestador_cnpj)), ("Indicador Municipal (Inscrição)", _v(prestador_im)),
        ("Telefone", _v(prestador_fone)),
    ]))
    elementos.append(linha_campos([("Nome / Nome Empresarial", _v(prestador_nome))], [19 * cm]))
    elementos.append(linha_campos([
        ("Endereço", f"{prestador_lgr}, {prestador_nro}, {prestador_bairro}" if prestador_lgr else "-"),
        ("Código IBGE / CEP", f"{prestador_cmun} / {_fmt_cep(prestador_cep)}" if prestador_cmun else "-"),
    ], [12.5 * cm, 6.5 * cm]))
    elementos.append(linha_campos([("E-mail", _v(prestador_email))], [19 * cm]))
    elementos.append(linha_campos([
        ("Simples Nacional na Data da Competência", simples_desc),
        ("Regime de Apuração Tributária pelo SN", regime_ap_desc),
    ], [7 * cm, 12 * cm]))

    # --- Tomador ---
    elementos.append(secao("TOMADOR / ADQUIRENTE"))
    elementos.append(linha_campos([
        ("CNPJ / CPF / NIF", _fmt_cpf_cnpj(tomador_doc)), ("Indicador Municipal (Inscrição)", _v(tomador_im)),
        ("Telefone", _v(tomador_fone)),
    ]))
    elementos.append(linha_campos([("Nome / Nome Empresarial", _v(tomador_nome))], [19 * cm]))
    endereco_tomador = (
        f"{tomador_lgr}, {tomador_nro}" + (f", {tomador_cpl}" if tomador_cpl else "") + f", {tomador_bairro}"
        if tomador_lgr else "-"
    )
    elementos.append(linha_campos([
        ("Endereço", endereco_tomador),
        ("Código IBGE / CEP", f"{tomador_cmun} / {_fmt_cep(tomador_cep)}" if tomador_cmun else "-"),
    ], [12.5 * cm, 6.5 * cm]))
    elementos.append(linha_campos([("E-mail", _v(tomador_email))], [19 * cm]))

    # --- Serviço ---
    elementos.append(secao("SERVIÇO PRESTADO"))
    elementos.append(linha_campos([
        ("Código de Tributação Nacional / Municipal",
         f"{_fmt_codigo_pontuado(ctrib_nac, [2, 2, 2])} / {ctrib_mun or '-'}"),
        ("Código da NBS", _fmt_codigo_pontuado(cnbs, [1, 4, 2, 2]) if cnbs else "-"),
        ("Local da Prestação / Sigla UF", f"{local_prestacao} / RJ" if local_prestacao else "-"),
    ]))
    elementos.append(linha_campos([("", x_trib_nac)], [19 * cm]) if x_trib_nac else Spacer(0, 0))
    elementos.append(linha_campos([("Descrição do Serviço", descricao_servico)], [19 * cm]))

    # --- Tributação municipal (ISSQN) — seção completa ---
    # NOTA: "Tipo de Tributação do ISSQN" está fixo como "Operação
    # Tributável" (não lê <tribISSQN> do XML), e "Tipo de Imunidade" /
    # "Suspensão da Exigibilidade" sempre mostram "-" — decisão
    # deliberada, confirmada com o Wellington em 12/08/2026: nenhum
    # cliente do escritório usa isenção/imunidade/exigibilidade
    # suspensa hoje. Se algum dia precisar emitir nota nesses casos,
    # esses três campos precisam ser lidos de <tribISSQN>/campos
    # correspondentes antes de confiar no PDF gerado para esses casos.
    elementos.append(secao("TRIBUTAÇÃO MUNICIPAL (ISSQN)"))
    elementos.append(linha_campos([
        ("Tipo de Tributação do ISSQN", "Operação Tributável"),
        ("Município / Sigla UF de Incidência do ISSQN", f"{x_loc_emi} / RJ" if x_loc_emi else "-"),
    ], [9.5 * cm, 9.5 * cm]))
    elementos.append(linha_campos([
        ("Regime Especial de Tributação do ISSQN", DESCRICAO_REGIME_ESPECIAL.get(reg_esp_trib, "-")),
        ("Tipo de Imunidade do ISSQN", "-"),
        ("Suspensão da Exigibilidade do ISSQN", "-"),
    ]))
    elementos.append(linha_campos([
        ("BC ISSQN", _fmt_moeda(v_bc_issqn) if v_bc_issqn else "-"),
        ("Alíquota Aplicada", f"{p_aliq_issqn}%" if p_aliq_issqn else "-"),
        ("Retenção do ISSQN", retencao_issqn),
        ("ISSQN Apurado", _fmt_moeda(v_issqn) if v_issqn else "-"),
    ], [4.75 * cm] * 4))

    # --- Tributação federal ---
    elementos.append(secao("TRIBUTAÇÃO FEDERAL (EXCETO CBS)"))
    elementos.append(linha_campos([
        ("CST PIS/COFINS", _v(cst_piscofins)),
        ("BC PIS/COFINS", _fmt_moeda(vbc_piscofins) if vbc_piscofins else "-"),
        ("Alíquota PIS", f"{paliq_pis}%" if paliq_pis else "-"),
        ("Alíquota COFINS", f"{paliq_cofins}%" if paliq_cofins else "-"),
    ]))
    elementos.append(linha_campos([
        ("IRRF", _fmt_moeda(irrf) if irrf else "-"),
        ("Contribuição Previdenciária - Retida", _fmt_moeda(ret_cp) if ret_cp else "-"),
        ("Contribuições Sociais - Retidas", _fmt_moeda(ret_csll) if ret_csll else "-"),
    ]))
    elementos.append(linha_campos([
        ("PIS - Débito Apuração Própria", _fmt_moeda(vpis) if vpis else "-"),
        ("COFINS - Débito Apuração Própria", _fmt_moeda(vcofins) if vcofins else "-"),
        ("Descrição Contrib. Sociais - Retidas", desc_ret_piscofins),
    ]))

    # --- Tributação IBS/CBS (facultativo — em branco enquanto não for
    # obrigatório para o regime da empresa) ---
    elementos.append(secao("TRIBUTAÇÃO IBS / CBS"))
    elementos.append(linha_campos([("CST / cClassTrib", "-"), ("Indicador de Operação", "-")], [9.5 * cm, 9.5 * cm]))
    elementos.append(linha_campos([
        ("Alíq. Efetiva Municipal - IBS", "-"), ("Valor Apurado Municipal - IBS", "-"),
        ("Alíq. Efetiva Estadual - IBS", "-"), ("Valor Apurado Estadual - IBS", "-"),
    ]))
    elementos.append(linha_campos([
        ("Valor Total Apurado - IBS", "-"), ("Alíquota - CBS", "-"),
        ("Alíquota Efetiva - CBS", "-"), ("Valor Total Apurado - CBS", "-"),
    ]))

    # --- Valor total ---
    elementos.append(secao("VALOR TOTAL DA NFS-e"))
    elementos.append(linha_campos([
        ("Valor da Operação / Serviço", _fmt_moeda(valor_servico)),
        ("Desconto Incondicionado", "-"), ("Desconto Condicionado", "-"),
    ]))
    elementos.append(linha_campos([
        ("Total das Retenções (ISSQN/Federais)", _fmt_moeda(total_retencoes) if total_retencoes else "-"),
        ("Valor Líquido da NFS-e", _fmt_moeda(valor_liquido)),
    ], [9.5 * cm, 9.5 * cm]))
    # Desdobramento de totais do layout v2.0 (NT 008) — "Total do IBS/CBS"
    # e "Valor Líquido da NFS-e + IBS/CBS" ficam em branco enquanto a
    # apuração de IBS/CBS não estiver disponível para NFS-e (Nota
    # Técnica 009 foi adiada pelo Comitê Gestor em agosto/2026, sem novo
    # cronograma publicado até o momento) — campo pronto para quando a
    # obrigatoriedade entrar em vigor.
    elementos.append(linha_campos([
        ("Total do IBS/CBS", "-"),
        ("Valor Líquido da NFS-e + IBS/CBS", "-"),
    ], [9.5 * cm, 9.5 * cm]))

    # --- Informações complementares ---
    elementos.append(secao("INFORMAÇÕES COMPLEMENTARES"))
    linhas_info = []
    if cnbs:
        linhas_info.append(f"NBS: {_fmt_codigo_pontuado(cnbs, [1, 4, 2, 2])}" + (f" - {x_nbs_desc}" if x_nbs_desc else ""))
    linhas_info.append(
        f"Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: "
        f"Federais: {pct_fed or '-'}%; Estaduais: {pct_est or '-'}%; Municipais: {pct_mun or '-'}%;"
    )
    elementos.append(linha_campos([("", "<br/>".join(linhas_info))], [19 * cm]))

    elementos.append(Spacer(1, 0.3 * cm))
    elementos.append(linha_campos([
        ("DATA CIENTIFICAÇÃO", ""), ("IDENTIFICAÇÃO E ASSINATURA", ""),
        ("Nº NFS-e / CHAVE NFS-e", f"{numero_nfse} / {chave_acesso}"),
    ], [5 * cm, 8 * cm, 6 * cm]))

    elementos.append(Spacer(1, 0.2 * cm))
    elementos.append(Paragraph(
        "Documento gerado localmente a partir do XML autorizado da NFS-e — a chave de acesso "
        "acima permite conferir a autenticidade diretamente no portal nacional (nfse.gov.br). "
        "Logo NFS-e: gov.br/nfse (CC BY-ND 3.0).",
        ParagraphStyle("Rodape", parent=estilo_normal, fontSize=6, textColor=colors.grey),
    ))

    Path(caminho_saida).parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        caminho_saida, pagesize=A4,
        leftMargin=1 * cm, rightMargin=1 * cm, topMargin=1 * cm, bottomMargin=1 * cm,
    )
    doc.build(elementos)
    return caminho_saida
