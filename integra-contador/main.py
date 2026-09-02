"""
integra-contador — conector com a API Integra Contador (Serpro) pra
puxar dados fiscais dos clientes da SOMA.

Ao contrário do backend/nfse-engine (stateless), este serviço tem acesso
próprio ao Supabase: decifra sozinho o certificado e-CNPJ da SOMA (já
guardado lá pelo soma-nfse/frontend) pra poder autenticar e rodar pulls
agendados sem depender de ninguém logado no navegador. Ver
docs/spec.md e o plano de implementação pra detalhes da decisão.

Toda rota exige o header X-Internal-Token (ver auth.py).
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()  # só facilita rodar localmente — em produção (Railway) as
# variáveis já vêm injetadas no processo, load_dotenv() não faz nada.

from fastapi import Depends, FastAPI, HTTPException

import scheduler
from auth import exigir_token_interno
from catalogo import CATALOGO
from cnd import ErroCnd, consultar_cnd
from schemas import (
    ChamarServicoIn,
    ChamarServicoOut,
    CndOut,
    ConsultarApuracaoMitOut,
    DeclaracoesPeriodoOut,
    DeclararPgdasIn,
    DeclararPgdasOut,
    ExtratoDasOut,
    GerarDasOut,
    ListarApuracoesMitOut,
    ReciboDeclaracaoOut,
    SituacaoFiscalOut,
)
from serpro_client import ErroIntegraContador, chamar
from sitfis import ErroSitfis, obter_situacao_fiscal

app = FastAPI(title="integra-contador", docs_url=None, redoc_url=None)


@app.on_event("startup")
def iniciar_scheduler():
    scheduler.iniciar()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/catalogo", dependencies=[Depends(exigir_token_interno)])
def listar_catalogo():
    """Lista os serviços prontos pra usar via /contribuintes/{cnpj}/chamar."""
    return [
        {
            "idSistema": s.id_sistema,
            "idServico": s.id_servico,
            "rota": s.rota,
            "versaoConfirmada": s.versao_sistema is not None,
            "procuracaoCodigo": s.procuracao_codigo,
        }
        for s in CATALOGO.values()
    ]


@app.get(
    "/contribuintes/{cnpj}/cnd",
    response_model=CndOut,
    dependencies=[Depends(exigir_token_interno)],
)
def consultar_certidao_negativa(cnpj: str, gerar_pdf: bool = True):
    """
    Emite a Certidão Negativa de Débitos (ou Positiva com efeitos de
    negativa) — API Consulta CND, produto Serpro SEPARADO do Integra
    Contador (contrato e credenciais próprios: CND_CONSUMER_KEY/SECRET).
    Por padrão aponta pro ambiente de demonstração (grátis, CNPJ
    fictício) até o contrato de produção ficar ativo — ver cnd.py.
    """
    try:
        resposta = consultar_cnd(cnpj, gerar_pdf=gerar_pdf)
    except ErroCnd as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CndOut(contribuinte_cnpj=cnpj, resposta=resposta)


@app.post(
    "/contribuintes/{cnpj}/chamar",
    response_model=ChamarServicoOut,
    dependencies=[Depends(exigir_token_interno)],
)
def chamar_servico(cnpj: str, corpo: ChamarServicoIn):
    """
    Endpoint genérico — chama qualquer serviço já catalogado em
    catalogo.py (ver GET /catalogo pra lista) sem precisar de um endpoint
    dedicado por serviço. Mesma engine de cache/log/auth dos endpoints
    específicos (extrato-das, declaracoes, situacao-fiscal).
    """
    try:
        resposta = chamar(corpo.id_sistema, corpo.id_servico, cnpj, corpo.dados)
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ChamarServicoOut(
        contribuinte_cnpj=cnpj, id_sistema=corpo.id_sistema, id_servico=corpo.id_servico, resposta=resposta
    )


@app.get(
    "/contribuintes/{cnpj}/simples/extrato-das/{numero_das}",
    response_model=ExtratoDasOut,
    dependencies=[Depends(exigir_token_interno)],
)
def consultar_extrato_das(cnpj: str, numero_das: str):
    """
    Consulta o extrato de um DAS já emitido (PGDASD.CONSEXTRATO16).
    Serve do cache se já foi consultado dentro do TTL configurado em
    catalogo.py — só gera uma chamada real de produção na primeira vez.
    """
    try:
        resposta = chamar("PGDASD", "CONSEXTRATO16", cnpj, {"numeroDas": numero_das})
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ExtratoDasOut(contribuinte_cnpj=cnpj, numero_das=numero_das, resposta=resposta)


@app.get(
    "/contribuintes/{cnpj}/simples/declaracoes/{periodo_apuracao}",
    response_model=DeclaracoesPeriodoOut,
    dependencies=[Depends(exigir_token_interno)],
)
def consultar_declaracoes_periodo(cnpj: str, periodo_apuracao: str):
    """
    Consulta o índice de declarações/DAS de um período de apuração
    (PGDASD.CONSDECLARACAO13, formato periodoApuracao: AAAAMM). Útil pra
    descobrir os números de DAS reais de um contribuinte antes de usar
    /simples/extrato-das/{numero_das}.
    """
    try:
        resposta = chamar("PGDASD", "CONSDECLARACAO13", cnpj, {"periodoApuracao": periodo_apuracao})
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DeclaracoesPeriodoOut(contribuinte_cnpj=cnpj, periodo_apuracao=periodo_apuracao, resposta=resposta)


@app.post(
    "/contribuintes/{cnpj}/simples/pgdas-d/declarar",
    response_model=DeclararPgdasOut,
    dependencies=[Depends(exigir_token_interno)],
)
def declarar_pgdas_d(cnpj: str, corpo: DeclararPgdasIn):
    """
    Transmite (ou simula, se `dados.indicadorTransmissao` for false) uma
    Declaração do Simples Nacional (PGDASD.TRANSDECLARACAO11). Diferente
    dos outros endpoints deste arquivo, isso tem efeito legal real — nunca
    serve do cache (ver comentário em serpro_client.chamar()); cada
    chamada com indicadorTransmissao=true bate na Serpro de verdade. O
    payload em `dados` já vem pronto do frontend (monta a partir do
    faturamento segregado por atividade) — este endpoint só repassa.
    """
    try:
        resposta = chamar("PGDASD", "TRANSDECLARACAO11", cnpj, corpo.dados)
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DeclararPgdasOut(contribuinte_cnpj=cnpj, resposta=resposta)


@app.get(
    "/contribuintes/{cnpj}/simples/pgdas-d/das/{periodo_apuracao}",
    response_model=GerarDasOut,
    dependencies=[Depends(exigir_token_interno)],
)
def gerar_das(cnpj: str, periodo_apuracao: str):
    """
    Gera a guia do DAS (PGDASD.GERARDAS12) — o documento que o cliente
    paga — de uma declaração já transmitida pro período informado. Ao
    contrário de declarar_pgdas_d, isso é só leitura (a Serpro só relê os
    valores já apurados na transmissão), então serve do cache normalmente:
    gerar de novo no mesmo dia não gasta chamada nova.
    """
    try:
        resposta = chamar("PGDASD", "GERARDAS12", cnpj, {"periodoApuracao": periodo_apuracao})
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return GerarDasOut(contribuinte_cnpj=cnpj, periodo_apuracao=periodo_apuracao, resposta=resposta)


@app.get(
    "/contribuintes/{cnpj}/simples/pgdas-d/recibo/{periodo_apuracao}",
    response_model=ReciboDeclaracaoOut,
    dependencies=[Depends(exigir_token_interno)],
)
def consultar_recibo_declaracao(cnpj: str, periodo_apuracao: str):
    """
    Consulta a última declaração/recibo já transmitida pro período
    (PGDASD.CONSULTIMADECREC14) — direto na Serpro, então recupera
    declaração/recibo mesmo de uma transmissão feita antes desta feature
    existir, ou pelo PGDAS-D Web. Isso substitui a necessidade de um
    histórico próprio: a Serpro já é a fonte de verdade permanente.
    """
    try:
        resposta = chamar("PGDASD", "CONSULTIMADECREC14", cnpj, {"periodoApuracao": periodo_apuracao})
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ReciboDeclaracaoOut(contribuinte_cnpj=cnpj, periodo_apuracao=periodo_apuracao, resposta=resposta)


@app.get(
    "/contribuintes/{cnpj}/mit/apuracoes/{ano_apuracao}",
    response_model=ListarApuracoesMitOut,
    dependencies=[Depends(exigir_token_interno)],
)
def listar_apuracoes_mit(cnpj: str, ano_apuracao: int, mes_apuracao: int | None = None):
    """
    Lista as apurações do MIT (Módulo de Inclusão de Tributos — IRPJ/CSLL/
    PIS/COFINS de quem é Lucro Presumido/Real) de um ano, opcionalmente
    filtrado por mês (MIT.LISTAAPURACOES317). Só leitura — devolve
    idApuracao de cada período, usado depois em
    /mit/apuracao/{id_apuracao} pra ver o detalhe (débitos por tributo).

    Exige procuração eletrônica 00103 no e-CAC (mesma do DCTFWeb) —
    assumida, não confirmada de forma independente contra um 403 real
    ainda (ver comentário em catalogo.py).
    """
    dados = {"anoApuracao": ano_apuracao}
    if mes_apuracao is not None:
        dados["mesApuracao"] = mes_apuracao
    try:
        resposta = chamar("MIT", "LISTAAPURACOES317", cnpj, dados)
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ListarApuracoesMitOut(
        contribuinte_cnpj=cnpj, ano_apuracao=ano_apuracao, mes_apuracao=mes_apuracao, resposta=resposta
    )


@app.get(
    "/contribuintes/{cnpj}/mit/apuracao/{id_apuracao}",
    response_model=ConsultarApuracaoMitOut,
    dependencies=[Depends(exigir_token_interno)],
)
def consultar_apuracao_mit(cnpj: str, id_apuracao: int):
    """
    Detalhe de uma apuração específica do MIT (MIT.CONSAPURACAO316) — os
    débitos por tributo (IRPJ/CSLL/PIS/COFINS/...) que foram declarados.
    id_apuracao vem de /mit/apuracoes/{ano_apuracao}. Só leitura.
    """
    try:
        resposta = chamar("MIT", "CONSAPURACAO316", cnpj, {"idApuracao": id_apuracao})
    except ErroIntegraContador as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ConsultarApuracaoMitOut(contribuinte_cnpj=cnpj, id_apuracao=id_apuracao, resposta=resposta)


@app.get(
    "/contribuintes/{cnpj}/situacao-fiscal",
    response_model=SituacaoFiscalOut,
    dependencies=[Depends(exigir_token_interno)],
)
def consultar_situacao_fiscal(cnpj: str):
    """
    Emite o relatório de Situação Fiscal (Integra-Sitfis). Fluxo em duas
    etapas com espera assíncrona (ver sitfis.py) — a chamada pode demorar
    até ~1 minuto na primeira vez; chamadas seguintes no mesmo dia vêm do
    cache. Exige procuração eletrônica código 00002 no e-CAC (diferente
    do código 00146 usado pelo PGDAS-D).
    """
    try:
        resposta = obter_situacao_fiscal(cnpj)
    except (ErroIntegraContador, ErroSitfis) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SituacaoFiscalOut(contribuinte_cnpj=cnpj, resposta=resposta)
