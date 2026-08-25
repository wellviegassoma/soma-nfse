"""
relatorio.py

Gera um relatório em PDF das notas de um mês, no estilo de um relatório
de NFS-e: tabelas detalhadas de notas + resumo de totais + resumo por
código de atividade (com descrição) — sempre separando:

  1. Notas de SAÍDA (a empresa é a prestadora — emitiu para clientes) de
     notas de ENTRADA (a empresa é a tomadora — recebeu de fornecedores).
  2. Dentro de cada uma dessas, notas ATIVAS de notas CANCELADAS.

Nunca mistura essas categorias em um mesmo total.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

from codigos_atividade import descrever_codigo

MESES_NOME = [
    "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


def _fmt_moeda(valor: Optional[float]) -> str:
    if valor is None:
        return "-"
    texto = f"{valor:,.2f}"
    texto = texto.replace(",", "§").replace(".", ",").replace("§", ".")
    return f"R$ {texto}"


def _fmt_data(data: Optional[datetime]) -> str:
    return data.strftime("%d/%m/%Y") if data else "-"


def _formatar_cnpj(cnpj: str) -> str:
    d = "".join(ch for ch in (cnpj or "") if ch.isdigit())
    if len(d) != 14:
        return cnpj or "-"
    return f"{d[0:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:14]}"


def _raiz_cnpj(cnpj: Optional[str]) -> Optional[str]:
    d = re.sub(r"\D", "", cnpj or "")
    return d[:8] if len(d) >= 8 else None


def classificar_direcao(nota, cnpj_empresa: Optional[str]) -> str:
    """
    Versão pública de `_classificar_direcao`, para reuso fora deste
    módulo (ex.: coluna "Entrada/Saída" no CSV/Excel gerado em app.py) —
    mesma lógica, mesmo resultado ('saida' / 'entrada' / 'indefinida').
    """
    return _classificar_direcao(nota, _raiz_cnpj(cnpj_empresa))


def _classificar_direcao(nota, raiz_empresa: Optional[str]) -> str:
    """
    'saida'    -> a empresa é a prestadora (emitiu a nota para um cliente)
    'entrada'  -> a empresa é a tomadora (recebeu a nota de um fornecedor)
    'indefinida' -> não foi possível determinar (CNPJ não reconhecido no XML)
    """
    if not raiz_empresa:
        return "indefinida"
    if _raiz_cnpj(nota.prestador_cnpj) == raiz_empresa:
        return "saida"
    if _raiz_cnpj(nota.tomador_cnpj) == raiz_empresa:
        return "entrada"
    return "indefinida"


def _tabela_notas(notas: list, cancelada: bool, mostrar: str) -> Table:
    """
    mostrar='contraparte_tomador' -> mostra o nome do TOMADOR (uso em
        notas de saída, onde o interessante é para quem a empresa vendeu).
    mostrar='contraparte_prestador' -> mostra o nome do PRESTADOR (uso em
        notas de entrada, onde o interessante é de quem a empresa comprou).
    """
    rotulo_contraparte = "Tomador" if mostrar == "contraparte_tomador" else "Fornecedor (Prestador)"
    cabecalho = [
        "Nº", "Emissão", "Compet.", rotulo_contraparte, "Local", "Cód.Trib.\nNacional",
        "cNBS", "Alíq.\nISSQN", "Vr. ISSQN", "Vr. PIS", "Vr. COFINS",
        "Vr. Ret.\nCP", "Vr. Ret.\nIRRF", "Vr. Serviço",
    ]
    linhas = [cabecalho]
    for n in notas:
        contraparte = n.tomador_nome if mostrar == "contraparte_tomador" else n.prestador_nome
        linhas.append([
            n.numero or "-",
            _fmt_data(n.data_emissao),
            n.competencia or "-",
            (contraparte or "-")[:28],
            n.local_incidencia or "-",
            n.codigo_trib_nacional or "-",
            n.codigo_nbs or "-",
            f"{n.aliquota_issqn:.2f}%" if n.aliquota_issqn is not None else "-",
            _fmt_moeda(n.valor_issqn),
            _fmt_moeda(n.valor_pis),
            _fmt_moeda(n.valor_cofins),
            _fmt_moeda(n.valor_ret_cp),
            _fmt_moeda(n.valor_ret_irrf),
            _fmt_moeda(n.valor_servico),
        ])

    largura_total = 27.7 * cm
    proporcoes = [0.04, 0.07, 0.06, 0.16, 0.09, 0.08, 0.07, 0.05, 0.08, 0.07, 0.08, 0.07, 0.07, 0.09]
    larguras = [largura_total * p for p in proporcoes]

    tabela = Table(linhas, colWidths=larguras, repeatRows=1)
    cor_cabecalho = colors.HexColor("#7a1f1f") if cancelada else colors.HexColor("#1f3d7a")
    cor_linha_par = colors.HexColor("#fbeaea") if cancelada else colors.HexColor("#eaf0fb")

    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), cor_cabecalho),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.5),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (3, 1), (4, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, cor_linha_par]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    tabela.setStyle(TableStyle(estilo))
    return tabela


def _tabela_resumo_atividade(notas_ativas: list) -> Table:
    """Agrupa o valor do serviço por código de tributação nacional
    (cTribNac), com a descrição do código ao lado para facilitar a
    conferência. Só considera notas ATIVAS — canceladas não entram."""
    resumo: "OrderedDict[str, dict]" = OrderedDict()
    for n in notas_ativas:
        codigo = n.codigo_trib_nacional or "(sem código)"
        if codigo not in resumo:
            resumo[codigo] = {"quantidade": 0, "total": 0.0}
        resumo[codigo]["quantidade"] += 1
        resumo[codigo]["total"] += n.valor_servico or 0.0

    linhas = [["Código", "Descrição da Atividade", "Qtd.", "Faturamento"]]
    total_geral = 0.0
    for codigo, dados in sorted(resumo.items(), key=lambda kv: -kv[1]["total"]):
        descricao = descrever_codigo(codigo) if codigo != "(sem código)" else "-"
        linhas.append([codigo, descricao, str(dados["quantidade"]), _fmt_moeda(dados["total"])])
        total_geral += dados["total"]
    linhas.append(["TOTAL", "", str(len(notas_ativas)), _fmt_moeda(total_geral)])

    tabela = Table(linhas, colWidths=[2.6 * cm, 10.5 * cm, 2 * cm, 4.5 * cm])
    tabela.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3d7a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#dbe4f5")),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "CENTER"),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tabela


def _tabela_totais(notas_ativas: list) -> Table:
    total_servico = sum(n.valor_servico or 0 for n in notas_ativas)
    total_issqn = sum(n.valor_issqn or 0 for n in notas_ativas)
    total_pis = sum(n.valor_pis or 0 for n in notas_ativas)
    total_cofins = sum(n.valor_cofins or 0 for n in notas_ativas)
    total_ret_cp = sum(n.valor_ret_cp or 0 for n in notas_ativas)
    total_ret_irrf = sum(n.valor_ret_irrf or 0 for n in notas_ativas)
    total_retencoes = total_ret_cp + total_ret_irrf
    total_liquido = total_servico - total_retencoes

    tabela = Table([
        ["Valor Serviço", "ISSQN", "PIS", "COFINS", "Retenção CP", "Retenção IRRF", "Valor Líquido"],
        [
            _fmt_moeda(total_servico), _fmt_moeda(total_issqn), _fmt_moeda(total_pis),
            _fmt_moeda(total_cofins), _fmt_moeda(total_ret_cp), _fmt_moeda(total_ret_irrf),
            _fmt_moeda(total_liquido),
        ],
    ], colWidths=[3.8 * cm] * 7)
    tabela.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3d7a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return tabela


def _secao_direcao(story, titulo: str, notas_dir: list, mostrar: str, estilos_extra: dict):
    """Monta a seção completa (ativas + resumo + canceladas) para uma
    direção (saída ou entrada) e acrescenta ao `story`."""
    estilo_secao = estilos_extra["secao"]
    estilo_subsecao = estilos_extra["subsecao"]
    estilo_normal = estilos_extra["normal"]

    notas_ativas = [n for n in notas_dir if not n.cancelada]
    notas_canceladas = [n for n in notas_dir if n.cancelada]

    story.append(Paragraph(titulo, estilo_secao))

    story.append(Paragraph("Notas Ativas", estilo_subsecao))
    if notas_ativas:
        story.append(_tabela_notas(notas_ativas, cancelada=False, mostrar=mostrar))
    else:
        story.append(Paragraph("Nenhuma nota ativa nesta categoria.", estilo_normal))

    story.append(Spacer(1, 14))
    story.append(Paragraph("Resumo de Totais", estilo_subsecao))
    story.append(_tabela_totais(notas_ativas))

    story.append(Spacer(1, 14))
    story.append(Paragraph("Resumo por Código de Atividade", estilo_subsecao))
    if notas_ativas:
        story.append(_tabela_resumo_atividade(notas_ativas))
    else:
        story.append(Paragraph("Sem notas ativas para resumir.", estilo_normal))

    story.append(PageBreak())
    story.append(Paragraph(f"{titulo} — Notas Canceladas", estilo_secao))
    story.append(Paragraph(
        "As notas abaixo foram canceladas e NÃO estão incluídas em nenhum "
        "total ou resumo de faturamento desta seção.",
        estilo_normal,
    ))
    story.append(Spacer(1, 8))
    if notas_canceladas:
        story.append(_tabela_notas(notas_canceladas, cancelada=True, mostrar=mostrar))
        story.append(Spacer(1, 10))
        total_cancelado = sum(n.valor_servico or 0 for n in notas_canceladas)
        story.append(Paragraph(
            f"Valor total das notas canceladas (apenas para referência, "
            f"não soma ao faturamento): {_fmt_moeda(total_cancelado)} "
            f"em {len(notas_canceladas)} nota(s).",
            estilo_normal,
        ))
    else:
        story.append(Paragraph("Nenhuma nota cancelada nesta categoria.", estilo_normal))
    story.append(PageBreak())


def _secao_grupo_periodo(
    story, titulo_grupo: str, descricao_grupo: str, notas_grupo: list,
    raiz_empresa: Optional[str], estilos: dict, estilos_extra: dict, estilo_grupo,
) -> None:
    """
    Monta a seção completa de um dos dois grandes grupos do relatório —
    "Notas da Competência" ou "Notas emitidas no mês mas de outra
    competência (retroativas)" — com um resumo geral do grupo logo no
    início ("quadrado" com os totais) e, em seguida, o detalhamento
    completo de sempre (saída/entrada × ativas/canceladas) só com as
    notas desse grupo.
    """
    story.append(Paragraph(titulo_grupo, estilo_grupo))
    story.append(Paragraph(descricao_grupo, estilos["Normal"]))
    story.append(Spacer(1, 10))

    if not notas_grupo:
        story.append(Paragraph("Nenhuma nota nesta categoria neste mês.", estilos["Normal"]))
        story.append(PageBreak())
        return

    notas_ativas_grupo = [n for n in notas_grupo if not n.cancelada]
    story.append(Paragraph(
        f"Resumo Geral do Grupo — {len(notas_grupo)} nota(s) "
        f"({len(notas_ativas_grupo)} ativa(s))",
        estilos_extra["subsecao"],
    ))
    story.append(_tabela_totais(notas_ativas_grupo))
    story.append(Spacer(1, 18))

    notas_saida, notas_entrada, notas_indefinidas = [], [], []
    for n in notas_grupo:
        direcao = _classificar_direcao(n, raiz_empresa)
        if direcao == "saida":
            notas_saida.append(n)
        elif direcao == "entrada":
            notas_entrada.append(n)
        else:
            notas_indefinidas.append(n)

    story.append(Paragraph(
        "NOTAS DE SAÍDA — emitidas pela empresa para seus clientes", estilos_extra["secao"]
    ))
    story.append(Spacer(1, 4))
    _secao_direcao(story, "Notas de Saída", notas_saida, mostrar="contraparte_tomador", estilos_extra=estilos_extra)

    story.append(Paragraph(
        "NOTAS DE ENTRADA — recebidas de fornecedores", estilos_extra["secao"]
    ))
    story.append(Spacer(1, 4))
    _secao_direcao(story, "Notas de Entrada", notas_entrada, mostrar="contraparte_prestador", estilos_extra=estilos_extra)

    if notas_indefinidas:
        story.append(Paragraph("Notas Não Classificadas", estilos_extra["secao"]))
        story.append(Paragraph(
            "O CNPJ da empresa não bateu nem com o prestador nem com o tomador "
            "identificado nessas notas — pode ser um problema de extração do XML "
            "(tag com nome diferente do esperado) ou uma nota em que a empresa "
            "aparece como intermediária. Confira manualmente:",
            estilos["Normal"],
        ))
        story.append(Spacer(1, 8))
        story.append(_tabela_notas(notas_indefinidas, cancelada=False, mostrar="contraparte_tomador"))
        story.append(PageBreak())


def gerar_relatorio_pdf(
    caminho_saida: str,
    nome_empresa: str,
    cnpj_empresa: str,
    ano: int,
    mes: int,
    notas: list,
) -> None:
    """
    Gera o PDF em `caminho_saida`. `notas` deve conter TODAS as notas do
    mês (ativas e canceladas, saída e entrada, competência e emissão
    retroativa juntas) — a função separa tudo internamente e nunca
    mistura essas categorias nos totais.

    O relatório tem dois grandes grupos, nessa ordem:
      1. Notas cuja COMPETÊNCIA é {mes}/{ano} (n.bate_competencia=True) —
         o grupo "normal", que fecha com a apuração fiscal do mês.
      2. Notas EMITIDAS em {mes}/{ano} mas com competência de outro mês
         (n.bate_competencia=False) — notas emitidas com data
         retroativa, mostradas à parte para não distorcer o fechamento
         do mês corrente.
    Dentro de cada grupo, a estrutura de sempre se repete (saída/entrada
    × ativas/canceladas).
    """
    raiz_empresa = _raiz_cnpj(cnpj_empresa)

    notas_competencia = [n for n in notas if n.bate_competencia]
    notas_retroativas = [n for n in notas if not n.bate_competencia]

    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=landscape(A4),
        leftMargin=1 * cm, rightMargin=1 * cm, topMargin=1 * cm, bottomMargin=1 * cm,
    )
    estilos = getSampleStyleSheet()
    estilo_titulo = ParagraphStyle("TituloRelatorio", parent=estilos["Title"], fontSize=15, spaceAfter=2)
    estilo_subtitulo = ParagraphStyle(
        "Subtitulo", parent=estilos["Normal"], fontSize=10, textColor=colors.HexColor("#444444"),
    )
    estilo_grupo = ParagraphStyle(
        "GrupoPeriodo", parent=estilos["Heading1"], fontSize=16, spaceBefore=4, spaceAfter=6,
        textColor=colors.HexColor("#1f3d7a"),
    )
    estilos_extra = {
        "secao": ParagraphStyle("SecaoDirecao", parent=estilos["Heading2"], fontSize=13, spaceBefore=8, spaceAfter=6),
        "subsecao": ParagraphStyle("SubsecaoDirecao", parent=estilos["Heading3"], fontSize=10.5, spaceBefore=8, spaceAfter=4),
        "normal": estilos["Normal"],
    }

    story = []

    story.append(Paragraph("Relatório de NFS-e — Notas do Mês", estilo_titulo))
    story.append(Paragraph(f"{nome_empresa} · {_formatar_cnpj(cnpj_empresa)}", estilo_subtitulo))
    story.append(Paragraph(
        f"Mês pesquisado: {MESES_NOME[mes]}/{ano} &nbsp;|&nbsp; Total de {len(notas)} nota(s): "
        f"{len(notas_competencia)} de competência {MESES_NOME[mes]}/{ano}, "
        f"{len(notas_retroativas)} emitida(s) no mês com competência de outro mês (retroativas)"
        f" &nbsp;|&nbsp; Gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M:%S')}",
        estilo_subtitulo,
    ))
    story.append(Spacer(1, 16))

    _secao_grupo_periodo(
        story,
        titulo_grupo=f"GRUPO 1 — NOTAS DA COMPETÊNCIA {MESES_NOME[mes].upper()}/{ano}",
        descricao_grupo=(
            f"Notas cuja competência é {MESES_NOME[mes]}/{ano} — este é o grupo que "
            "fecha a apuração fiscal do mês, independente de quando a nota foi de fato emitida."
        ),
        notas_grupo=notas_competencia,
        raiz_empresa=raiz_empresa, estilos=estilos, estilos_extra=estilos_extra, estilo_grupo=estilo_grupo,
    )

    _secao_grupo_periodo(
        story,
        titulo_grupo=(
            f"GRUPO 2 — NOTAS EMITIDAS EM {MESES_NOME[mes].upper()}/{ano} "
            "REFERENTES A OUTRA COMPETÊNCIA (RETROATIVAS)"
        ),
        descricao_grupo=(
            f"Notas emitidas dentro de {MESES_NOME[mes]}/{ano}, mas com competência de um mês "
            "diferente (emissão com data retroativa). NÃO somam ao fechamento da competência "
            f"{MESES_NOME[mes]}/{ano} — aparecem aqui só para conferência de que foram emitidas."
        ),
        notas_grupo=notas_retroativas,
        raiz_empresa=raiz_empresa, estilos=estilos, estilos_extra=estilos_extra, estilo_grupo=estilo_grupo,
    )

    doc.build(story)
