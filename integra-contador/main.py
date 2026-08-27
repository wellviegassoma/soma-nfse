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
from schemas import ChamarServicoIn, ChamarServicoOut, DeclaracoesPeriodoOut, ExtratoDasOut, SituacaoFiscalOut
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
