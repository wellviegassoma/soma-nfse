"""
nota_carioca_client.py

Cliente para o portal Nota Carioca (notacarioca.rio.gov.br) da Prefeitura
do Rio de Janeiro — login com o certificado A1 da empresa (ICP-Brasil,
mTLS — mesmo tipo de certificado usado no Sefin Nacional) e busca da guia
de recolhimento do ISS.

Fluxo de login confirmado ao vivo, navegando manualmente com o
certificado real da JH MED (01/09/2026):

1. GET /senhaweb/loginICP.aspx com o certificado anexado à conexão TLS —
   o servidor reconhece o certificado automaticamente (sem usuário,
   senha ou captcha) e devolve uma página de confirmação ("O seguinte
   certificado digital foi identificado com sucesso: ...") com um botão
   de postback ASP.NET clássico (id ctl00_cphCabMenu_btAcesso).
2. POST de volta pra mesma URL reenviando os campos ocultos do form
   (__VIEWSTATE/__VIEWSTATEGENERATOR/__EVENTVALIDATION) mais o campo do
   botão — isso é o que efetivamente cria a sessão autenticada (cookie
   ASP.NET_SessionId + cookie de autenticação do site).

A tela "Guias de Recolhimento" (/contribuinte/guias.aspx) — onde deveria
ficar a guia de ISS — estava retornando erro do PRÓPRIO SERVIDOR da
Prefeitura ("TIMEOUT NA REQUISIÇÃO") de forma consistente no momento em
que este cliente foi escrito, reproduzido várias vezes inclusive
relogando do zero, enquanto outras páginas do sistema (Consulta de
Documentos Fiscais) responderam normalmente. Ou seja: não é um problema
de sessão/certificado, é o backend deles que está com erro nessa tela
específica.

Por isso `buscar_guia_iss` só está parcialmente implementado: faz login e
busca a página, mas o parsing da lista de guias/PDF ainda não foi
mapeado contra uma resposta real (não tem como adivinhar o formato certo
sem ver o HTML de verdade). Terminar `_extrair_guias_do_html` assim que
o site normalizar — usar o `html_bruto` devolvido em ErroNotaCarioca (ou
salvo localmente) pra escrever o parsing.
"""

from __future__ import annotations

import re

import requests

from certificado import _AdaptadorTLS12

BASE_URL = "https://notacarioca.rio.gov.br"
LOGIN_URL = f"{BASE_URL}/senhaweb/loginICP.aspx"
GUIAS_URL = f"{BASE_URL}/contribuinte/guias.aspx"

# Alguns sistemas legados da Prefeitura tratam o User-Agent padrão do
# python-requests como cliente não-navegador — usamos um UA de navegador
# real, igual ao já usado pra falar com o Sefin Nacional (ver
# certificado.py:criar_sessao_mtls).
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_CAMPO_OCULTO_RE = re.compile(
    r'<input[^>]*name="(__VIEWSTATE|__VIEWSTATEGENERATOR|__EVENTVALIDATION'
    r'|__EVENTTARGET|__EVENTARGUMENT)"[^>]*value="([^"]*)"'
)


class ErroNotaCarioca(Exception):
    def __init__(self, mensagem: str, html_bruto: str | None = None):
        super().__init__(mensagem)
        self.html_bruto = html_bruto


def _extrair_campos_ocultos(html: str) -> dict[str, str]:
    return {nome: valor for nome, valor in _CAMPO_OCULTO_RE.findall(html)}


class ClienteNotaCarioca:
    """
    Sessão autenticada no Nota Carioca via certificado A1.

    Uso:
        with ClienteNotaCarioca(cert_path, key_path) as cliente:
            pdf_bytes = cliente.buscar_guia_iss("2026-08")
    """

    def __init__(self, cert_path: str, key_path: str):
        self._sessao = requests.Session()
        self._sessao.cert = (cert_path, key_path)
        # Mesmo bug/contorno documentado em certificado.py:_AdaptadorTLS12 —
        # confirmado ao vivo que o notacarioca.rio.gov.br também derruba o
        # handshake TLS 1.3 vindo do requests/OpenSSL (ConnectionResetError
        # logo na abertura da conexão), TLS 1.2 funciona normalmente.
        self._sessao.mount("https://", _AdaptadorTLS12())
        self._sessao.headers.update({"User-Agent": _USER_AGENT})
        self._logado = False

    def __enter__(self) -> "ClienteNotaCarioca":
        self._login()
        return self

    def __exit__(self, *exc_info):
        self._sessao.close()

    def _login(self) -> None:
        resp = self._sessao.get(LOGIN_URL, timeout=30)
        resp.raise_for_status()

        texto_lower = resp.text.lower()
        if "identificado com sucesso" not in texto_lower:
            raise ErroNotaCarioca(
                "O certificado digital não foi reconhecido pelo Nota Carioca. "
                "Verifique se o certificado está correto, dentro da validade "
                "e é um e-CNPJ/e-CPF ICP-Brasil.",
                html_bruto=resp.text,
            )

        campos = _extrair_campos_ocultos(resp.text)
        campos["ctl00$cphCabMenu$btAcesso"] = "ACESSAR O SISTEMA"

        resp2 = self._sessao.post(LOGIN_URL, data=campos, timeout=30)
        resp2.raise_for_status()

        if "encerrar" not in resp2.text.lower():
            raise ErroNotaCarioca(
                "Login no Nota Carioca não completou — a sessão autenticada "
                "não foi criada mesmo com o certificado reconhecido. "
                "Provável mudança na página de login do lado da Prefeitura.",
                html_bruto=resp2.text,
            )

        self._logado = True

    def buscar_guia_iss(self, competencia: str | None = None) -> bytes:
        """
        Busca a guia de recolhimento de ISS na tela "Guias de Recolhimento".

        AINDA NÃO FINALIZADO — ver docstring do módulo. Por ora: confirma
        login e busca a página, devolvendo um erro claro (com o HTML bruto
        anexado) se ela estiver indisponível ou se a extração ainda não
        tiver sido mapeada.
        """
        if not self._logado:
            raise ErroNotaCarioca("Sessão não autenticada — chame dentro do `with`.")

        resp = self._sessao.get(GUIAS_URL, timeout=60)
        resp.raise_for_status()

        if "timeout na requisi" in resp.text.lower():
            raise ErroNotaCarioca(
                "O Nota Carioca está retornando erro na tela de Guias de "
                "Recolhimento (indisponibilidade do lado da Prefeitura, não "
                "do certificado ou da sessão). Tente novamente mais tarde.",
                html_bruto=resp.text,
            )

        # TODO: mapear a estrutura real da página (lista de guias por
        # competência, parâmetro/link de download do PDF) e devolver os
        # bytes do PDF da guia pedida — falta ver o HTML real pra isso.
        raise ErroNotaCarioca(
            "Login e navegação até Guias de Recolhimento funcionaram, mas a "
            "extração da guia de ISS ainda não foi implementada — falta "
            "mapear o HTML real dessa tela (ver TODO em buscar_guia_iss).",
            html_bruto=resp.text,
        )
