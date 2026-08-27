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
from schemas import ExtratoDasOut
from serpro_client import ErroIntegraContador, chamar

app = FastAPI(title="integra-contador", docs_url=None, redoc_url=None)


@app.on_event("startup")
def iniciar_scheduler():
    scheduler.iniciar()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug/serpro-credenciais", dependencies=[Depends(exigir_token_interno)])
def debug_serpro_credenciais():
    """
    Diagnóstico temporário — NUNCA expõe o valor da credencial, só
    metadados (tamanho, se tem espaço/caractere de controle, primeiro e
    último caractere isolados) pra investigar o erro 400 "Authorization
    não está no formato esperado" sem ninguém colar a credencial de
    verdade em lugar nenhum. Remover depois de resolver (ver README).
    """
    import os
    import re

    def diagnosticar(nome: str) -> dict:
        valor = os.environ.get(nome)
        if valor is None:
            return {"presente": False}
        return {
            "presente": True,
            "tamanho": len(valor),
            "primeiro_caractere": repr(valor[0]) if valor else None,
            "ultimo_caractere": repr(valor[-1]) if valor else None,
            "tem_espaco_ou_controle": bool(re.search(r"[\s\x00-\x1f]", valor)),
            "tem_aspas": '"' in valor or "'" in valor,
        }

    return {
        "consumer_key": diagnosticar("INTEGRA_CONTADOR_CONSUMER_KEY"),
        "consumer_secret": diagnosticar("INTEGRA_CONTADOR_CONSUMER_SECRET"),
        "auth_url": os.environ.get("INTEGRA_CONTADOR_AUTH_URL"),
    }


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
