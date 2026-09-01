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
5. GET iss-consulta_periodos.php?mesano=MMAAAA — mostra um resumo por
   tipo de tributação (TRIB.M, ISENTO, TRIB.F, IMUNE, SUSP.J, SUSP.A),
   cada linha com valor de serviços + ISS da coluna "Normal". A soma
   dessas linhas bate exatamente com o "Valor Total"/"Valor Imposto"
   mostrado na tela de consolidação — é o valor de serviços que gerou a
   guia, útil pra conferir contra o faturamento já registrado no SOMA.

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


def _valor_para_float(texto: str) -> float:
    """'55.300,00' -> 55300.0"""
    return float(texto.strip().replace(".", "").replace(",", "."))


_REGEX_DATA = re.compile(r"^\d{2}/\d{2}/\d{4}$")


def _competencia_do_vencimento(vencimento: str) -> tuple[int, int] | None:
    """
    ISS Variável em Petrópolis vence no dia 10 do mês seguinte à
    competência (confirmado ao vivo: competência 08/2026 → vencimento
    10/09/2026) — usado como heurística pra casar "competência pedida"
    com a linha certa quando há mais de um débito em aberto. Devolve
    (ano, mes) da competência, não do vencimento.
    """
    m = re.match(r"\d{2}/(\d{2})/(\d{4})", vencimento)
    if not m:
        return None
    mes_vencimento, ano_vencimento = int(m.group(1)), int(m.group(2))
    if mes_vencimento > 1:
        return ano_vencimento, mes_vencimento - 1
    return ano_vencimento - 1, 12


class ClientePetropolis:
    """
    Sessão autenticada no ISS de Petrópolis com o login único do
    escritório (variáveis de ambiente PETROPOLIS_LOGIN_ISS/
    PETROPOLIS_SENHA_MD5).

    Uso:
        with ClientePetropolis() as cliente:
            pdf_bytes, resumo = cliente.buscar_guia_iss(cnpj_empresa, "2026-08")
            # resumo = {"valor_servicos": 55300.0, "valor_iss": 1106.0}
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

    def _extrair_linha_debito(
        self, html: str, ano_mes_alvo: tuple[int, int] | None
    ) -> tuple[dict[str, str], tuple[int, int]] | None:
        """
        Devolve (campos_do_form, (ano, mes)_da_competencia) da linha de
        débito escolhida. A competência de cada linha é derivada do
        "Vencimento" VISÍVEL na tabela (não do campo oculto dt_corrige,
        que é só a data de hoje usada pra cálculo de correção — mesmo
        valor em todas as linhas, não identifica a linha).
        """
        tree = lxml_html.fromstring(html)
        linhas = tree.xpath("//tr[.//form[@name='AForm']]")
        candidatos: list[tuple[dict[str, str], tuple[int, int]]] = []
        for linha in linhas:
            form = linha.xpath(".//form[@name='AForm']")[0]
            campos = {}
            for nome in _CAMPOS_BOLETO:
                els = form.xpath(f".//input[@name='{nome}']")
                if not els:
                    break
                campos[nome] = els[0].get("value", "")
            else:
                textos = linha.xpath(".//td/div[@align='center']/text()")
                datas = [t.strip() for t in textos if _REGEX_DATA.match(t.strip())]
                if not datas:
                    continue
                competencia_linha = _competencia_do_vencimento(datas[0])
                if competencia_linha is not None:
                    candidatos.append((campos, competencia_linha))

        if not candidatos:
            return None
        if ano_mes_alvo is None:
            return candidatos[0]
        for campos, competencia_linha in candidatos:
            if competencia_linha == ano_mes_alvo:
                return campos, competencia_linha
        return None

    def _consultar_resumo_periodo(self, ano: int, mes: int) -> dict[str, float]:
        """
        Soma, por tipo de tributação (TRIB.M/ISENTO/TRIB.F/IMUNE/SUSP.J/
        SUSP.A), a coluna "Normal" de valor de serviços e ISS — o total
        bate com o que a tela de consolidação mostrou como "Valor Total"
        e "Valor Imposto" (confirmado ao vivo).
        """
        mesano = f"{mes:02d}{ano:04d}"
        resp = self._sessao.get(
            f"{BASE_URL}/iss-consulta_periodos.php", params={"mesano": mesano}, timeout=30
        )
        tree = lxml_html.fromstring(resp.text)
        linhas = tree.xpath("//tr[td/div/strong]")
        total_servicos = 0.0
        total_iss = 0.0
        for linha in linhas:
            tds = linha.xpath("./td")
            if len(tds) < 3:
                continue
            try:
                total_servicos += _valor_para_float(tds[1].text_content())
                total_iss += _valor_para_float(tds[2].text_content())
            except ValueError:
                continue
        return {"valor_servicos": total_servicos, "valor_iss": total_iss}

    def buscar_guia_iss(
        self, cnpj: str, competencia: str | None = None
    ) -> tuple[bytes, dict[str, float]]:
        ano_mes_alvo: tuple[int, int] | None = None
        if competencia:
            ano_str, mes_str = competencia.split("-")
            ano_mes_alvo = (int(ano_str), int(mes_str))

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

        resultado = self._extrair_linha_debito(resp.text, ano_mes_alvo)
        if resultado is None:
            raise ErroPetropolis(
                f"Nenhuma guia pendente encontrada para a competência "
                f"{competencia or 'atual'}."
            )
        campos, (ano, mes) = resultado

        r = self._sessao.post(
            f"{BASE_URL}/emissao_boleto.php",
            params={"st_cartao": "1"},
            data={**campos, "bt_boleto": "0"},
            timeout=45,
        )
        if "pdf" not in r.headers.get("content-type", "").lower():
            raise ErroPetropolis("Não foi possível gerar o PDF da guia de ISS.")

        resumo = self._consultar_resumo_periodo(ano, mes)
        return r.content, resumo
