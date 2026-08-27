"""
Job noturno: pré-aquece o cache de "declarações do período" pra todos os
contribuintes ativos, em vez de esperar alguém abrir uma tela e pagar o
custo da chamada na hora. Roda dentro do próprio processo (APScheduler) —
Railway mantém o processo vivo, então não precisamos de um agendador
externo (Vercel Cron, etc.) só pra isso.

Usa PGDASD.CONSDECLARACAO13 (ver catalogo.py) porque é o único serviço do
PGDAS-D que permite consultar só com CNPJ + período — sem precisar de um
numeroDas ou numeroDeclaracao já conhecido de antemão. Dá o índice de
declarações/DAS do período, útil como visão geral e como insumo pra quem
depois quiser aprofundar com CONSEXTRATO16 num DAS específico.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

import serpro_client
from supabase_client import obter_cliente

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")


def _cnpjs_ativos() -> list[str]:
    resposta = (
        obter_cliente()
        .table("integra_contador_contribuintes")
        .select("companies(cnpj)")
        .eq("ativo", True)
        .execute()
    )
    return [linha["companies"]["cnpj"] for linha in resposta.data if linha.get("companies", {}).get("cnpj")]


def pull_declaracoes_periodo_atual() -> None:
    periodo_apuracao = datetime.now(timezone.utc).strftime("%Y%m")
    for cnpj in _cnpjs_ativos():
        try:
            serpro_client.chamar(
                "PGDASD", "CONSDECLARACAO13", cnpj, {"periodoApuracao": periodo_apuracao}
            )
        except Exception:
            logger.exception(
                "Falha ao pré-aquecer declarações do período %s pra %s", periodo_apuracao, cnpj
            )


def iniciar() -> None:
    _scheduler.add_job(
        pull_declaracoes_periodo_atual, "cron", hour=3, minute=0, id="pull_declaracoes_periodo_atual", replace_existing=True
    )
    _scheduler.start()
