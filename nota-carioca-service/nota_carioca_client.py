"""
nota_carioca_client.py

Cliente para o portal Nota Carioca (notacarioca.rio.gov.br) da Prefeitura
do Rio de Janeiro — login com o certificado A1 da empresa (ICP-Brasil) e
busca/emissão da guia de recolhimento de ISS.

## Por que Playwright (Chromium de verdade) e não `requests`

Confirmado ao vivo, duas vezes (dev local e a partir do Railway): uma
conexão HTTPS feita por um cliente HTTP puro (`requests`, `curl`) pra
notacarioca.rio.gov.br é derrubada com `ConnectionResetError` durante o
handshake TLS — acontece mesmo SEM nenhum certificado anexado, então não
é sobre o certificado nem sobre a rede de origem: o servidor rejeita
qualquer cliente que não tenha o fingerprint de TLS de um navegador de
verdade. Um Chromium real (via Playwright) conecta normalmente.

## Certificados legados (RC2/3DES)

Vários certificados A1 de ACs brasileiras usam PKCS12 com criptografia
antiga (RC2/3DES) que o OpenSSL 3.x embutido no Chromium recusa carregar
("Unsupported TLS certificate... deprecated by OpenSSL"). A biblioteca
`cryptography` do Python lê esse formato antigo sem problema — então
`_modernizar_pfx` decodifica o PKCS12 original e reempacota num PKCS12
novo com AES (`BestAvailableEncryption`), tudo em memória, antes de
entregar pro Playwright.

## Fluxo confirmado ao vivo (01/09/2026, certificado real da COE)

1. GET /senhaweb/loginICP.aspx — o servidor reconhece o certificado
   (handshake mTLS) e mostra uma página de confirmação ("O seguinte
   certificado digital foi identificado com sucesso: ...").
2. Clique no botão de postback ACESSAR O SISTEMA
   (#ctl00_cphCabMenu_btAcesso) — cria a sessão autenticada.
3. GET /contribuinte/guias.aspx — grid com uma linha por competência em
   aberto. A célula "Nº do Documento" tem um link:
   - Se a guia ainda não foi gerada: texto "EMITIR GUIA", aponta pra
     guianacional.aspx?inscricao=...&exercicio=...&mes=...&tipo=10 — uma
     tela de CONFIRMAÇÃO (mostra valores, "Número da Guia: *****",
     status PENDENTE) com um botão final #ctl00_cphCabMenu_btGerarGuia
     que de fato emite a guia (cria o documento oficial, com vencimento e
     linha digitável).
   - Se já existe (emitida, ainda que não paga): o link é o próprio
     número da guia, aponta pra guianacional.aspx?guia=<numero> — mesma
     tela, mas com botão #ctl00_cphCabMenu_btVisualizarGuia ("IMPRIMIR
     GUIA") no lugar de btGerarGuia, sem criar nada novo.
   Os dois botões levam pra guiaprint.aspx?guia=<numero>. Confirmado ao
   vivo nos dois casos (competência ago/2026 da COE: primeiro emitida do
   zero, depois reaberta já existente).
4. guiaprint.aspx mostra a guia como imagem (guiaprintimg.aspx) — mas tem
   um botão real "Exportar para .PDF" (#ctl00_cphBase_btExportar) que
   dispara o download do PDF de verdade. Confirmado ao vivo: PDF válido,
   169KB, com número de guia, vencimento e linha digitável reais.

EMITIR GUIA é uma ação real (cria um documento oficial de cobrança) —
não é só leitura. Quem decide emitir é o usuário do SOMA clicando o botão
"Buscar guia de ISS" propositalmente, igual faria manualmente no site.
"""

from __future__ import annotations

from pathlib import Path

from cryptography.hazmat.primitives.serialization import BestAvailableEncryption, pkcs12
from lxml import html as lxml_html
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE_URL = "https://notacarioca.rio.gov.br"
LOGIN_URL = f"{BASE_URL}/senhaweb/loginICP.aspx"
GUIAS_URL = f"{BASE_URL}/contribuinte/guias.aspx"

