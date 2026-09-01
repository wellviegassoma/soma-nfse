"""
petropolis_client.py

Cliente para o sistema de ISS de Petrópolis-RJ
(petropolis-rj.prefeituramoderna.com.br/meuiss_new) — busca da guia de
ISS já consolidada (boleto) de uma empresa cliente do escritório.

Diferente do Nota Carioca: aqui o login é ÚNICO por escritório (CNPJ do
contador + senha), não por certificado da empresa — dentro do sistema o
contador escolhe qual empresa cliente acessar. E diferente do Nota
Carioca, esse site NÃO bloqueia clientes HTTP não-navegador — um cliente
`requests` comum funciona (confirmado ao vivo), então não precisa de
Playwright/Chromium aqui.

## Senha nunca em texto puro

O formulário de login calcula o MD5 da senha no navegador
(onkeyup="this.form.senha_iss.value = MD5(...)") e só envia o hash pro
servidor — a senha em si nunca trafega. Por isso as credenciais aqui são
só CNPJ + hash MD5 (PETROPOLIS_LOGIN_ISS / PETROPOLIS_SENHA_MD5),
configuradas via variável de ambiente, nunca a senha em texto.

## Fluxo confirmado ao vivo (01/09/2026)

1. POST index.php com login_iss=<cnpj> e senha_iss=<md5> — cria sessão.
2. POST index.php com clientes=<id interno> — troca pra empresa alvo
   (id obtido buscando por CNPJ em iss-clientes_contador.php).
3. GET iss-levantamento_debitos.php (status_parcela=1 "Aberta") — lista
   os débitos/guias pendentes. Cada linha tem um <form name="AForm"> com
   os campos ocultos necessários pra emitir o boleto daquela parcela
   específica.
4. POST emissao_boleto.php?st_cartao=1 com esses campos + bt_boleto=0 —
   devolve o PDF da guia diretamente (confirmado: PDF válido com linha
   digitável real).

IMPORTANTE — isso só busca guia de um período JÁ CONSOLIDADO. A
consolidação do período (fechamento do movimento econômico do mês,
que exige informar/confirmar "Faturamento de Vendas") é uma decisão
contábil por competência que este cliente NÃO automatiza — precisa ser
feita manualmente no site antes de haver uma guia pra buscar aqui.
"""

from __future__ import annotations

import os
import re

import requests
from lxml import html as lxml_html

BASE_URL = "https://petropolis-rj.prefeituramoderna.com.br/meuiss_new"
LOGIN_URL = f"{BASE_URL}/index.php"

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Campos ocultos do <form name="AForm"> de cada linha de débito — os que
# precisam ser reenviados pra emissao_boleto.php pra emitir aquela guia.
_CAMPOS_BOLETO = [
    "id_dividasparcelas", "nr_parcela", "st_unica", "dt_corrige",
    "ds_divida", "vl_multa", "vl_juros", "vl_correcao", "st_divida",
    "vl_parcela", "id_dividas", "st_parcela",
]


class ErroPetropolis(Exception):
    pass


def _somente_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto)


def _mes_esperado_do_vencimento(vencimento: str) -> int | None:
    """
    ISS Variável em Petrópolis vence no dia 10 do mês seguinte à
    competência (confirmado ao vivo: competência 08/2026 → vencimento
    10/09/2026) — usado só como heurística pra casar "competência
    pedida" com a linha certa quando há mais de um débito em aberto.
    """
    m = re.match(r"\d{2}/(\d{2})/(\d{4})", vencimento)
    if not m:
        return None
    mes_vencimento, ano_vencimento = int(m.group(1)), int(m.group(2))
    mes_competencia = mes_vencimento - 1 if mes_vencimento > 1 else 12
    return mes_competencia


