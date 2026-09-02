"""
Catálogo de serviços do Integra Contador — idSistema/idServico -> rota do
gateway + versão + TTL de cache + código de procuração eCAC necessário.

Populado a partir do Catálogo de Serviços oficial e verificado contra as
páginas de cada solução (campo "versaoSistema" nos exemplos de entrada):
https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/catalogo_de_servicos/
https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/servicos_vs_procuracoes/

A rota vem direto da coluna "Tipo" do catálogo — os 5 valores possíveis
(Apoiar/Consultar/Declarar/Emitir/Monitorar) são exatamente os caminhos
válidos do gateway (ver "Integra Contador" > Caminhos na documentação).

`versao_sistema=None` significa que eu não confirmei essa versão
diretamente contra a documentação (geralmente porque a página de exemplo
daquele serviço específico omite o campo) — `obter_servico()` recusa a
chamada nesse caso. Antes de ligar um desses, abra a página do serviço em
"Soluções" na documentação e confirme.

NÃO estão aqui (fluxo incompatível com o padrão simples de
request/resposta de serpro_client.chamar() — precisam de módulo dedicado,
no estilo de sitfis.py):
- SITFIS (protocolo -> relatório com espera assíncrona) — ver sitfis.py.
- EVENTOSATUALIZACAO (solicitar em lote -> obter depois, assíncrono).
- AUTENTICAPROCURADOR (fluxo de autenticação alternativo via XML assinado
  pelo procurador — só relevante se um dia precisarmos atuar como
  procurador de alguém que não outorgou procuração eletrônica direta;
  hoje sempre atuamos como a própria SOMA com procuração já outorgada).
"""

from __future__ import annotations

from dataclasses import dataclass

UM_DIA_SEGUNDOS = 24 * 60 * 60
UMA_HORA_SEGUNDOS = 60 * 60
# Pra consultas sobre algo que já aconteceu e não muda mais na prática
# (ex.: recibo/declaração de um período já transmitido) — TTL padrão de
# 1 dia faria repetir a mesma consulta paga toda vez que alguém quisesse
# ver de novo depois de um dia. Não é "pra sempre" de propósito: se um
# dia existir retificadora nesse sistema, uma consulta feita bem depois
# de uma retificação ainda deve eventualmente atualizar.
CENTO_OITENTA_DIAS_SEGUNDOS = 180 * UM_DIA_SEGUNDOS


@dataclass(frozen=True)
class ServicoCatalogado:
    id_sistema: str
    id_servico: str
    rota: str  # segmento após /integra-contador/v1/ no gateway
    versao_sistema: str | None
    cache_ttl_segundos: int
    procuracao_codigo: str | None = None  # código eCAC — None = n/a (não exige procuração)


def _s(
    id_sistema: str,
    id_servico: str,
    rota: str,
    versao_sistema: str | None,
    cache_ttl_segundos: int = UM_DIA_SEGUNDOS,
    procuracao_codigo: str | None = None,
) -> ServicoCatalogado:
    return ServicoCatalogado(id_sistema, id_servico, rota, versao_sistema, cache_ttl_segundos, procuracao_codigo)


CATALOGO: dict[tuple[str, str], ServicoCatalogado] = {}


def _registrar(*servicos: ServicoCatalogado) -> None:
    for s in servicos:
        CATALOGO[(s.id_sistema, s.id_servico)] = s


# --- Integra-SN: PGDAS-D (versão 1.0, confirmada) — procuração 00146 ---
_registrar(
    _s("PGDASD", "TRANSDECLARACAO11", "Declarar", "1.0", procuracao_codigo="00146"),
    _s("PGDASD", "GERARDAS12", "Emitir", "1.0", procuracao_codigo="00146"),
    _s("PGDASD", "CONSDECLARACAO13", "Consultar", "1.0", procuracao_codigo="00146"),
    _s(
        "PGDASD", "CONSULTIMADECREC14", "Consultar", "1.0",
        cache_ttl_segundos=CENTO_OITENTA_DIAS_SEGUNDOS, procuracao_codigo="00146",
    ),
    _s(
        "PGDASD", "CONSDECREC15", "Consultar", "1.0",
        cache_ttl_segundos=CENTO_OITENTA_DIAS_SEGUNDOS, procuracao_codigo="00146",
    ),
    _s("PGDASD", "CONSEXTRATO16", "Consultar", "1.0", procuracao_codigo="00146"),
    _s("PGDASD", "GERARDASCOBRANCA17", "Emitir", "1.0", procuracao_codigo="00146"),
    _s("PGDASD", "GERARDASPROCESSO18", "Emitir", "1.0", procuracao_codigo="00146"),
    _s("PGDASD", "GERARDASAVULSO19", "Emitir", "1.0", procuracao_codigo="00146"),
)

