"""
Catálogo de serviços do Integra Contador habilitados neste serviço —
idSistema/idServico -> rota do gateway + versão + TTL de cache. Adicionar
um novo serviço (DEFIS, DCTFWeb, Parcelamentos, Caixa Postal, Sitfis,
Procurações — ver plano) é só acrescentar uma entrada aqui, checando rota
e versão certas na documentação oficial antes de ligar.
"""

from __future__ import annotations

from dataclasses import dataclass

UM_DIA_SEGUNDOS = 24 * 60 * 60


@dataclass(frozen=True)
class ServicoCatalogado:
    id_sistema: str
    id_servico: str
    versao_sistema: str
    rota: str  # segmento após /integra-contador/v1/ no gateway
    cache_ttl_segundos: int


CATALOGO: dict[tuple[str, str], ServicoCatalogado] = {
    ("PGDASD", "CONSEXTRATO16"): ServicoCatalogado(
        id_sistema="PGDASD",
        id_servico="CONSEXTRATO16",
        versao_sistema="1.0",
        rota="Consultar",
        cache_ttl_segundos=UM_DIA_SEGUNDOS,
    ),
    # "Consultar declaração por ano/período" — só pede anoCalendario ou
    # periodoApuracao (nenhum numeroDas prévio), por isso é o serviço usado
    # no pull noturno em lote (scheduler.py): dá pra varrer todos os
    # contribuintes ativos só com o CNPJ + o período atual.
    ("PGDASD", "CONSDECLARACAO13"): ServicoCatalogado(
        id_sistema="PGDASD",
        id_servico="CONSDECLARACAO13",
        versao_sistema="1.0",
        rota="Consultar",
        cache_ttl_segundos=UM_DIA_SEGUNDOS,
    ),
}


def obter_servico(id_sistema: str, id_servico: str) -> ServicoCatalogado:
    chave = (id_sistema, id_servico)
    if chave not in CATALOGO:
        raise KeyError(
            f"Serviço {id_sistema}.{id_servico} não está no catálogo — "
            "confirme rota/versão na documentação oficial e adicione uma entrada em catalogo.py."
        )
    return CATALOGO[chave]
