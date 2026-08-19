"""
sefin_nacional_client.py

Cliente da API do Sefin Nacional NFS-e — o emissor público nacional que
processa e valida a DPS, gerando a NFS-e. É o sistema por trás do portal
"Emissor Nacional" (www.nfse.gov.br/EmissorNacional) que vocês já usam
manualmente — aqui, fazemos a mesma coisa via API.

Bases:
  Produção:      https://sefin.nfse.gov.br/SefinNacional
  Homologação:   https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional

IMPORTANTE — formato exato do corpo da requisição do POST /nfse ainda não
100% confirmado: a documentação oficial completa é protegida por
certificado digital (mesmo problema que tivemos com a API de consulta).
O que está confirmado (por um relato de terceiro que implementou isso na
prática): o XML da DPS assinada é enviado compactado em GZIP. O nome
exato do campo JSON que carrega esse conteúdo (ex: "dpsXmlGZipB64",
"arquivo", "xmlGzipB64" etc.) é uma suposição a ser validada em
homologação — o modo debug (salvar_bruto_em) ajuda a ajustar isso
rapidamente se o servidor rejeitar por schema.
"""

from __future__ import annotations

import base64
import gzip
import json
from pathlib import Path
from typing import Callable, Optional

import requests

AMBIENTES = {
    "producao": "https://sefin.nfse.gov.br/SefinNacional",
    "producao_restrita": "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
}

# Nomes de campo candidatos para o XML compactado no corpo do POST /nfse —
# tentamos nessa ordem até um ser aceito (ver enviar_dps). Ajuste esta
# lista assim que confirmarmos o campo certo em homologação.
CAMPOS_CANDIDATOS_XML_GZIP = ["dpsXmlGZipB64", "xmlGzipB64", "arquivo", "loteXmlGZipB64"]


class ErroSefinNacional(Exception):
    def __init__(self, mensagem: str, detalhes: Optional[list] = None, status_code: Optional[int] = None):
        super().__init__(mensagem)
        self.detalhes = detalhes or []
        self.status_code = status_code