_TIMEOUT_PADRAO_MS = 30_000


class ErroNotaCarioca(Exception):
    pass


def _modernizar_pfx(pfx_bytes: bytes, senha: str) -> bytes:
    chave, certificado, cadeia = pkcs12.load_key_and_certificates(pfx_bytes, senha.encode("utf-8"))
    if chave is None or certificado is None:
        raise ErroNotaCarioca("O certificado não contém chave privada e/ou certificado válidos.")
    return pkcs12.serialize_key_and_certificates(
        name=b"cert",
        key=chave,
        cert=certificado,
        cas=cadeia,
        encryption_algorithm=BestAvailableEncryption(senha.encode("utf-8")),
    )


def _extrair_link_guia(html: str, mes_alvo: int | None) -> str | None:
    """
    Acha, na grid de "Guias de Recolhimento", a linha da competência
    pedida (mes_alvo 1-12) e devolve o href do link na célula "Nº do
    Documento" (seja "EMITIR GUIA" ou o link direto pra uma guia já
    emitida). None se não achar nenhuma linha correspondente.

    Sem mes_alvo: pega a primeira linha da grid (guia mais recente em
    aberto), que é o caso de uso comum de "buscar a guia agora".
    """
    tree = lxml_html.fromstring(html)
    linhas = tree.xpath("//table[@id='ctl00_cphCabMenu_dgGuias']//tr[@class='tableItem']")
    for linha in linhas:
        celulas = linha.xpath("./td")
        if len(celulas) < 6:
            continue
        competencia_texto = celulas[0].text_content().strip()  # ex.: "AGO / 2026"
        links = celulas[5].xpath(".//a[@href]")
        if not links:
            continue
        href = links[0].get("href")
        if mes_alvo is None:
            return href
        mes_nome_para_numero = {
            "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
            "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12,
        }
        mes_texto = competencia_texto.split("/")[0].strip().upper()
        if mes_nome_para_numero.get(mes_texto) == mes_alvo:
            return href
    return None