# --- Integra-SN: Regime de Apuração (versão 1.0, confirmada) — procuração 00060 ---
_registrar(
    _s("REGIMEAPURACAO", "EFETUAROPCAOREGIME101", "Declarar", "1.0", procuracao_codigo="00060"),
    _s("REGIMEAPURACAO", "CONSULTARANOSCALENDARIOS102", "Consultar", "1.0", procuracao_codigo="00060"),
    _s("REGIMEAPURACAO", "CONSULTAROPCAOREGIME103", "Consultar", "1.0", procuracao_codigo="00060"),
    _s("REGIMEAPURACAO", "CONSULTARRESOLUCAO104", "Consultar", "1.0", procuracao_codigo="00060"),
)

# --- Integra-SN: DEFIS (versão 1.0, confirmada) — procuração 00146 ---
_registrar(
    _s("DEFIS", "TRANSDECLARACAO141", "Declarar", "1.0", procuracao_codigo="00146"),
    _s("DEFIS", "CONSDECLARACAO142", "Consultar", "1.0", procuracao_codigo="00146"),
    _s("DEFIS", "CONSULTIMADECREC143", "Consultar", "1.0", procuracao_codigo="00146"),
    _s("DEFIS", "CONSDECREC144", "Consultar", "1.0", procuracao_codigo="00146"),
)

# --- Integra-MEI: PGMEI (versão 1.0, confirmada) — sem procuração (n/a) ---
_registrar(
    _s("PGMEI", "GERARDASPDF21", "Emitir", "1.0"),
    _s("PGMEI", "GERARDASCODBARRA22", "Emitir", "1.0"),
    _s("PGMEI", "ATUBENEFICIO23", "Emitir", "1.0"),
    _s("PGMEI", "DIVIDAATIVA24", "Consultar", "1.0"),
)

# --- Integra-MEI: CCMEI (versão assumida "1.0" — a página de exemplo
# omite o campo; confirme antes do primeiro uso real) — sem procuração ---
_registrar(
    _s("CCMEI", "EMITIRCCMEI121", "Emitir", "1.0"),
    _s("CCMEI", "DADOSCCMEI122", "Consultar", "1.0"),
    _s("CCMEI", "CCMEISITCADASTRAL123", "Consultar", "1.0"),
)

# --- Integra-MEI: DASN-SIMEI (versão 1.0, confirmada) — procuração 00229
# (só nos serviços 152/153; a entrega 151 é n/a) ---
_registrar(
    _s("DASNSIMEI", "TRANSDECLARACAO151", "Declarar", "1.0"),
    _s("DASNSIMEI", "CONSULTIMADECREC152", "Consultar", "1.0", procuracao_codigo="00229"),
    _s("DASNSIMEI", "GERARDASEXCESSO153", "Emitir", "1.0", procuracao_codigo="00229"),
)

# --- Integra-DCTFWeb: DCTFWEB (versão 1.0, confirmada) — procuração 00103
# (confirmada nos serviços 31/32/33/38/310; assumida nos demais do grupo) ---
_registrar(
    _s("DCTFWEB", "GERARGUIA31", "Emitir", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "CONSRECIBO32", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "CONSDECCOMPLETA33", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "CONSRELCREDITO34", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "CONSRELDEBITO35", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "GERARGUIAMAED36", "Emitir", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "CONSNOTIFMAED37", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "CONSXMLDECLARACAO38", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "APLVINCULACAO39", "Emitir", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "TRANSDECLARACAO310", "Declarar", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "GERARGUIACOMABATIMENTO311", "Emitir", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "EDITARVALORSUSPENSO312", "Emitir", "1.0", procuracao_codigo="00103"),
    _s("DCTFWEB", "GERARGUIAANDAMENTO313", "Emitir", "1.0", procuracao_codigo="00103"),
)