class ClienteSefinNacional:
    def __init__(
        self,
        cert_path: str,
        key_path: str,
        ambiente: str = "producao_restrita",
        timeout: int = 30,
        intervalo_entre_requisicoes: float = 1.0,
        max_tentativas_erro_temporario: int = 5,
    ):
        """
        `cert_path`/`key_path` são os arquivos PEM já extraídos do .pfx
        (mesmo padrão usado em nfse_client.carregar_certificado_pfx —
        reaproveite aquela função para gerar esses caminhos).
        """
        if ambiente not in AMBIENTES:
            raise ValueError(f"Ambiente inválido: {ambiente}. Use um de {list(AMBIENTES)}")
        self.base_url = AMBIENTES[ambiente]
        self.timeout = timeout
        self.intervalo_entre_requisicoes = intervalo_entre_requisicoes
        self.max_tentativas_erro_temporario = max_tentativas_erro_temporario
        self._ultima_requisicao_em = 0.0

        self._session = requests.Session()
        self._session.cert = (cert_path, key_path)
        # Mesmo motivo do nfse_client.py: evitar a identificação padrão
        # do python-requests, que pode ser bloqueada/limitada em sites
        # de governo de forma diferente de um navegador real.
        self._session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, application/pdf, */*",
        })

    def fechar(self):
        self._session.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.fechar()

    # ------------------------------------------------------------------
    # Envio da DPS (emissão)
    # ------------------------------------------------------------------

    def enviar_dps(
        self,
        xml_dps_assinado: str,
        salvar_bruto_em: Optional[str] = None,
        campo_forcado: Optional[str] = None,
    ) -> dict:
        """
        Envia a DPS (já assinada — ver dps_builder + xml_signer) para
        gerar a NFS-e. Síncrono: a resposta já vem com o resultado
        (NFS-e gerada, ou erro de validação).

        Como o nome exato do campo JSON não está 100% confirmado, por
        padrão a função tenta os candidatos em CAMPOS_CANDIDATOS_XML_GZIP
        um por um, na ORDEM, parando no primeiro que não for rejeitado
        por erro de schema (HTTP 400 com mensagem sugerindo campo
        desconhecido). Isso deixa a primeira tentativa em homologação
        mais rápida de ajustar. Depois de descobrir o campo certo, passe
        `campo_forcado` para pular direto pra ele.

        Retorna o dict do JSON de resposta em caso de sucesso (deve
        conter o XML da NFS-e gerada e a chave de acesso — nomes de
        campo também a confirmar). Levanta ErroSefinNacional em caso de
        rejeição/erro.
        """
        comprimido = gzip.compress(xml_dps_assinado.encode("utf-8"))
        xml_gzip_b64 = base64.b64encode(comprimido).decode("ascii")

        campos_a_tentar = [campo_forcado] if campo_forcado else CAMPOS_CANDIDATOS_XML_GZIP
        ultimo_erro = None

        for campo in campos_a_tentar:
            payload = {campo: xml_gzip_b64}
            try:
                resp = self._post_com_retry("/nfse", payload, salvar_bruto_em=salvar_bruto_em, tag_debug=campo)
            except ErroSefinNacional as e:
                ultimo_erro = e
                # Só tenta o próximo nome de campo se o erro parecer ser
                # de schema (campo não reconhecido) — outros erros (ex:
                # regra de negócio, CNPJ inválido) não vão sumir trocando
                # o nome do campo, então propagamos direto.
                if e.status_code in (400, 422) and campo != campos_a_tentar[-1]:
                    continue
                raise
            return resp

        raise ultimo_erro or ErroSefinNacional("Falha ao enviar DPS: nenhum campo candidato foi aceito.")

    # ------------------------------------------------------------------
    # Eventos (cancelamento) — POST /nfse/{chaveAcesso}/eventos
    # ------------------------------------------------------------------

    def enviar_evento(self, chave_nfse: str, xml_evento_assinado: str) -> dict:
        """
        Envia um Pedido de Registro de Evento (ex.: cancelamento e101101,
        ver evento_builder.py) já assinado. Ao contrário do POST /nfse
        (nome do campo JSON incerto até validarmos em homologação), o
        nome do campo aqui está confirmado contra a documentação oficial
        (Manual dos Contribuintes — API Sistema Nacional NFS-e v1.2) e
        contra uma implementação de terceiros em produção: sempre
        "pedidoRegistroEventoXmlGZipB64".
        """
        comprimido = gzip.compress(xml_evento_assinado.encode("utf-8"))
        xml_gzip_b64 = base64.b64encode(comprimido).decode("ascii")
        payload = {"pedidoRegistroEventoXmlGZipB64": xml_gzip_b64}
        return self._post_com_retry(f"/nfse/{chave_nfse}/eventos", payload, tag_debug="evento_cancelamento")

    # ------------------------------------------------------------------
    # Consultas
    # ------------------------------------------------------------------

    def consultar_nfse(self, chave_acesso: str) -> dict:
        """GET /nfse/{chaveAcesso} — consulta a NFS-e já gerada."""
        return self._get_com_retry(f"/nfse/{chave_acesso}")

    def baixar_danfse_oficial(self, chave_acesso: str) -> bytes:
        """
        GET /danfse/{chaveAcesso} — baixa o DANFSe OFICIAL em PDF,
        gerado pelo próprio Sefin Nacional (não uma reconstrução nossa
        a partir do XML — é o PDF real, com a identidade visual oficial
        do governo, igual ao que aparece no portal www.nfse.gov.br).
        Retorna os bytes crus do PDF.
        """
        import time
        url = f"{self.base_url}/danfse/{chave_acesso}"
        tentativa = 0
        while True:
            self._aguardar_intervalo_minimo()
            try:
                resp = self._session.get(url, timeout=self.timeout)
            except requests.exceptions.RequestException as e:
                raise ErroSefinNacional(f"Falha de conexão com {url}: {e}")
            finally:
                self._ultima_requisicao_em = time.monotonic()

            if resp.status_code in (429, 502, 503, 504):
                tentativa += 1
                if tentativa > self.max_tentativas_erro_temporario:
                    raise ErroSefinNacional(
                        f"Erro {resp.status_code} persistente em {url}.", status_code=resp.status_code
                    )
                time.sleep(min(2 ** tentativa, 30))
                continue
            break

        if not resp.ok:
            raise ErroSefinNacional(
                f"Erro HTTP {resp.status_code} ao baixar o DANFSe oficial em {url} "
                f"— corpo da resposta: {resp.text[:300] or '(vazio)'}",
                status_code=resp.status_code,
            )
        if not resp.content.startswith(b"%PDF"):
            trecho = resp.content[:300]
            try:
                trecho_legivel = trecho.decode("utf-8", errors="replace")
            except Exception:
                trecho_legivel = repr(trecho)
            raise ErroSefinNacional(
                "A resposta não parece ser um PDF válido. Conteúdo recebido "
                f"(pode revelar o motivo real): {trecho_legivel}",
                status_code=resp.status_code,
            )
        return resp.content

    def consultar_parametros_convenio(self, codigo_municipio: str) -> dict:
        """GET /parametros_municipais/{codigoMunicipio}/convenio"""
        return self._get_com_retry(f"/parametros_municipais/{codigo_municipio}/convenio")

    def consultar_parametros_servico(self, codigo_municipio: str, codigo_servico: str) -> dict:
        """
        GET /parametros_municipais/{codigoMunicipio}/{codigoServico}
        Alíquotas, regimes especiais e deduções/reduções por subitem —
        use isso pra puxar a alíquota de ISSQN automaticamente em vez de
        digitar na mão.
        """
        return self._get_com_retry(f"/parametros_municipais/{codigo_municipio}/{codigo_servico}")

    def consultar_retencoes(self, codigo_municipio: str, documento: str) -> dict:
        """GET /parametros_municipais/{codigoMunicipio}/{CPF/CNPJ} — retenções."""
        return self._get_com_retry(f"/parametros_municipais/{codigo_municipio}/{documento}")

    # ------------------------------------------------------------------
    # Infraestrutura HTTP (throttle + retry, mesmo padrão do nfse_client)
    # ------------------------------------------------------------------

    def _aguardar_intervalo_minimo(self):
        import time
        decorrido = time.monotonic() - self._ultima_requisicao_em
        faltante = self.intervalo_entre_requisicoes - decorrido
        if faltante > 0:
            time.sleep(faltante)

    def _post_com_retry(
        self, caminho: str, payload: dict, salvar_bruto_em: Optional[str] = None, tag_debug: str = "req",
    ) -> dict:
        import time
        url = f"{self.base_url}{caminho}"
        tentativa = 0
        while True:
            self._aguardar_intervalo_minimo()
            try:
                resp = self._session.post(url, json=payload, timeout=self.timeout)
            except requests.exceptions.RequestException as e:
                raise ErroSefinNacional(f"Falha de conexão com {url}: {e}")
            finally:
                self._ultima_requisicao_em = time.monotonic()

            if resp.status_code in (429, 502, 503, 504):
                tentativa += 1
                if tentativa > self.max_tentativas_erro_temporario:
                    raise ErroSefinNacional(
                        f"Erro {resp.status_code} persistente em {url} após {tentativa} tentativas.",
                        status_code=resp.status_code,
                    )
                time.sleep(min(2 ** tentativa, 30))
                continue
            break

        if salvar_bruto_em:
            Path(salvar_bruto_em).mkdir(parents=True, exist_ok=True)
            (Path(salvar_bruto_em) / f"post_nfse_{tag_debug}.json").write_text(
                resp.text, encoding="utf-8"
            )

        return self._tratar_resposta(resp, url)

    def _get_com_retry(self, caminho: str) -> dict:
        import time
        url = f"{self.base_url}{caminho}"
        tentativa = 0
        while True:
            self._aguardar_intervalo_minimo()
            try:
                resp = self._session.get(url, timeout=self.timeout)
            except requests.exceptions.RequestException as e:
                raise ErroSefinNacional(f"Falha de conexão com {url}: {e}")
            finally:
                self._ultima_requisicao_em = time.monotonic()

            if resp.status_code in (429, 502, 503, 504):
                tentativa += 1
                if tentativa > self.max_tentativas_erro_temporario:
                    raise ErroSefinNacional(
                        f"Erro {resp.status_code} persistente em {url}.", status_code=resp.status_code
                    )
                time.sleep(min(2 ** tentativa, 30))
                continue
            break

        return self._tratar_resposta(resp, url)

    @staticmethod
    def _tratar_resposta(resp: "requests.Response", url: str) -> dict:
        if resp.status_code == 403:
            raise ErroSefinNacional(
                "403 Forbidden: certificado sem permissão para essa operação "
                "(confira se o CNPJ do certificado é o prestador da DPS).",
                status_code=403,
            )
        if not resp.ok:
            detalhes = []
            content_type = resp.headers.get("Content-Type", "")
            try:
                corpo = resp.json()
                detalhes = corpo.get("erros") or corpo.get("mensagens") or [corpo]
            except ValueError:
                # Nem toda resposta de erro é JSON — às vezes é uma página
                # de erro HTML genérica do servidor web (não uma mensagem
                # de negócio da Sefin Nacional). Despejar a marcação HTML
                # crua na tela não ajuda ninguém, então traduz pra uma
                # explicação legível conforme o código HTTP.
                parece_html = "html" in content_type.lower() or resp.text.strip()[:20].lower().startswith(
                    ("<!doctype", "<html")
                )
                if parece_html and resp.status_code == 404:
                    detalhes = [
                        "O servidor não encontrou o recurso (404). Nesse endpoint de consulta de "
                        "parâmetros municipais, isso normalmente significa que o MUNICÍPIO consultado "
                        "ainda não tem parametrização cadastrada para esse código de serviço no "
                        "Sistema Nacional NFS-e — ou seja, o município ainda não 'administra' esse "
                        "código de tributação (mesma causa do erro E0312 na emissão). Confira o código "
                        "de tributação nacional com a prefeitura do município de incidência do ISSQN "
                        "antes de tentar de novo. Se o código estiver certo e o erro persistir, pode "
                        "ser instabilidade temporária do sistema nacional."
                    ]
                elif parece_html:
                    detalhes = [
                        f"O servidor respondeu com uma página de erro (HTTP {resp.status_code}), "
                        "sem uma mensagem de negócio específica."
                    ]
                else:
                    detalhes = [resp.text[:500]]
            raise ErroSefinNacional(
                f"Erro HTTP {resp.status_code} em {url}", detalhes=detalhes, status_code=resp.status_code
            )
        try:
            return resp.json()
        except ValueError:
            raise ErroSefinNacional(f"Resposta de {url} não é JSON válido: {resp.text[:300]}")