class ClienteNotaCarioca:
    """
    Sessão autenticada no Nota Carioca via certificado A1, usando um
    Chromium real (Playwright) por baixo — necessário porque o site
    rejeita clientes HTTP não-navegador na camada de TLS (ver docstring
    do módulo).

    Uso:
        with ClienteNotaCarioca(pfx_bytes, senha) as cliente:
            pdf_bytes = cliente.buscar_guia_iss("2026-08")
    """

    def __init__(self, pfx_bytes: bytes, senha: str):
        self._pfx_bytes = pfx_bytes
        self._senha = senha
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None

    def __enter__(self) -> "ClienteNotaCarioca":
        try:
            pfx_moderno = _modernizar_pfx(self._pfx_bytes, self._senha)
        except ErroNotaCarioca:
            raise
        except Exception as e:
            raise ErroNotaCarioca(f"Não foi possível abrir o certificado: {e}")

        self._playwright = sync_playwright().start()
        try:
            self._browser = self._playwright.chromium.launch(headless=True)
            self._context = self._browser.new_context(
                client_certificates=[{
                    "origin": BASE_URL,
                    "pfx": pfx_moderno,
                    "passphrase": self._senha,
                }]
            )
        except PlaywrightError as e:
            self._playwright.stop()
            raise ErroNotaCarioca(f"Não foi possível carregar o certificado no navegador: {e}")

        self._page = self._context.new_page()
        self._page.set_default_timeout(_TIMEOUT_PADRAO_MS)
        self._login()
        return self

    def __exit__(self, *exc_info):
        if self._context is not None:
            self._context.close()
        if self._browser is not None:
            self._browser.close()
        if self._playwright is not None:
            self._playwright.stop()

    def _login(self) -> None:
        self._page.goto(LOGIN_URL, timeout=_TIMEOUT_PADRAO_MS)
        texto = self._page.inner_text("body", timeout=_TIMEOUT_PADRAO_MS)
        if "identificado com sucesso" not in texto.lower():
            raise ErroNotaCarioca(
                "O certificado digital não foi reconhecido pelo Nota Carioca. "
                "Verifique se está correto, dentro da validade e é ICP-Brasil."
            )

        try:
            self._page.click("#ctl00_cphCabMenu_btAcesso", timeout=20_000)
        except PlaywrightTimeoutError:
            # O clique costuma disparar a navegação mesmo quando o
            # Playwright estoura o timeout esperando "navegações
            # agendadas" terminarem — o site é lento. O wait_for_load_state
            # abaixo confirma se realmente completou.
            pass

        try:
            self._page.wait_for_load_state("load", timeout=60_000)
        except PlaywrightTimeoutError:
            raise ErroNotaCarioca(
                "Login no Nota Carioca não completou a tempo — o site está "
                "lento ou instável. Tente novamente."
            )

        if "encerrar" not in self._page.inner_text("body", timeout=15_000).lower():
            raise ErroNotaCarioca("Login não completou — sessão autenticada não foi criada.")

    def buscar_guia_iss(self, competencia: str | None = None) -> bytes:
        mes_alvo: int | None = None
        ano_alvo: int | None = None
        if competencia:
            ano_str, mes_str = competencia.split("-")
            ano_alvo, mes_alvo = int(ano_str), int(mes_str)

        guias_url = GUIAS_URL if ano_alvo is None else f"{GUIAS_URL}?exercicio={ano_alvo}"
        self._page.goto(guias_url, timeout=45_000, wait_until="load")
        html = self._page.content()

        href = _extrair_link_guia(html, mes_alvo)
        if href is None:
            raise ErroNotaCarioca(
                f"Nenhuma guia de ISS pendente encontrada para a competência "
                f"{competencia or 'atual'}."
            )
        href = href.replace("&amp;", "&")

        self._page.goto(f"{BASE_URL}/contribuinte/{href}", timeout=45_000, wait_until="load")

        # Tela de confirmação em guianacional.aspx — o botão muda conforme
        # a guia já existe ou não:
        #   - btGerarGuia ("EMITIR GUIA"): guia ainda não existe, esse
        #     clique de fato cria o documento oficial.
        #   - btVisualizarGuia ("IMPRIMIR GUIA"): guia já emitida
        #     anteriormente, esse clique só abre a via já existente.
        # Os dois levam pra guiaprint.aspx do mesmo jeito.
        for seletor_botao in ("#ctl00_cphCabMenu_btGerarGuia", "#ctl00_cphCabMenu_btVisualizarGuia"):
            if self._page.locator(seletor_botao).count() > 0:
                try:
                    self._page.click(seletor_botao, timeout=20_000)
                except PlaywrightTimeoutError:
                    pass
                try:
                    self._page.wait_for_load_state("load", timeout=45_000)
                except PlaywrightTimeoutError:
                    raise ErroNotaCarioca("Abrir a guia não completou a tempo — tente novamente.")
                break

        if "guiaprint.aspx" not in self._page.url:
            raise ErroNotaCarioca(
                "Fluxo inesperado no Nota Carioca — não chegou na tela de "
                "impressão da guia. A estrutura do site pode ter mudado."
            )

        try:
            with self._page.expect_download(timeout=30_000) as download_info:
                self._page.click("#ctl00_cphBase_btExportar", timeout=20_000)
        except PlaywrightTimeoutError:
            raise ErroNotaCarioca(
                "Não foi possível exportar o PDF da guia — o botão 'Exportar "
                "para PDF' não gerou o download esperado."
            )

        caminho_baixado = download_info.value.path()
        if caminho_baixado is None:
            raise ErroNotaCarioca("O download do PDF da guia falhou.")
        return Path(caminho_baixado).read_bytes()