# --- Integra-DCTFWeb: MIT (versão 1.0, confirmada contra a doc oficial:
# apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/
# solucoes/integra-dctfweb/mit/) — procuração ASSUMIDA igual à do DCTFWeb
# (00103), já que MIT vive dentro do mesmo grupo/rota de declaração e a
# doc de MIT não lista procuração própria — nunca confirmado contra um
# 403 real. CONSAPURACAO316/LISTAAPURACOES317 (Consultar) só leitura, sem
# risco de declarar nada por engano. ENCAPURACAO314 (Declarar) tem efeito
# legal real — não usar sem revisão cuidadosa do payload de Debitos.
#
# QualificacaoPj/TributacaoLucro/RegimePisCofins e os CodigoDebito de
# IRPJ/CSLL/PIS/COFINS pra Lucro Presumido (respectivamente 1/3/2 e
# 208901/237201/810902/217201) foram confirmados em 01/09/2026 direto nas
# apurações reais já encerradas de 5 clientes Lucro Presumido da SOMA
# (múltiplos períodos de 2025 e 2026, valores idênticos em todos) — ver
# `lib/mit-declaracao.ts` no frontend. ---
_registrar(
    _s("MIT", "ENCAPURACAO314", "Declarar", "1.0", procuracao_codigo="00103"),
    # TTL curto (30s) — diferente das outras consultas do catálogo, essa é
    # justamente pra fazer polling de um status que muda entre uma chamada
    # e outra logo depois de encerrar uma apuração; um TTL longo faria o
    # polling ficar preso servindo a mesma resposta "em processamento".
    _s("MIT", "SITUACAOENC315", "Apoiar", "1.0", cache_ttl_segundos=30, procuracao_codigo="00103"),
    _s("MIT", "CONSAPURACAO316", "Consultar", "1.0", procuracao_codigo="00103"),
    _s("MIT", "LISTAAPURACOES317", "Consultar", "1.0", procuracao_codigo="00103"),
)

# --- Integra-Procurações (versão "1", sem decimal — confirmada) ---
_registrar(
    _s("PROCURACOES", "OBTERPROCURACAO41", "Consultar", "1", cache_ttl_segundos=UMA_HORA_SEGUNDOS),
)

# --- Integra-Sicalc (versão 2.9, confirmada) — sem procuração ---
_registrar(
    _s("SICALC", "CONSOLIDARGERARDARF51", "Emitir", "2.9"),
    _s("SICALC", "CONSULTAAPOIORECEITAS52", "Apoiar", "2.9"),
    _s("SICALC", "GERARDARFCODBARRA53", "Emitir", "2.9"),
    _s("SICALC", "CONSOLIDAR54", "Consultar", "2.9"),
)

# --- Integra-CaixaPostal (versão 1.0, confirmada) — procuração 00006 ---
_registrar(
    _s("CAIXAPOSTAL", "MSGCONTRIBUINTE61", "Consultar", "1.0", cache_ttl_segundos=UMA_HORA_SEGUNDOS, procuracao_codigo="00006"),
    _s("CAIXAPOSTAL", "MSGDETALHAMENTO62", "Consultar", "1.0", cache_ttl_segundos=UMA_HORA_SEGUNDOS, procuracao_codigo="00006"),
    _s("CAIXAPOSTAL", "INNOVAMSG63", "Monitorar", "1.0", cache_ttl_segundos=UMA_HORA_SEGUNDOS, procuracao_codigo="00006"),
)

# --- Integra-CaixaPostal: DTE (versão 1.0, confirmada) — procuração 00050 ---
_registrar(
    _s("DTE", "CONSULTASITUACAODTE111", "Consultar", "1.0", procuracao_codigo="00050"),
)

# --- Integra-Pagamento: PAGTOWEB (versão 1.0, confirmada) — procuração 00004 ---
_registrar(
    _s("PAGTOWEB", "PAGAMENTOS71", "Consultar", "1.0", procuracao_codigo="00004"),
    _s("PAGTOWEB", "COMPARRECADACAO72", "Emitir", "1.0", procuracao_codigo="00004"),
    _s("PAGTOWEB", "CONTACONSDOCARRPG73", "Consultar", "1.0", procuracao_codigo="00004"),
)

