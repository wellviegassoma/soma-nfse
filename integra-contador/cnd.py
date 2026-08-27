"""
API Consulta CND — produto Serpro SEPARADO do Integra Contador (contrato,
credenciais e gateway próprios; não usa o certificado e-CNPJ da SOMA, só
Consumer Key/Secret via OAuth2 client_credentials comum).

Emite a Certidão Negativa de Débitos (ou Positiva com efeitos de
negativa) de verdade — documento oficial com código de controle, validade
de 180 dias e PDF em base64. Diferente do Integra-Sitfis (relatório de
situação fiscal, informativo, sem valor de certidão formal).

Fluxo (às vezes) assíncrono: se a Status 7 vier, a resposta traz uma
`Chave` que precisa ser reenviada na próxima chamada (esperando pelo
menos 500ms) até vir um status final. Repetido aqui de forma bem mais
simples que o Sitfis (sem tempoEspera variável, só um mínimo fixo).

Documentado em:
https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnd/
"""

from __future__ import annotations

import base64
import os
import threading
import time
from datetime import datetime, timezone

import requests

import cache
from supabase_client import obter_cliente

_ID_SISTEMA = "CONSULTACND"
_ID_SERVICO = "CERTIDAO"
_CACHE_TTL_SEGUNDOS = 24 * 60 * 60  # a certidão em si vale 180 dias, mas 1 dia evita reconsultar/rebilhetar à toa
_ESPERA_MINIMA_SEGUNDOS = 0.5
_MAX_TENTATIVAS = 20  # ~10s de espera total antes de desistir

_TIPO_CONTRIBUINTE_PJ = 1
_CODIGO_IDENTIFICACAO_PJ = "9001"

# Status finais "de sucesso do processamento" (podem ou não ter emitido
# certidão — status 3/4 são "não emitida" mas ainda assim um resultado
# válido, não um erro nosso).
_STATUS_TERMINAIS = {1, 2, 3, 4}

# Token de demonstração público, documentado pela própria Serpro (não é
# segredo nenhum — está na doc oficial), usado como fallback só quando
# CND_CONSUMER_KEY não está configurado, pra dar pra testar contra o
# ambiente gratuito de demonstração sem precisar de nenhuma credencial.
_TOKEN_DEMO_PUBLICO = "06aef429-a981-3ec5-a1f8-71d38d86481e"


class ErroCnd(Exception):
    pass


_lock = threading.Lock()
_token_cache: dict[str, object] = {}


def _token_url() -> str:
    return os.environ.get("CND_TOKEN_URL", "https://gateway.apiserpro.serpro.gov.br/token")


def _gateway_url() -> str:
    # Trocar pra "https://gateway.apiserpro.serpro.gov.br/consulta-cnd/v1/certidao"
    # assim que o contrato de produção estiver ativo — por padrão aponta
    # pro ambiente de demonstração (gratuito, dados fictícios).
    return os.environ.get(
        "CND_GATEWAY_URL", "https://gateway.apiserpro.serpro.gov.br/consulta-cnd-trial/v1/certidao"
    )


def _autenticar() -> dict:
    consumer_key = os.environ["CND_CONSUMER_KEY"].strip()
    consumer_secret = os.environ["CND_CONSUMER_SECRET"].strip()
    basic = base64.b64encode(f"{consumer_key}:{consumer_secret}".encode("utf-8")).decode("ascii")

    resposta = requests.post(
        _token_url(),
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials"},
        timeout=30,
    )
    if not resposta.ok:
        raise ErroCnd(f"Falha ao autenticar na API Consulta CND (HTTP {resposta.status_code}): {resposta.text[:500]}")

    payload = resposta.json()
    payload["_obtido_em"] = time.monotonic()
    return payload


def _obter_token() -> str:
    if not os.environ.get("CND_CONSUMER_KEY"):
        return _TOKEN_DEMO_PUBLICO
    with _lock:
        expirado = "access_token" not in _token_cache or time.monotonic() >= (
            _token_cache["_obtido_em"] + _token_cache["expires_in"] - 30
        )
        if expirado:
            _token_cache.clear()
            _token_cache.update(_autenticar())
        return _token_cache["access_token"]


def _logar(status_code: int, from_cache: bool, duracao_ms: int, contribuinte: str) -> None:
    obter_cliente().table("integra_contador_requests_log").insert(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "id_sistema": _ID_SISTEMA,
            "id_servico": _ID_SERVICO,
            "contribuinte_cnpj": contribuinte,
            "status_code": status_code,
            "from_cache": from_cache,
            "duracao_ms": duracao_ms,
        }
    ).execute()


def _chamar(corpo: dict, tentativa_apos_401: bool = False) -> requests.Response:
    resposta = requests.post(
        _gateway_url(),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_obter_token()}",
        },
        json=corpo,
        timeout=30,
    )
    if resposta.status_code == 401 and not tentativa_apos_401:
        with _lock:
            _token_cache.clear()
        return _chamar(corpo, tentativa_apos_401=True)
    return resposta


def consultar_cnd(cnpj: str, gerar_pdf: bool = True) -> dict:
    """
    Consulta/emite a Certidão Negativa de Débitos de um CNPJ. Cacheia o
    resultado final (status 1/2/3/4) por 24h — evita rebilhetar a mesma
    consulta no mesmo dia (só 200 e 201 são bilhetados, incluindo cada
    tentativa em processamento).
    """
    inicio = time.monotonic()

    cacheado = cache.buscar(_ID_SISTEMA, _ID_SERVICO, cnpj, {}, _CACHE_TTL_SEGUNDOS)
    if cacheado is not None:
        _logar(cacheado["status"], True, int((time.monotonic() - inicio) * 1000), cnpj)
        return cacheado["resposta"]

    corpo = {
        "TipoContribuinte": _TIPO_CONTRIBUINTE_PJ,
        "ContribuinteConsulta": cnpj,
        "CodigoIdentificacao": _CODIGO_IDENTIFICACAO_PJ,
        "GerarCertidaoPdf": gerar_pdf,
    }

    tentativas = 0
    while True:
        resposta = _chamar(corpo)
        if not resposta.ok:
            raise ErroCnd(f"API Consulta CND respondeu HTTP {resposta.status_code}: {resposta.text[:1000]}")

        corpo_resposta = resposta.json()
        status = corpo_resposta.get("Status")

        if status == 7:
            tentativas += 1
            if tentativas > _MAX_TENTATIVAS:
                raise ErroCnd(f"Consulta CND de {cnpj} não concluiu após {_MAX_TENTATIVAS} tentativas.")
            corpo["Chave"] = corpo_resposta["Chave"]
            time.sleep(_ESPERA_MINIMA_SEGUNDOS)
            continue

        if status not in _STATUS_TERMINAIS:
            # 5/6 (reprocessar do zero, sem chave) ou algo inesperado.
            tentativas += 1
            if tentativas > _MAX_TENTATIVAS:
                raise ErroCnd(
                    f"Consulta CND de {cnpj} ficou instável (Status {status}: "
                    f"{corpo_resposta.get('Mensagem')}) após {_MAX_TENTATIVAS} tentativas."
                )
            corpo.pop("Chave", None)
            time.sleep(_ESPERA_MINIMA_SEGUNDOS)
            continue

        cache.salvar(_ID_SISTEMA, _ID_SERVICO, cnpj, {}, corpo_resposta, resposta.status_code)
        _logar(resposta.status_code, False, int((time.monotonic() - inicio) * 1000), cnpj)
        return corpo_resposta