class ClientePetropolis:
    """
    Sessão autenticada no ISS de Petrópolis com o login único do
    escritório (variáveis de ambiente PETROPOLIS_LOGIN_ISS/
    PETROPOLIS_SENHA_MD5).

    Uso:
        with ClientePetropolis() as cliente:
            pdf_bytes = cliente.buscar_guia_iss(cnpj_empresa, "2026-08")
    """

    def __init__(self):
        self._login = os.environ.get("PETROPOLIS_LOGIN_ISS")
        self._senha_md5 = os.environ.get("PETROPOLIS_SENHA_MD5")
        if not self._login or not self._senha_md5:
            raise ErroPetropolis(
                "PETROPOLIS_LOGIN_ISS / PETROPOLIS_SENHA_MD5 não configurados no servidor."
            )
        self._sessao = requests.Session()
        self._sessao.headers.update({"User-Agent": _USER_AGENT})

    def __enter__(self) -> "ClientePetropolis":
        self._login_sessao()
        return self

    def __exit__(self, *exc_info):
        self._sessao.close()

    def _login_sessao(self) -> None:
        self._sessao.get(f"{LOGIN_URL}?out=2", timeout=30)
        resp = self._sessao.post(
            LOGIN_URL,
            data={"login_iss": self._login, "senha_iss": self._senha_md5},
            timeout=30,
        )
        texto = resp.text.lower()
        if "sair" not in texto or "senha inv" in texto or "usuário ou senha" in texto:
            raise ErroPetropolis(
                "Login no ISS de Petrópolis falhou — verifique "
                "PETROPOLIS_LOGIN_ISS/PETROPOLIS_SENHA_MD5."
            )

    def _selecionar_empresa_por_cnpj(self, cnpj: str) -> None:
        cnpj_limpo = _somente_digitos(cnpj)
        resp = self._sessao.get(
            f"{BASE_URL}/iss-clientes_contador.php",
            params={"nr_cpfcnpj": cnpj_limpo},
            timeout=30,
        )
        tree = lxml_html.fromstring(resp.text)
        opcoes = tree.xpath("//select[@name='clientes']/option[@value!='']")
        if not opcoes:
            raise ErroPetropolis(
                f"Nenhuma empresa encontrada no ISS de Petrópolis pro CNPJ {cnpj} "
                "(confira se está vinculada ao login do contador)."
            )
        empresa_id = opcoes[0].get("value")
        self._sessao.post(LOGIN_URL, data={"clientes": empresa_id}, timeout=30)

    def _extrair_linha_debito(self, html: str, mes_alvo: int | None) -> dict[str, str] | None:
        tree = lxml_html.fromstring(html)
        formularios = tree.xpath("//form[@name='AForm']")
        candidatos = []
        for form in formularios:
            campos = {}
            for nome in _CAMPOS_BOLETO:
                els = form.xpath(f".//input[@name='{nome}']")
                if not els:
                    break
                campos[nome] = els[0].get("value", "")
            else:
                candidatos.append(campos)

        if not candidatos:
            return None
        if mes_alvo is None:
            return candidatos[0]
        for campos in candidatos:
            if _mes_esperado_do_vencimento(campos["dt_corrige"]) == mes_alvo:
                return campos
        return None

    def buscar_guia_iss(self, cnpj: str, competencia: str | None = None) -> bytes:
        mes_alvo: int | None = None
        if competencia:
            _, mes_str = competencia.split("-")
            mes_alvo = int(mes_str)

        self._selecionar_empresa_por_cnpj(cnpj)

        resp = self._sessao.get(
            f"{BASE_URL}/iss-levantamento_debitos.php",
            params={"st_divida": "0", "st_parcela": "1"},
            timeout=30,
        )
        if "não foram localizados" in resp.text.lower():
            raise ErroPetropolis(
                "Nenhuma guia de ISS pendente encontrada — o período precisa ser "
                "consolidado manualmente no site antes de gerar a guia."
            )

        campos = self._extrair_linha_debito(resp.text, mes_alvo)
        if campos is None:
            raise ErroPetropolis(
                f"Nenhuma guia pendente encontrada para a competência "
                f"{competencia or 'atual'}."
            )

        r = self._sessao.post(
            f"{BASE_URL}/emissao_boleto.php",
            params={"st_cartao": "1"},
            data={**campos, "bt_boleto": "0"},
            timeout=45,
        )
        if "pdf" not in r.headers.get("content-type", "").lower():
            raise ErroPetropolis("Não foi possível gerar o PDF da guia de ISS.")
        return r.content