# --- Integra-Parcelamentos (versão 1.0 confirmada de verdade no PARCSN
# via chamada real em 2026-09-02 — mesma coisa aplicada aqui nas
# modalidades irmãs, já que a documentação é claramente templated/
# idêntica entre elas. Ainda PENDENTE DE CONFIRMAÇÃO POR CHAMADA REAL
# pra cada uma dessas 7 (só a suposição de que "1.0" está certo pra
# elas também) — se a Serpro devolver erro de versão, corrigir aqui. ---
_registrar(
    _s("PARCSN", "GERARDAS161", "Emitir", "1.0", procuracao_codigo="00076/00188"),
    _s("PARCSN", "PARCELASPARAGERAR162", "Consultar", "1.0", procuracao_codigo="00076/00188"),
    _s("PARCSN", "PEDIDOSPARC163", "Consultar", "1.0", procuracao_codigo="00076/00188"),
    _s("PARCSN", "OBTERPARC164", "Consultar", "1.0", procuracao_codigo="00076/00188"),
    _s("PARCSN", "DETPAGTOPARC165", "Consultar", "1.0", procuracao_codigo="00076/00188"),
    _s("PARCSN-ESP", "GERARDAS171", "Emitir", "1.0", procuracao_codigo="00125"),
    _s("PARCSN-ESP", "PARCELASPARAGERAR172", "Consultar", "1.0", procuracao_codigo="00125"),
    _s("PARCSN-ESP", "PEDIDOSPARC173", "Consultar", "1.0", procuracao_codigo="00125"),
    _s("PARCSN-ESP", "OBTERPARC174", "Consultar", "1.0", procuracao_codigo="00125"),
    _s("PARCSN-ESP", "DETPAGTOPARC175", "Consultar", "1.0", procuracao_codigo="00125"),
    _s("PERTSN", "GERARDAS181", "Emitir", "1.0", procuracao_codigo="00149/10011"),
    _s("PERTSN", "PARCELASPARAGERAR182", "Consultar", "1.0", procuracao_codigo="00149/10011"),
    _s("PERTSN", "PEDIDOSPARC183", "Consultar", "1.0", procuracao_codigo="00149/10011"),
    _s("PERTSN", "OBTERPARC184", "Consultar", "1.0", procuracao_codigo="00149/10011"),
    _s("PERTSN", "DETPAGTOPARC185", "Consultar", "1.0", procuracao_codigo="00149/10011"),
    _s("RELPSN", "GERARDAS191", "Emitir", "1.0", procuracao_codigo="00210/10036"),
    _s("RELPSN", "PARCELASPARAGERAR192", "Consultar", "1.0", procuracao_codigo="00210/10036"),
    _s("RELPSN", "PEDIDOSPARC193", "Consultar", "1.0", procuracao_codigo="00210/10036"),
    _s("RELPSN", "OBTERPARC194", "Consultar", "1.0", procuracao_codigo="00210/10036"),
    _s("RELPSN", "DETPAGTOPARC195", "Consultar", "1.0", procuracao_codigo="00210/10036"),
    _s("PARCMEI", "GERARDAS201", "Emitir", "1.0", procuracao_codigo="00134"),
    _s("PARCMEI", "PARCELASPARAGERAR202", "Consultar", "1.0", procuracao_codigo="00134"),
    _s("PARCMEI", "PEDIDOSPARC203", "Consultar", "1.0", procuracao_codigo="00134"),
    _s("PARCMEI", "OBTERPARC204", "Consultar", "1.0", procuracao_codigo="00134"),
    _s("PARCMEI", "DETPAGTOPARC205", "Consultar", "1.0", procuracao_codigo="00134"),
    _s("PARCMEI-ESP", "GERARDAS211", "Emitir", "1.0", procuracao_codigo="00133"),
    _s("PARCMEI-ESP", "PARCELASPARAGERAR212", "Consultar", "1.0", procuracao_codigo="00133"),
    _s("PARCMEI-ESP", "PEDIDOSPARC213", "Consultar", "1.0", procuracao_codigo="00133"),
    _s("PARCMEI-ESP", "OBTERPARC214", "Consultar", "1.0", procuracao_codigo="00133"),
    _s("PARCMEI-ESP", "DETPAGTOPARC215", "Consultar", "1.0", procuracao_codigo="00133"),
    _s("PERTMEI", "GERARDAS221", "Emitir", "1.0", procuracao_codigo="00152/10012"),
    _s("PERTMEI", "PARCELASPARAGERAR222", "Consultar", "1.0", procuracao_codigo="00152/10012"),
    _s("PERTMEI", "PEDIDOSPARC223", "Consultar", "1.0", procuracao_codigo="00152/10012"),
    _s("PERTMEI", "OBTERPARC224", "Consultar", "1.0", procuracao_codigo="00152/10012"),
    _s("PERTMEI", "DETPAGTOPARC225", "Consultar", "1.0", procuracao_codigo="00152/10012"),
    _s("RELPMEI", "GERARDAS231", "Emitir", "1.0", procuracao_codigo="00209/10035"),
    _s("RELPMEI", "PARCELASPARAGERAR232", "Consultar", "1.0", procuracao_codigo="00209/10035"),
    _s("RELPMEI", "PEDIDOSPARC233", "Consultar", "1.0", procuracao_codigo="00209/10035"),
    _s("RELPMEI", "OBTERPARC234", "Consultar", "1.0", procuracao_codigo="00209/10035"),
    _s("RELPMEI", "DETPAGTOPARC235", "Consultar", "1.0", procuracao_codigo="00209/10035"),
)

