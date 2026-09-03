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

`buscar_guia_iss` só busca guia de um período JÁ CONSOLIDADO — se não
houver, levanta `ErroGuiaNaoConsolidada` já com o resumo (valor de
serviços lançado até agora) da competência, pra quem chamar decidir se
quer consolidar. `consolidar_e_buscar_guia` faz o fechamento do período
de verdade (sempre assumindo "sem faturamento de vendas" — ver docstring
do método) e busca a guia na sequência; só deve ser chamado depois de
confirmação explícita do usuário, nunca automaticamente.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

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


class ErroGuiaNaoConsolidada(ErroPetropolis):
    """
    Levantada quando não há guia pendente pra competência pedida — via
    de regra porque o período ainda não foi consolidado no site. Ainda
    carrega o resumo (valor de serviços já lançado) da competência pra
    quem pegar esse erro poder mostrar antes de decidir consolidar.
    """

    def __init__(self, mensagem: str, resumo: dict[str, float]):
        super().__init__(mensagem)
        self.resumo = resumo


def _somente_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto)


def _cnpj_formatado(cnpj_limpo: str) -> str:
    """'36077179000122' -> '36.077.179/0001-22' — o campo de busca do
    site é o mesmo usado pelo autocomplete "digite para buscar" da UI,
    que parece esperar a máscara e não os dígitos crus (confirmado ao
    vivo: buscar só com dígitos devolve a lista vazia/placeholder)."""
    return (
        f"{cnpj_limpo[0:2]}.{cnpj_limpo[2:5]}.{cnpj_limpo[5:8]}/"
        f"{cnpj_limpo[8:12]}-{cnpj_limpo[12:14]}"
    )


def _valor_para_float(texto: str) -> float:
    """'55.300,00' -> 55300.0"""
    return float(texto.strip().replace(".", "").replace(",", "."))


def _ano_mes_da_competencia(competencia: str | None) -> tuple[int, int]:
    if competencia:
        ano_str, mes_str = competencia.split("-")
        return int(ano_str), int(mes_str)
    agora = datetime.now(timezone(timedelta(hours=-3)))  # horário de Brasília
    return agora.year, agora.month


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
            params={"nr_cpfcnpj": _cnpj_formatado(cnpj_limpo)},
            timeout=30,
        )
        tree = lxml_html.fromstring(resp.text)
        opcoes = tree.xpath("//select[@name='clientes']/option[@value!='']")
        if not opcoes:
            # Diagnóstico temporário — descobrir de verdade o que a
            # página devolveu em vez de seguir chutando o formato do
            # parâmetro de busca.
            selects = tree.xpath("//select")
            selects_info = "; ".join(
                f"name={s.get('name')!r} options={len(s.xpath('.//option'))}" for s in selects
            )
            raise ErroPetropolis(
                f"Nenhuma empresa encontrada no ISS de Petrópolis pro CNPJ {cnpj} "
                f"(confira se está vinculada ao login do contador). DEBUG status={resp.status_code} "
                f"url={resp.url} selects=[{selects_info}] corpo(1500)={resp.text[:1500]!r}"
            )
        # A busca por CNPJ no site nem sempre filtra de verdade — já
        # confirmado devolver mais de uma opção (ou não filtrar nada)
        # pro mesmo parâmetro. Escolher sempre a primeira sem conferir
        # arriscava selecionar a empresa ERRADA e trazer o resumo/guia
        # de outro cliente do escritório, causando divergência falsa
        # contra o faturamento do SOMA (achado real, empresa RRAD).
        opcao_certa = next(
            (o for o in opcoes if cnpj_limpo in _somente_digitos(o.text_content())), None
        )
        if opcao_certa is None:
            opcoes_texto = "; ".join(
                f"value={o.get('value')!r} text={o.text_content().strip()!r}" for o in opcoes[:10]
            )
            raise ErroPetropolis(
                f"A busca no ISS de Petrópolis pro CNPJ {cnpj} não devolveu essa empresa "
                f"entre as opções (achou {len(opcoes)}: {opcoes_texto}) — não assumindo a "
                "primeira opção pra não pegar guia/resumo de empresa errada. "
                f"DEBUG url={resp.url} status={resp.status_code}"
            )
        empresa_id = opcao_certa.get("value")
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
        ano_mes_alvo = _ano_mes_da_competencia(competencia)

        self._selecionar_empresa_por_cnpj(cnpj)

        resp = self._sessao.get(
            f"{BASE_URL}/iss-levantamento_debitos.php",
            params={"st_divida": "0", "st_parcela": "1"},
            timeout=30,
        )
        sem_debito = "não foram localizados" in resp.text.lower()
        resultado = None if sem_debito else self._extrair_linha_debito(resp.text, ano_mes_alvo)

        if resultado is None:
            resumo = self._consultar_resumo_periodo(*ano_mes_alvo)
            raise ErroGuiaNaoConsolidada(
                f"Nenhuma guia de ISS pendente pra competência {competencia or 'atual'} — "
                "o período ainda não foi consolidado.",
                resumo=resumo,
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

    def _consolidar_periodo(self, ano: int, mes: int) -> None:
        """
        Fecha o movimento econômico do período — cria a guia oficial de
        ISS. Ação real e (segundo o próprio site) só desfazível via
        retificação: "Após a confirmação só é permitido retificar ou
        desconsolidar todo período."

        Sempre envia "sem faturamento de vendas" (campo valorvendas
        vazio) — assume que a empresa só presta serviço, sem venda de
        mercadoria própria (verdadeiro pra todas as empresas do
        escritório testadas até agora). Se algum cliente vender
        mercadoria além do serviço, esse valor precisa ser informado
        manualmente no site — não dá pra automatizar sem saber o valor.
        """
        mesano = f"{mes:02d}{ano:04d}"
        self._sessao.post(
            f"{BASE_URL}/iss-consolidar_periodo.php",
            data={
                "mesano_final": mesano,
                "st_consolida": "1",
                "servicosmatrizfilial": "",
                "vendasmatrizfilial": "",
                "valorvendas": "",
                "valorfolhas": "",
                "vl_servicosexterior": "",
            },
            timeout=45,
        )

    def consolidar_e_buscar_guia(
        self, cnpj: str, competencia: str | None = None
    ) -> tuple[bytes, dict[str, float]]:
        """
        Consolida o período (ação real, ver `_consolidar_periodo`) e, na
        sequência, busca a guia recém-criada. Uso: só depois que quem
        chamou já mostrou o resumo (via ErroGuiaNaoConsolidada.resumo) e
        teve confirmação explícita do usuário de que o valor bate.
        """
        ano, mes = _ano_mes_da_competencia(competencia)
        self._selecionar_empresa_por_cnpj(cnpj)
        self._consolidar_periodo(ano, mes)
        return self.buscar_guia_iss(cnpj, competencia)
