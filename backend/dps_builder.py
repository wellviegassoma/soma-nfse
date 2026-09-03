"""
dps_builder.py

Monta o XML da DPS (Declaração de Prestação de Serviços) a partir dos
dados informados na tela de emissão. A estrutura é baseada em três
exemplos REAIS de notas já emitidas (duas via portal EmissorWeb do
governo, uma via sistema terceirizado) — não é uma tentativa "no escuro"
de adivinhar o schema.

O que este módulo NÃO faz (por decisão deliberada, não por limitação):
  - Não calcula automaticamente alíquotas de ISSQN, retenções de PIS/
    COFINS/CSLL/INSS/IRRF, nem o percentual de tributos do Simples
    Nacional. Esses valores são informados por quem está emitindo (ou
    vêm de uma consulta separada aos parâmetros municipais) — cálculo
    tributário errado tem consequência fiscal real, e não deve ser um
    "melhor esforço" automático sem revisão de alguém da área fiscal.

Confirmado a partir dos exemplos reais:
  - Formato do Id da DPS: "DPS" + código IBGE do município (7) +
    tipo de inscrição do prestador (1) + CNPJ/CPF do prestador (14,
    CPF completado com zeros à esquerda) + série (5) + número da DPS
    (15) — validado byte a byte contra 2 notas reais diferentes.
  - Estrutura de <infDPS>: tpAmb, dhEmi, verAplic, serie, nDPS, dCompet,
    tpEmit, cLocEmi, <prest>, <toma>, <serv><locPrest>/<cServ>,
    <valores><vServPrest>/<trib>.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional


class ErroDadosDPS(Exception):
    pass


@dataclass
class RegimeTributario:
    """Dados do regime tributário do PRESTADOR. Os valores default
    (opSimpNac=3, regApTribSN=1, regEspTrib=0) refletem os dois exemplos
    reais disponíveis, ambos optantes pelo Simples Nacional — confirme
    com a contabilidade se algum cliente tiver regime diferente."""
    opcao_simples_nacional: int = 3  # 1=Não optante, 2=Optante MEI, 3=Optante ME/EPP (visto nos exemplos)
    regime_apuracao_simples: int = 1  # 1=Regime de apuração dos tributos federais e municipal pelo SN
    regime_especial_tributacao: int = 0  # 0 = Nenhum (visto nos exemplos)


# Domínio oficial do Regime Especial de Tributação (<regEspTrib> da
# DPS) — fonte única usada tanto na tela de emissão (app.py) quanto no
# PDF do DANFSe (danfse.py), pra nunca ficar dessincronizado entre os
# dois lugares.
REGIME_ESPECIAL_TRIBUTACAO_DESCRICAO: dict[int, str] = {
    0: "Nenhum",
    1: "Ato Cooperado (Cooperativa)",
    2: "Estimativa",
    3: "Microempresa Municipal",
    4: "Notário ou Registrador",
    5: "Profissional Autônomo",
    6: "Sociedade de Profissionais",
    9: "Outros",
}


@dataclass
class DadosPrestador:
    cnpj: str
    inscricao_municipal: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    regime: RegimeTributario = field(default_factory=RegimeTributario)


@dataclass
class DadosTomador:
    documento: str  # CPF (11 dígitos) ou CNPJ (14 dígitos) — detectado automaticamente
    nome: str
    email: Optional[str] = None
    # Endereço — presente em TODOS os exemplos reais de notas aceitas que
    # já vimos (mesmo não sendo estritamente obrigatório para todo
    # código de serviço). Todos opcionais, mas recomendado preencher.
    endereco_codigo_municipio: Optional[str] = None  # código IBGE, 7 dígitos
    endereco_cep: Optional[str] = None
    endereco_logradouro: Optional[str] = None
    endereco_numero: Optional[str] = None
    endereco_complemento: Optional[str] = None
    endereco_bairro: Optional[str] = None


@dataclass
class DadosServico:
    codigo_tributacao_nacional: str  # cTribNac, 6 dígitos (ex: "040101")
    descricao: str
    valor_servico: float
    codigo_tributacao_municipal: Optional[str] = None  # cTribMun — varia por município
    codigo_municipio_prestacao: Optional[str] = None  # se diferente do município de emissão
    codigo_nbs: Optional[str] = None  # cNBS — Nomenclatura Brasileira de Serviços, opcional


@dataclass
class DadosTributacao:
    """
    Campos de tributação — deliberadamente explícitos (sem cálculo
    automático de ALÍQUOTA). Preencha com base na consulta aos
    parâmetros municipais ou na orientação da contabilidade.
    """
    tributacao_issqn: int = 1  # 1 = Operação tributável (visto nos exemplos)
    tipo_retencao_issqn: int = 1  # 1=Não retido, 2=Retido pelo tomador, 3=Retido pelo intermediário

    # Alíquota do ISSQN INFORMADA PELO PRESTADOR (<pAliq> em
    # valores/trib/tribMun) — normalmente NÃO é preenchida, porque o
    # Sefin Nacional calcula e devolve a alíquota sozinho (parâmetro do
    # município). MAS existe um cenário específico em que o prestador é
    # OBRIGADO a informar: cliente optante do Simples Nacional ME/EPP
    # (opSimpNac=3) COM retenção do ISSQN (tpRetISSQN=2 ou 3) — nesse
    # caso o sistema não tem como calcular sozinho, porque a alíquota
    # efetiva do ISS dentro do Simples depende do faturamento acumulado
    # da própria empresa (RBT12), não é uma tabela do município. Nesse
    # cenário, vem do PGDAS/relatório do Simples da competência.
    #
    # Regra inversa: se NÃO houver retenção (tpRetISSQN=1), o Sefin
    # Nacional REJEITA a nota se esse campo vier preenchido (erro
    # E0625) — por isso o app só manda o campo quando ele tiver um
    # valor, nunca "0" por padrão.
    aliquota_issqn_informada: Optional[float] = None  # pAliq

    # CST do PIS/COFINS (Nota Técnica 007/2026 — vigente desde 09/02/2026).
    # "01" = Operação Tributável com Alíquota Básica, o cenário mais comum
    # para prestação de serviços de empresas no Lucro Presumido — ver
    # CST_PIS_COFINS_DESCRICAO para o domínio completo (00 a 09). "00" =
    # Nenhum, usado para empresas do SIMPLES NACIONAL (o PIS/COFINS já
    # está embutido na guia única do Simples — não se apura PIS/COFINS
    # à parte na NFS-e, então nem base nem alíquota são enviadas).
    cst_pis_cofins: str = "01"

    # Base de cálculo e alíquotas do PIS/COFINS de apuração própria —
    # NOVOS campos da NT 007/2026 (vBCPisCofins, pAliqPis, pAliqCofins).
    # Só são enviados (e só fazem sentido) para CST 01 a 07 — para CST 08
    # (sem incidência) e 09 (suspensão), o Sefin Nacional espera que
    # esses campos NÃO sejam enviados (ver gerar_xml_dps).
    valor_bc_pis_cofins: Optional[float] = None  # vBCPisCofins — normalmente igual ao valor do serviço
    aliquota_pis: Optional[float] = None  # pAliqPis (%) — ex.: 0.65 no regime cumulativo (Lucro Presumido)
    aliquota_cofins: Optional[float] = None  # pAliqCofins (%) — ex.: 3.00 no regime cumulativo (Lucro Presumido)

    # Débito de apuração própria do PIS/COFINS (vPis, vCofins) — NOVOS
    # campos da NT 007/2026. Desde a NT 007, esses campos são
    # EXCLUSIVOS para o valor devido pelo prestador (débito próprio);
    # valor RETIDO nunca entra aqui — retenção vai em vRetCSLL (ver
    # tipo_retencao_pis_cofins/valor_retido_contribuicoes_sociais).
    # Normalmente = valor_bc_pis_cofins * aliquota / 100, arredondado
    # (ver calcular_pis_cofins_proprio, que faz esse cálculo).
    valor_pis_proprio: Optional[float] = None  # vPis
    valor_cofins_proprio: Optional[float] = None  # vCofins

    tipo_retencao_pis_cofins: int = 0  # 0 = PIS/COFINS/CSLL não retidos (confirmado em nota real aceita)

    # Retenções federais — NÃO validado contra nenhuma nota real aceita
    # até agora (todos os exemplos que temos mostram "não retido" em
    # tudo). Os nomes de campo (vRetCP, vRetIRRF, vRetCSLL) e o caminho
    # dentro de <tribFed> foram confirmados na documentação oficial do
    # Comitê Gestor, mas a ORDEM exata dos elementos é uma área onde já
    # tivemos problema antes (schema é sensível a ordem) — teste com
    # cuidado redobrado em homologação antes de confiar nisso em
    # produção real.
    #
    # IMPORTANTE (NT 007/2026): desde essa nota técnica, retenção de
    # PIS e/ou COFINS NÃO tem campo próprio — vai somada dentro de
    # vRetCSLL junto com a CSLL retida (se houver), conforme o código
    # marcado em tipo_retencao_pis_cofins. Esse campo já se chamava
    # "CSLL/PIS/COFINS retidos" na tela de emissão deste app, então já
    # está alinhado com a nova regra — não precisou mudar nome.
    valor_retido_inss: Optional[float] = None  # vRetCP — Contribuição Previdenciária retida
    valor_retido_irrf: Optional[float] = None  # vRetIRRF
    valor_retido_contribuicoes_sociais: Optional[float] = None  # vRetCSLL (soma de PIS+COFINS+CSLL retidos, conforme tpRetPisCofins)

    # Percentual aproximado de tributos (Lei 12.741/2012 — "De olho no
    # imposto"). Duas formas possíveis, confirmado por exemplo real de
    # nota aceita da SOMA: percentual_total_tributos_federal/estadual/
    # municipal (formato <pTotTrib>, o que a SOMA usa de fato). O campo
    # percentual_total_tributos_simples (<pTotTribSN>) fica disponível
    # como alternativa, mas não é o formato confirmado para a SOMA.
    percentual_total_tributos_federal: Optional[float] = None
    percentual_total_tributos_estadual: Optional[float] = None
    percentual_total_tributos_municipal: Optional[float] = None
    percentual_total_tributos_simples: Optional[float] = None  # pTotTribSN, alternativa


# Domínio do CST do PIS/COFINS (Instrução Normativa RFB nº 1.009/2010,
# Tabelas II/III — o mesmo domínio usado na NFS-e nacional desde a NT
# 007/2026). CSTs 08 e 09 NÃO levam base/alíquota/valor (ver
# CST_PIS_COFINS_SEM_DETALHE, usado em gerar_xml_dps).
CST_PIS_COFINS_DESCRICAO: dict[str, str] = {
    "00": "Nenhum",
    "01": "Operação Tributável com Alíquota Básica",
    "02": "Operação Tributável com Alíquota Diferenciada",
    "03": "Operação Tributável com Alíquota por Unidade de Medida de Produto",
    "04": "Operação Tributável Monofásica - Revenda a Alíquota Zero",
    "05": "Operação Tributável por Substituição Tributária",
    "06": "Operação Tributável a Alíquota Zero",
    "07": "Operação Isenta da Contribuição",
    "08": "Operação sem Incidência da Contribuição",
    "09": "Operação com Suspensão da Contribuição",
}
CST_PIS_COFINS_SEM_DETALHE = {"00", "08", "09"}


def calcular_pis_cofins_proprio(
    valor_bc: float, aliquota_pis: float, aliquota_cofins: float
) -> tuple[float, float]:
    """
    Calcula vPis e vCofins (débito de apuração própria) a partir da
    base de cálculo e das alíquotas — arredondamento bancário
    (half-even), conforme a regra definida na Nota Técnica 007/2026
    para esses campos.

    Usa Decimal (não float puro) porque valores como 530.50 * 3.00% =
    15.915 caem exatamente na "metade" entre 15,91 e 15,92 — e o tipo
    float binário do Python representa 15.915 de forma imprecisa por
    baixo (vira algo como 15.91499999...), o que arredondaria errado
    (para 15,91 em vez do 15,92 esperado pelo Sefin Nacional). Decimal,
    construído a partir do texto do número, não tem esse problema.
    """
    from decimal import Decimal, ROUND_HALF_EVEN

    bc = Decimal(str(valor_bc))
    p_pis = Decimal(str(aliquota_pis))
    p_cofins = Decimal(str(aliquota_cofins))
    duas_casas = Decimal("0.01")
    v_pis = (bc * p_pis / 100).quantize(duas_casas, rounding=ROUND_HALF_EVEN)
    v_cofins = (bc * p_cofins / 100).quantize(duas_casas, rounding=ROUND_HALF_EVEN)
    return float(v_pis), float(v_cofins)


@dataclass
class DadosDPS:
    codigo_municipio_emissor: str  # código IBGE, 7 dígitos (Petrópolis = "3303906")
    serie: str  # 5 dígitos, ex: "00001"
    numero_dps: int
    data_emissao: datetime
    data_competencia: date
    prestador: DadosPrestador
    tomador: DadosTomador
    servico: DadosServico
    tributacao: DadosTributacao
    ambiente_producao: bool = True  # False = homologação/produção restrita
    tipo_emissao: int = 1  # 1 = Normal (visto nos exemplos)


def _somente_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def _tipo_inscricao_federal(documento: str) -> str:
    """1 = CPF, 2 = CNPJ — inferido pelo tamanho do documento (confirmado
    contra exemplo real: prestador CNPJ usa tipo '2')."""
    digitos = _somente_digitos(documento)
    if len(digitos) == 11:
        return "1"
    if len(digitos) == 14:
        return "2"
    raise ErroDadosDPS(f"Documento '{documento}' não parece CPF (11 dígitos) nem CNPJ (14 dígitos).")


def montar_id_dps(codigo_municipio: str, cnpj_prestador: str, serie: str, numero_dps: int) -> str:
    """
    Monta o identificador da DPS no formato oficial: "DPS" + código IBGE
    do município (7) + tipo de inscrição do prestador (1) + CNPJ/CPF (14)
    + série (5) + número da DPS (15). Fórmula validada byte a byte contra
    duas notas reais diferentes (ver docstring do módulo).
    """
    municipio = _somente_digitos(codigo_municipio).zfill(7)
    if len(municipio) != 7:
        raise ErroDadosDPS(f"Código de município inválido: '{codigo_municipio}' (esperado 7 dígitos).")

    tipo_insc = _tipo_inscricao_federal(cnpj_prestador)
    inscricao = _somente_digitos(cnpj_prestador).zfill(14)

    serie_fmt = _somente_digitos(serie).zfill(5)
    if len(serie_fmt) != 5:
        raise ErroDadosDPS(f"Série inválida: '{serie}' (esperado até 5 dígitos numéricos).")

    numero_fmt = str(numero_dps).zfill(15)
    if len(numero_fmt) != 15:
        raise ErroDadosDPS(f"Número da DPS muito grande: {numero_dps} (máximo 15 dígitos).")

    return f"DPS{municipio}{tipo_insc}{inscricao}{serie_fmt}{numero_fmt}"


def _escapar(texto: str) -> str:
    """Escape XML mínimo para conteúdo de texto (não usamos lxml aqui
    para manter o builder simples e fácil de revisar campo a campo — a
    montagem final passa pelo lxml na hora de assinar, que valida o XML
    de qualquer forma).

    Além do escape XML padrão, remove caracteres de controle (fora
    tab/quebra de linha) — um relato real de terceiros aponta que
    "caracteres inválidos" na descrição do serviço causam rejeição por
    erro de assinatura (E0714), um erro que normalmente não teria nada a
    ver com o conteúdo do texto. Como o padrão nacional recomenda usar a
    sequência literal "\\s\\n" em vez de quebra de linha de verdade nos
    campos de descrição, trocamos quebras de linha reais por essa
    sequência em vez de simplesmente removê-las."""
    if texto is None:
        return ""
    texto = str(texto)
    # Substitui quebras de linha reais pela sequência literal recomendada
    texto = texto.replace("\r\n", "\\s\\n").replace("\n", "\\s\\n").replace("\r", "\\s\\n")
    # Remove outros caracteres de controle (0x00-0x1F, exceto os já tratados acima)
    texto = "".join(ch for ch in texto if ch == "\t" or ord(ch) >= 0x20)
    return (
        texto
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def gerar_xml_dps(dados: DadosDPS) -> tuple[str, str]:
    """
    Gera o XML completo da <DPS> (com <infDPS> dentro, ainda SEM
    assinatura — isso é feito depois, por xml_signer.assinar_elemento).

    Retorna (xml_dps_sem_assinatura, id_da_dps) — o id é necessário para
    saber qual elemento assinar.
    """
    cnpj_prestador = _somente_digitos(dados.prestador.cnpj)
    if len(cnpj_prestador) not in (11, 14):
        raise ErroDadosDPS(
            f"Documento do prestador inválido: '{dados.prestador.cnpj}' "
            "(esperado CPF de 11 dígitos ou CNPJ de 14)."
        )

    id_dps = montar_id_dps(
        dados.codigo_municipio_emissor, cnpj_prestador, dados.serie, dados.numero_dps
    )

    doc_tomador = _somente_digitos(dados.tomador.documento)
    if len(doc_tomador) == 11:
        tag_tomador_doc = f"<CPF>{doc_tomador}</CPF>"
    elif len(doc_tomador) == 14:
        tag_tomador_doc = f"<CNPJ>{doc_tomador}</CNPJ>"
    else:
        raise ErroDadosDPS(f"Documento do tomador inválido: '{dados.tomador.documento}'.")

    codigo_municipio_prestacao = (
        dados.servico.codigo_municipio_prestacao or dados.codigo_municipio_emissor
    )
    codigo_municipio_prestacao = _somente_digitos(codigo_municipio_prestacao).zfill(7)

    prest = dados.prestador
    # A nota real aceita da SOMA sem IM cadastrada não inclui <IM> dentro
    # de <prest> — mas alguns municípios (ex.: Petrópolis/RJ) exigem a IM
    # conforme o cadastro do prestador no CNC NFS-e nacional (erro E0116
    # caso omitida quando exigida). Por isso: inclui só quando o
    # prestador tem inscricao_municipal informada.
    im_xml = f"<IM>{_escapar(prest.inscricao_municipal)}</IM>" if prest.inscricao_municipal else ""
    fone_xml = f"<fone>{_somente_digitos(prest.telefone)}</fone>" if prest.telefone else ""
    email_xml = f"<email>{_escapar(prest.email)}</email>" if prest.email else ""

    email_tomador_xml = f"<email>{_escapar(dados.tomador.email)}</email>" if dados.tomador.email else ""

    tom = dados.tomador
    end_tomador_xml = ""
    if tom.endereco_cep or tom.endereco_logradouro:
        cmun_tomador = (
            _somente_digitos(tom.endereco_codigo_municipio).zfill(7)
            if tom.endereco_codigo_municipio
            else _somente_digitos(dados.codigo_municipio_emissor).zfill(7)
        )
        cep_xml = f"<CEP>{_somente_digitos(tom.endereco_cep)}</CEP>" if tom.endereco_cep else ""
        nro_xml = f"<nro>{_escapar(tom.endereco_numero)}</nro>" if tom.endereco_numero else ""
        cpl_xml = f"<xCpl>{_escapar(tom.endereco_complemento)}</xCpl>" if tom.endereco_complemento else ""
        bairro_xml = f"<xBairro>{_escapar(tom.endereco_bairro)}</xBairro>" if tom.endereco_bairro else ""
        lgr_xml = f"<xLgr>{_escapar(tom.endereco_logradouro)}</xLgr>" if tom.endereco_logradouro else ""
        end_tomador_xml = (
            f"<end><endNac><cMun>{cmun_tomador}</cMun>{cep_xml}</endNac>"
            f"{lgr_xml}{nro_xml}{cpl_xml}{bairro_xml}</end>"
        )

    ctrib_mun_xml = (
        f"<cTribMun>{_escapar(dados.servico.codigo_tributacao_municipal)}</cTribMun>"
        if dados.servico.codigo_tributacao_municipal else ""
    )

    # totTrib é OBRIGATÓRIO no schema do Sefin Nacional. O formato usado
    # aqui (<pTotTrib> com Federal/Estadual/Municipal) foi confirmado
    # contra uma nota REAL e ACEITA da própria SOMA (mesmo certificado,
    # optante pelo Simples Nacional) — é esse o formato certo para o
    # caso dela, não o <pTotTribSN> que tínhamos usado antes.
    trib = dados.tributacao
    if (
        trib.percentual_total_tributos_federal is not None
        and trib.percentual_total_tributos_estadual is not None
        and trib.percentual_total_tributos_municipal is not None
    ):
        tot_trib_xml = (
            "<totTrib><pTotTrib>"
            f"<pTotTribFed>{trib.percentual_total_tributos_federal:.2f}</pTotTribFed>"
            f"<pTotTribEst>{trib.percentual_total_tributos_estadual:.2f}</pTotTribEst>"
            f"<pTotTribMun>{trib.percentual_total_tributos_municipal:.2f}</pTotTribMun>"
            "</pTotTrib></totTrib>"
        )
    elif trib.percentual_total_tributos_simples is not None:
        tot_trib_xml = (
            f"<totTrib><pTotTribSN>{trib.percentual_total_tributos_simples:.2f}</pTotTribSN></totTrib>"
        )
    else:
        raise ErroDadosDPS(
            "Informe os percentuais de tributos (Federal/Estadual/Municipal, ou o "
            "percentual do Simples Nacional) — o Sefin Nacional rejeita a DPS sem "
            "esse campo. Consulte o PGDAS ou a contabilidade para os valores certos."
        )

    tp_amb = "1" if dados.ambiente_producao else "2"
    dh_emi = dados.data_emissao.strftime("%Y-%m-%dT%H:%M:%S-03:00")
    d_compet = dados.data_competencia.strftime("%Y-%m-%d")

    xml_dps = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<DPS versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse">'
        f'<infDPS Id="{id_dps}">'
        f"<tpAmb>{tp_amb}</tpAmb>"
        f"<dhEmi>{dh_emi}</dhEmi>"
        "<verAplic>BuscadorNFSe_1.0</verAplic>"
        f"<serie>{int(_somente_digitos(dados.serie))}</serie>"
        f"<nDPS>{dados.numero_dps}</nDPS>"
        f"<dCompet>{d_compet}</dCompet>"
        f"<tpEmit>{dados.tipo_emissao}</tpEmit>"
        f"<cLocEmi>{_somente_digitos(dados.codigo_municipio_emissor).zfill(7)}</cLocEmi>"
        "<prest>"
        + (f"<CPF>{cnpj_prestador}</CPF>" if len(cnpj_prestador) == 11 else f"<CNPJ>{cnpj_prestador}</CNPJ>")
        + f"{im_xml}{fone_xml}{email_xml}"
        "<regTrib>"
        f"<opSimpNac>{prest.regime.opcao_simples_nacional}</opSimpNac>"
        f"<regApTribSN>{prest.regime.regime_apuracao_simples}</regApTribSN>"
        f"<regEspTrib>{prest.regime.regime_especial_tributacao}</regEspTrib>"
        "</regTrib>"
        "</prest>"
        "<toma>"
        f"{tag_tomador_doc}"
        f"<xNome>{_escapar(dados.tomador.nome)}</xNome>"
        f"{end_tomador_xml}"
        f"{email_tomador_xml}"
        "</toma>"
        "<serv>"
        f"<locPrest><cLocPrestacao>{codigo_municipio_prestacao}</cLocPrestacao></locPrest>"
        "<cServ>"
        f"<cTribNac>{_somente_digitos(dados.servico.codigo_tributacao_nacional).zfill(6)}</cTribNac>"
        f"{ctrib_mun_xml}"
        f"<xDescServ>{_escapar(dados.servico.descricao)}</xDescServ>"
        + (f"<cNBS>{_escapar(dados.servico.codigo_nbs)}</cNBS>" if dados.servico.codigo_nbs else "")
        + "</cServ>"
        "</serv>"
        "<valores>"
        f"<vServPrest><vServ>{dados.servico.valor_servico:.2f}</vServ></vServPrest>"
        "<trib>"
        "<tribMun>"
        f"<tribISSQN>{dados.tributacao.tributacao_issqn}</tribISSQN>"
        f"<tpRetISSQN>{dados.tributacao.tipo_retencao_issqn}</tpRetISSQN>"
        + (
            f"<pAliq>{dados.tributacao.aliquota_issqn_informada:.2f}</pAliq>"
            if dados.tributacao.aliquota_issqn_informada is not None else ""
        )
        + "</tribMun>"
        f"<tribFed><piscofins><CST>{dados.tributacao.cst_pis_cofins}</CST>"
        + (
            ""
            if dados.tributacao.cst_pis_cofins in CST_PIS_COFINS_SEM_DETALHE
            else (
                (
                    f"<vBCPisCofins>{dados.tributacao.valor_bc_pis_cofins:.2f}</vBCPisCofins>"
                    if dados.tributacao.valor_bc_pis_cofins is not None else ""
                )
                + (
                    f"<pAliqPis>{dados.tributacao.aliquota_pis:.2f}</pAliqPis>"
                    if dados.tributacao.aliquota_pis is not None else ""
                )
                + (
                    f"<pAliqCofins>{dados.tributacao.aliquota_cofins:.2f}</pAliqCofins>"
                    if dados.tributacao.aliquota_cofins is not None else ""
                )
                + (
                    f"<vPis>{dados.tributacao.valor_pis_proprio:.2f}</vPis>"
                    if dados.tributacao.valor_pis_proprio is not None else ""
                )
                + (
                    f"<vCofins>{dados.tributacao.valor_cofins_proprio:.2f}</vCofins>"
                    if dados.tributacao.valor_cofins_proprio is not None else ""
                )
            )
        )
        + f"<tpRetPisCofins>{dados.tributacao.tipo_retencao_pis_cofins}</tpRetPisCofins>"
        "</piscofins>"
        + (
            f"<vRetCP>{dados.tributacao.valor_retido_inss:.2f}</vRetCP>"
            if dados.tributacao.valor_retido_inss is not None else ""
        )
        + (
            f"<vRetIRRF>{dados.tributacao.valor_retido_irrf:.2f}</vRetIRRF>"
            if dados.tributacao.valor_retido_irrf is not None else ""
        )
        + (
            f"<vRetCSLL>{dados.tributacao.valor_retido_contribuicoes_sociais:.2f}</vRetCSLL>"
            if dados.tributacao.valor_retido_contribuicoes_sociais is not None else ""
        )
        + "</tribFed>"
        f"{tot_trib_xml}"
        "</trib>"
        "</valores>"
        "</infDPS>"
        "</DPS>"
    )

    return xml_dps, id_dps