# --- Integra-Parcelamentos: PAEX/SIPADE — sem documentação pública
# encontrada nos "Soluções" da doc (não aparecem no menu lateral); rota
# vem só do Catálogo de Serviços. NÃO USAR sem antes confirmar diretamente
# com a Serpro/suporte — versaoSistema e formato de entrada desconhecidos. ---
_registrar(
    _s("PARC-PAEX", "OBTEREXTRATOPDF171", "Consultar", None),
    _s("PARC-PAEX", "OBTEREXTRATOJSON172", "Consultar", None),
    _s("PARC-PAEX", "EMITIRDOCARRECADACAO173", "Emitir", None),
    _s("PARC-SIPADE", "OBTEREXTRATOPDF181", "Consultar", None),
    _s("PARC-SIPADE", "OBTEREXTRATOJSON182", "Consultar", None),
    _s("PARC-SIPADE", "EMITIRDOCARRECADACAO183", "Emitir", None),
)

# --- Integra-Redesim: PNRCONTADOR (versão 1.0, confirmada) — sem
# procuração no sentido eCAC tradicional (usa vínculo de contador na
# Junta Comercial/Redesim, mecanismo próprio) ---
_registrar(
    _s("PNRCONTADOR", "CONSVINCULOS261", "Consultar", "1.0"),
    _s("PNRCONTADOR", "SOLICRENUNCIA262", "Declarar", "1.0"),
    _s("PNRCONTADOR", "CONSRENUNCIA263", "Consultar", "1.0"),
    _s("PNRCONTADOR", "COMPRENUNCIA264", "Emitir", "1.0"),
    _s("PNRCONTADOR", "SITSOLICRENUNCIA265", "Consultar", "1.0"),
)

# --- Integra-e-Processo (versão 2.0, confirmada) — procuração 00051 ---
_registrar(
    _s("EPROCESSO", "CONSPROCPORINTER271", "Consultar", "2.0", procuracao_codigo="00051"),
    _s("EPROCESSO", "OBTLISTDOCSPROC272", "Consultar", "2.0", procuracao_codigo="00051"),
    _s("EPROCESSO", "OBTDOCPROC273", "Consultar", "2.0", procuracao_codigo="00051"),
    _s("EPROCESSO", "CONSCOMUNINTIM274", "Consultar", "2.0", procuracao_codigo="00051"),
)


class ServicoDesconhecidoError(Exception):
    pass


def obter_servico(id_sistema: str, id_servico: str) -> ServicoCatalogado:
    chave = (id_sistema, id_servico)
    if chave not in CATALOGO:
        raise ServicoDesconhecidoError(
            f"Serviço {id_sistema}.{id_servico} não está no catálogo — confira "
            "se o nome está certo ou adicione uma entrada em catalogo.py."
        )
    servico = CATALOGO[chave]
    if servico.versao_sistema is None:
        raise ServicoDesconhecidoError(
            f"Serviço {id_sistema}.{id_servico} está catalogado mas a versaoSistema "
            "ainda não foi confirmada contra a documentação oficial — abra a página "
            "do serviço em 'Soluções' antes de usar (ver comentário em catalogo.py)."
        )
    return servico
