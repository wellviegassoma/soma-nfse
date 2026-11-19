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



def _periodo_sem_movimento(tree, texto: str) -> bool:
    """
    Mês sem nenhuma nota: o site não mostra o quadro-resumo (nenhuma linha
    TRIB.M/ISENTO/...). Antes isso virava "o layout da tela pode ter mudado"
    e a Central do Simples mostrava erro em empresa sem faturamento (relato
    do time, 17/11/2026). Só conta como "sem movimento" se a página é a tela
    logada (sem campo de senha = não caiu no login) e não há rótulo de
    tributação nenhum; se houver rótulo e não deu para ler, aí sim é layout.
    """
    if tree.xpath("//input[@type='password']"):
        return False
    return re.search(r"TRIB.M|TRIB.F|ISENTO|IMUNE|SUSP.[JA]", texto) is None


def _resumo_zerado() -> dict[str, float]:
    return {
        "valor_servicos": 0.0,
        "valor_iss": 0.0,
        "servicos_normais": 0.0,
        "servicos_retidos": 0.0,
        "iss_retido": 0.0,
        "normal": 0.0,
        "retida": 0.0,
        "cancelada": 0.0,
    }

class ClientePetropolis:
    """
    Sessão autenticada no ISS de Petrópolis. Por padrão usa o login único
    do escritório (variáveis de ambiente PETROPOLIS_LOGIN_ISS/
    PETROPOLIS_SENHA_MD5) e escolhe a empresa alvo numa lista de
    clientes. Se `login`/`senha_md5` forem passados (login próprio da
    empresa no site), entra direto nos dados dela — sem lista de
    clientes pra escolher, então não precisa (nem tenta) selecionar por
    CNPJ.

    Uso:
        with ClientePetropolis() as cliente:
            pdf_bytes, resumo = cliente.buscar_guia_iss(cnpj_empresa, "2026-08")
            # resumo = {"valor_servicos": 55300.0, "valor_iss": 1106.0}
    """

    def __init__(self, login: str | None = None, senha_md5: str | None = None):
        # Login próprio da empresa (quando informado) substitui o login
        # único do escritório — nesse caso o site já abre direto nos
        # dados dessa empresa, sem lista de clientes pra escolher.
        self._login_proprio = bool(login and senha_md5)
        self._login = login or os.environ.get("PETROPOLIS_LOGIN_ISS")
        self._senha_md5 = senha_md5 or os.environ.get("PETROPOLIS_SENHA_MD5")
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

    def _selecionar_empresa_por_cmc(self, cmc: str, cnpj_esperado: str) -> None:
        """
        Troca direto pro CMC já conhecido (descoberto manualmente uma vez
        — ver `companies.petropolis_cmc` no soma-nfse) e confere o CNPJ
        devolvido antes de prosseguir. Essa troca só é aceita pelo site
        enquanto a sessão ainda está no estado "lista completa" (logo
        após o login, antes de qualquer troca) — depois da primeira troca
        bem-sucedida a sessão "trava" no cliente ativo e uma segunda
        troca para outro CMC é silenciosamente ignorada (confirmado ao
        vivo em 2026-10-01). Por isso cada `ClientePetropolis` só serve
        pra uma empresa por sessão quando usa login único do escritório.
        """
        resp = self._sessao.post(LOGIN_URL, data={"clientes": cmc}, timeout=30)
        m = re.search(r"CMC\s*([\d]+)\s*-\s*([\d./-]+)", resp.text)
        cnpj_devolvido = _somente_digitos(m.group(2)) if m else None
        if cnpj_devolvido != _somente_digitos(cnpj_esperado):
            raise ErroPetropolis(
                f"CMC {cmc} não corresponde ao CNPJ esperado {cnpj_esperado} "
                f"(o site devolveu CNPJ {cnpj_devolvido or 'nenhum'} — confira se o CMC "
                "cadastrado em companies.petropolis_cmc ainda está correto, ou se a sessão "
                "já estava travada noutra empresa)."
            )

    def listar_clientes_contador(self) -> list[dict[str, str]]:
        """
        SÓ LEITURA: lista completa de clientes do login único do escritório
        (cada <option> traz o CMC em `value` e o nome/descrição em `texto`).
        Precisa ser a PRIMEIRA ação depois do login (a sessão trava no
        cliente escolhido) — por isso um cliente só serve pra esta chamada.
        """
        if self._login_proprio:
            raise ErroPetropolis("Login próprio da empresa não tem lista de clientes.")
        resp = self._sessao.get(f"{BASE_URL}/iss-clientes_contador.php", timeout=30)
        tree = lxml_html.fromstring(resp.text)
        opcoes = tree.xpath("//select[@name='clientes']/option[@value!='']")
        return [
            {"cmc": o.get("value", ""), "texto": " ".join(o.text_content().split())}
            for o in opcoes
        ]

    def _selecionar_empresa_por_cnpj(self, cnpj: str) -> None:
        cnpj_limpo = _somente_digitos(cnpj)
        resp = self._sessao.get(
            f"{BASE_URL}/iss-clientes_contador.php",
            params={"nr_cpfcnpj": _cnpj_formatado(cnpj_limpo)},
            timeout=30,
        )
        tree = lxml_html.fromstring(resp.text)
        opcoes = tree.xpath("//select[@name='clientes']/option[@value!='']")

        # A busca por CNPJ desse endpoint não filtra de verdade — devolve
        # sempre o mesmo placeholder ("Informe o nome da empresa para
        # consultar...", value=1) independente do CNPJ tentado (dígitos
        # crus ou formatado, confirmado ao vivo em 2026-09-02). Escolher
        # sempre a primeira opção sem conferir arriscava selecionar a
        # empresa ERRADA e trazer o resumo/guia de outro cliente do
        # escritório, causando divergência falsa contra o faturamento do
        # SOMA (achado real, empresa RRAD).
        #
        # Causa raiz confirmada ao vivo em 2026-10-01: o campo de busca é
        # mesmo só JS client-side (um <select> populado inteiro no
        # primeiro carregamento, sem busca de verdade no servidor) — não
        # existe endpoint de busca por CNPJ pra consertar. O carregamento
        # inicial de `iss-clientes_contador.php`, logo após o login e
        # ANTES de qualquer troca de cliente nessa sessão, devolve a lista
        # completa dos clientes do escritório (cada `<option>` já traz o
        # CMC); a partir daí dá pra escolher qualquer um só uma vez — a
        # sessão trava no cliente escolhido depois disso. Por isso a
        # correção de verdade é `_selecionar_empresa_por_cmc`: descobrir o
        # CMC de cada empresa manualmente uma vez (logando no site,
        # abrindo essa página sem filtro, achando o nome na lista) e
        # guardar em `companies.petropolis_cmc` — daí em diante nunca mais
        # precisa desta busca quebrada pra ela. Esta função continua só
        # como fallback pra quem ainda não teve o CMC descoberto.
        opcao_certa = next(
            (o for o in opcoes if cnpj_limpo in _somente_digitos(o.text_content())), None
        )
        if opcao_certa is None:
            opcoes_texto = "; ".join(
                f"value={o.get('value')!r} text={o.text_content().strip()!r}" for o in opcoes[:10]
            )
            print(
                f"[petropolis_client] busca por CNPJ {cnpj} não encontrou a empresa — "
                f"url={resp.url} status={resp.status_code} opcoes=[{opcoes_texto}]"
            )
            raise ErroPetropolis(
                f"Não consegui encontrar a empresa de CNPJ {cnpj} na busca do ISS de "
                "Petrópolis (a busca por CNPJ desse site não está filtrando como esperado) "
                "— acesse o site com o login do escritório, logo após logar abra "
                "iss-clientes_contador.php sem filtro nenhum (mostra a lista completa), "
                "ache o CMC dessa empresa e cadastre em companies.petropolis_cmc."
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
        Resumo do período pra guia de ISS, lido do quadro-resumo de
        iss-consulta_periodos.php (uma linha por tributação: TRIB.M, ISENTO,
        TRIB.F, IMUNE, SUSP.J, SUSP.A; colunas em pares valor/ISS: Normal |
        Cancelado | Retido | Substituto | ...).

        valor_servicos = Normal + Retido — o faturamento da empresa inclui as
        notas com ISS retido pelo tomador, e é isso que se compara com o SOMA.
        valor_iss = só o ISS das notas Normais: o retido é recolhido pelo
        tomador e não entra na guia (confirmado ao vivo em 11/2026: Normal
        48.545,12 + Retido 42.537,38 = 91.082,50 das notas; guia 970,90).
        """
        mesano = f"{mes:02d}{ano:04d}"
        resp = self._sessao.get(
            f"{BASE_URL}/iss-consulta_periodos.php", params={"mesano": mesano}, timeout=30
        )
        tree = lxml_html.fromstring(resp.text)
        normal = iss_normal = retida = iss_retido = 0.0
        linhas_resumo = 0
        for tr in tree.xpath("//tr"):
            tds = tr.xpath("./td")
            if len(tds) < 7:
                continue
            rotulo = " ".join(tds[0].text_content().split())
            if not re.match(r"^(TRIB\.M|ISENTO|TRIB\.F|IMUNE|SUSP\.J|SUSP\.A)\s*=", rotulo):
                continue
            try:
                n = _valor_para_float(tds[1].text_content())
                i = _valor_para_float(tds[2].text_content())
                r = _valor_para_float(tds[5].text_content())
                ir = _valor_para_float(tds[6].text_content())
            except ValueError:
                continue
            normal += n
            iss_normal += i
            retida += r
            iss_retido += ir
            linhas_resumo += 1
        if linhas_resumo == 0:
            if _periodo_sem_movimento(tree, resp.text):
                return _resumo_zerado()
            raise ErroPetropolis(
                "Não consegui ler o quadro-resumo do período no ISS de Petrópolis "
                "(o layout da tela pode ter mudado)."
            )
        return {
            "valor_servicos": normal + retida,
            "valor_iss": iss_normal,
            "servicos_normais": normal,
            "servicos_retidos": retida,
            "iss_retido": iss_retido,
        }

    def consultar_faturamento(
        self, cnpj: str, competencia: str, cmc: str | None = None
    ) -> dict[str, float]:
        """
        SÓ LEITURA: devolve o valor de serviços/ISS que o site da Prefeitura
        já tem pro período (iss-consulta_periodos.php), sem consolidar nada
        e sem buscar/gerar guia. Usado pra conferir o faturamento do Simples
        Nacional (que não tem guia de ISS) contra as notas importadas.

        Exige login próprio da empresa OU CMC conhecido — nunca cai na busca
        por CNPJ do login único, que não filtra de verdade e já devolveu os
        dados de outra empresa uma vez (ver _selecionar_empresa_por_cnpj).
        """
        if not self._login_proprio:
            if not cmc:
                raise ErroPetropolis(
                    "Sem acesso a esta empresa no ISS de Petrópolis — cadastre o CMC "
                    "(Dados fiscais) ou o login próprio da empresa (aba Impostos)."
                )
            self._selecionar_empresa_por_cmc(cmc, cnpj)
        ano, mes = _ano_mes_da_competencia(competencia)
        resumo = self._faturamento_do_periodo(ano, mes)
        resumo["linhas"] = self._linhas_brutas_periodo(ano, mes)
        return resumo

    def _faturamento_do_periodo(self, ano: int, mes: int) -> dict[str, float]:
        """
        Faturamento do prestador no período = notas NORMAIS + notas RETIDAS
        (ISS retido pelo tomador também é receita da empresa). Fica de fora
        CANCELADA e TOMADOR (nota de entrada). Lê o quadro-resumo no fim da
        tela (uma linha por tipo de tributação: TRIB.M, ISENTO, TRIB.F, IMUNE,
        SUSP.J, SUSP.A) — total do período inteiro, não depende de paginação.
        Colunas, em pares (valor, ISS): Normal | Cancelada | Retida | outra
        (zerada nos casos vistos) | Tomador — confirmado ao vivo (HERA, 09/2026:
        Normal 23.600,00 + Retida 1.433,28 = soma das notas emitidas).
        """
        mesano = f"{mes:02d}{ano:04d}"
        resp = self._sessao.get(
            f"{BASE_URL}/iss-consulta_periodos.php", params={"mesano": mesano}, timeout=30
        )
        tree = lxml_html.fromstring(resp.text)
        normal = retida = cancelada = outra = 0.0
        linhas_resumo = 0
        for tr in tree.xpath("//tr"):
            tds = tr.xpath("./td")
            if len(tds) < 11:
                continue
            rotulo = " ".join(tds[0].text_content().split())
            if not re.match(r"^(TRIB\.M|ISENTO|TRIB\.F|IMUNE|SUSP\.J|SUSP\.A)\s*=", rotulo):
                continue
            try:
                normal += _valor_para_float(tds[1].text_content())
                cancelada += _valor_para_float(tds[3].text_content())
                retida += _valor_para_float(tds[5].text_content())
                outra += _valor_para_float(tds[7].text_content())
            except ValueError:
                continue
            linhas_resumo += 1
        if linhas_resumo == 0:
            if _periodo_sem_movimento(tree, resp.text):
                return _resumo_zerado()
            raise ErroPetropolis(
                "Não consegui ler o quadro-resumo do período no ISS de Petrópolis "
                "(o layout da tela pode ter mudado)."
            )
        if outra > 0.005:
            raise ErroPetropolis(
                f"O ISS de Petrópolis mostra R$ {outra:.2f} numa coluna que esta conferência "
                "não sabe interpretar — confira o período direto no site."
            )
        return {
            "valor_servicos": normal + retida,
            "valor_iss": 0.0,
            "normal": normal,
            "retida": retida,
            "cancelada": cancelada,
        }

    def _linhas_brutas_periodo(self, ano: int, mes: int) -> list[list[str]]:
        """Texto cru de toda linha (>=3 colunas) da tela de consulta do período —
        usado pra conferir quais colunas existem (Normal, Retido...)."""
        mesano = f"{mes:02d}{ano:04d}"
        resp = self._sessao.get(
            f"{BASE_URL}/iss-consulta_periodos.php", params={"mesano": mesano}, timeout=30
        )
        tree = lxml_html.fromstring(resp.text)
        linhas: list[list[str]] = []
        for tr in tree.xpath("//tr"):
            tds = tr.xpath("./td|./th")
            if len(tds) < 3:
                continue
            textos = [" ".join(td.text_content().split()) for td in tds]
            if any(textos):
                linhas.append(textos)
        return linhas[:60]

    # Páginas que o diagnóstico pode abrir — só GET, só leitura. Nada de
    # emissao_boleto.php nem iss-consolidar_periodo.php (ações reais).
    _PAGINAS_DIAGNOSTICO = {
        "iss-levantamento_debitos.php",
        "iss-consulta_periodos.php",
        "index.php",
        # ISS retido como tomador (Movimento Econômico → Retido) e a
        # integração com a NFS-e Nacional — só consulta (GET).
        "iss-periodos_retencao.php",
        "iss-consulta_integracao_nfsnacional.php",
        "iss-consulta_lancamento.php",
    }

    def diagnosticar(self, cnpj: str, cmc: str | None, pagina: str, params: dict[str, str]) -> dict:
        """SÓ LEITURA: abre uma página da lista acima (GET) e descreve a
        estrutura — selects com opções, campos de formulário, tabelas e
        links do menu — pra descobrir onde o site mostra guia paga."""
        if pagina not in self._PAGINAS_DIAGNOSTICO:
            raise ErroPetropolis(f"Página não permitida no diagnóstico: {pagina}")
        if not self._login_proprio:
            if cmc:
                self._selecionar_empresa_por_cmc(cmc, cnpj)
            else:
                self._selecionar_empresa_por_cnpj(cnpj)
        resp = self._sessao.get(f"{BASE_URL}/{pagina}", params=params, timeout=45)
        tree = lxml_html.fromstring(resp.text)
        selects = [
            {
                "name": sel.get("name") or sel.get("id"),
                "opcoes": [
                    f"{o.get('value')}:{' '.join(o.text_content().split())}"[:60]
                    for o in sel.xpath(".//option")
                ][:30],
            }
            for sel in tree.xpath("//select")
        ]
        campos = sorted(
            {f"{i.get('name')}[{i.get('type', 'text')}]" for i in tree.xpath("//input[@name]")}
        )[:80]
        links = sorted(
            {
                f"{' '.join(a.text_content().split())[:40]} -> {a.get('href')}"
                for a in tree.xpath("//a[@href]")
                if a.get("href") and not a.get("href").startswith("javascript")
            }
        )[:150]
        # Menu do site abre as páginas por JavaScript (href="#") — guarda o
        # destino do onclick/data-* pra descobrir a URL de cada item.
        acoes = sorted(
            {
                f"{' '.join(el.text_content().split())[:40]} -> {(el.get('onclick') or el.get('data-href') or el.get('data-url') or '')[:120]}"
                for el in tree.xpath("//*[@onclick or @data-href or @data-url]")
                if ".php" in (el.get("onclick") or el.get("data-href") or el.get("data-url") or "")
            }
        )[:150]
        scripts_php = sorted(
            set(re.findall(r"[\w./-]+\.php(?:\?[\w=&%-]*)?", " ".join(tree.xpath("//script/text()"))))
        )[:150]
        tabelas = []
        for t in tree.xpath("//table[not(.//table)]"):
            linhas = [
                " | ".join(" ".join(c.text_content().split())[:40] for c in tr.xpath("./td|./th"))
                for tr in t.xpath(".//tr")
            ]
            linhas = [l for l in linhas if l.strip(" |")]
            if linhas:
                tabelas.append(linhas[:25])
        return {
            "url": resp.url.replace(BASE_URL, ""),
            "status": resp.status_code,
            "selects": selects,
            "campos": campos,
            "links": links,
            "acoes": acoes,
            "scripts_php": scripts_php,
            "tabelas": tabelas[:20],
        }

    def _linhas_debitos(self, st_parcela: str) -> list[dict[str, str]]:
        """Linhas do Levantamento de Débitos (st_parcela 1 = Aberta,
        2 = Paga — confirmado ao vivo em 17/11/2026), por nome de coluna:
        Identif. | Exercício | Dívida | Ref. | Parc. | Notifica | Vencimento |
        Valor | Correção | Multa | Juros | Total | Pago."""
        resp = self._sessao.get(
            f"{BASE_URL}/iss-levantamento_debitos.php",
            params={"st_divida": "0", "st_parcela": st_parcela},
            timeout=45,
        )
        if "não foram localizados" in resp.text.lower():
            return []
        tree = lxml_html.fromstring(resp.text)
        for tabela in tree.xpath("//table[not(.//table)]"):
            trs = tabela.xpath(".//tr")
            if not trs:
                continue
            cab = [" ".join(c.text_content().split()) for c in trs[0].xpath("./td|./th")]
            if "Identif." not in cab or "Vencimento" not in cab:
                continue
            linhas = []
            for tr in trs[1:]:
                cel = [" ".join(c.text_content().split()) for c in tr.xpath("./td|./th")]
                if len(cel) < len(cab) - 1:
                    continue
                linha = {cab[i]: cel[i] for i in range(min(len(cab), len(cel))) if cab[i]}
                if linha.get("Identif."):
                    linhas.append(linha)
            return linhas
        return []

    def verificar_pagamento_iss(self, cnpj: str, competencia: str, cmc: str | None = None) -> dict:
        """SÓ LEITURA: situação da guia de ISS da competência — procura a
        dívida de ISS (código começando com "I", ex.: "IV." = ISS variável)
        cujo vencimento corresponde à competência (dia 10 do mês seguinte)
        nas parcelas pagas e nas em aberto."""
        ano_mes = _ano_mes_da_competencia(competencia)
        if not self._login_proprio:
            if cmc:
                self._selecionar_empresa_por_cmc(cmc, cnpj)
            else:
                self._selecionar_empresa_por_cnpj(cnpj)

        def da_competencia(linhas: list[dict[str, str]]) -> list[dict]:
            achadas = []
            for l in linhas:
                divida = l.get("Dívida", "").upper()
                if not divida.startswith("I"):
                    continue
                if _competencia_do_vencimento(l.get("Vencimento", "")) != ano_mes:
                    continue
                total = l.get("Total") or l.get("Valor") or "0"
                try:
                    valor = _valor_para_float(total)
                except ValueError:
                    valor = None
                achadas.append({
                    "identificador": l.get("Identif."),
                    "divida": l.get("Dívida"),
                    "vencimento": l.get("Vencimento"),
                    "valor": valor,
                    "pago_em": l.get("Pago") or None,
                })
            return achadas

        pagas = da_competencia(self._linhas_debitos("2"))
        abertas = da_competencia(self._linhas_debitos("1"))
        status = "paga" if pagas and not abertas else "parcial" if pagas else "aberta" if abertas else "sem_guia"
        return {"status": status, "pagas": pagas, "abertas": abertas}

    def buscar_guia_iss(
        self, cnpj: str, competencia: str | None = None, cmc: str | None = None
    ) -> tuple[bytes, dict[str, float]]:
        ano_mes_alvo = _ano_mes_da_competencia(competencia)

        if not self._login_proprio:
            if cmc:
                self._selecionar_empresa_por_cmc(cmc, cnpj)
            else:
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
        self, cnpj: str, competencia: str | None = None, cmc: str | None = None
    ) -> tuple[bytes, dict[str, float]]:
        """
        Consolida o período (ação real, ver `_consolidar_periodo`) e, na
        sequência, busca a guia recém-criada. Uso: só depois que quem
        chamou já mostrou o resumo (via ErroGuiaNaoConsolidada.resumo) e
        teve confirmação explícita do usuário de que o valor bate.
        """
        ano, mes = _ano_mes_da_competencia(competencia)
        if not self._login_proprio:
            if cmc:
                self._selecionar_empresa_por_cmc(cmc, cnpj)
            else:
                self._selecionar_empresa_por_cnpj(cnpj)
        self._consolidar_periodo(ano, mes)
        return self.buscar_guia_iss(cnpj, competencia, cmc)
