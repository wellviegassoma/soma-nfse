"""
nfse_client.py

Cliente para o Ambiente de Dados Nacional (ADN) da NFS-e Nacional.

Trata os pontos delicados da integração:
  1. Autenticação por mTLS usando um certificado A1 (.pfx / .p12), que o
     `requests` não sabe usar diretamente — precisamos extrair o par
     certificado+chave para arquivos PEM temporários e usá-los na conexão
     TLS.
  2. Download em lote das notas via distribuição por NSU (não existe
     endpoint de "busca por período"), com filtro de mês feito localmente
     após o download de cada lote.
  3. Limite de requisições (HTTP 429) do servidor: espaçamento mínimo
     entre chamadas e nova tentativa automática com backoff.
  4. Diagnóstico: quando "0 notas" é retornado, o app consegue dizer *por
     que* — sem documentos no intervalo, XML não decodificado, data não
     reconhecida, ou documentos de outros meses.

Campos confirmados na resposta real da API (via teste do usuário):
  {
    "StatusProcessamento": "NENHUM_DOCUMENTO_LOCALIZADO",
    "LoteDFe": [...],
    "Alertas": [...],
    "Erros": [{"Codigo": "E2220", "Descricao": "..."}],
    "TipoAmbiente": "HOMOLOGACAO" | "PRODUCAO",
    "VersaoAplicativo": "...",
    "DataHoraProcessamento": "..."
  }
  O código E2220 em "Erros" significa "não há mais documentos a partir
  deste NSU" — não é um erro real, é sinal de fim de distribuição.

  Ainda NÃO confirmado (nenhum documento real foi visto até agora): os
  nomes dos campos DENTRO de cada item de "LoteDFe" (o XML em si, o NSU
  do item, a chave de acesso). O código tenta várias variações prováveis
  — use o modo debug (NFSE_DEBUG=1) para confirmar e ajustar se preciso.

  Referências públicas usadas:
  - https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
  - Manual dos Contribuintes - Sistema Nacional NFS-e (gov.br/nfse)
  - Endpoint de distribuição: GET /contribuintes/DFe/{NSU}
"""

from __future__ import annotations

import base64
import gzip
import os
import re
import tempfile
import time
import warnings
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import requests
from certificado import criar_sessao_mtls
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    pkcs12,
)
from cryptography.x509.oid import NameOID

# Alguns certificados de ACs brasileiras geram .pfx em BER em vez de DER
# estrito. A biblioteca 'cryptography' lê normalmente com fallback, mas
# emite um UserWarning nesse caso — é informativo, não indica falha.
warnings.filterwarnings(
    "ignore",
    message="PKCS#12 bundle could not be parsed as DER",
    category=UserWarning,
)


AMBIENTES = {
    "producao": "https://adn.nfse.gov.br",
    "producao_restrita": "https://adn.producaorestrita.nfse.gov.br",
}

# O DANFSe tem seu próprio serviço dedicado dentro do ADN — CONFIRMADO
# na documentação oficial (gov.br/nfse/biblioteca/documentacao-tecnica/
# apis-prod-restrita-e-producao, seção "DANFSE"): endpoint em
# adn.nfse.gov.br/danfse/{chaveAcesso} — mesmo domínio da consulta, com
# prefixo próprio. Confirmado também por fonte técnica independente
# (guia de integração de terceiros) que esse endpoint é "instável
# crônico (502/503)" do lado do governo — não é um problema nosso.
AMBIENTES_DANFSE = AMBIENTES

# Código retornado pela API quando não há (mais) documentos a partir do
# NSU informado — não é um erro real, é sinal de "fim do lote".
CODIGO_FIM_DE_DOCUMENTOS = "E2220"


class ErroCertificado(Exception):
    pass


class ErroAPI(Exception):
    pass


@dataclass
class NotaEncontrada:
    nsu: str
    chave_acesso: Optional[str]
    data_emissao: Optional[datetime]
    xml: str
    prestador_cnpj: Optional[str] = None
    tomador_cnpj: Optional[str] = None
    valor: Optional[str] = None
    # Campos usados no relatório (extraídos do XML de forma tolerante —
    # ver _extrair_campos_relatorio; nomes de tag ainda não 100% confirmados
    # contra o schema oficial, então podem precisar de ajuste fino).
    numero: Optional[str] = None
    competencia: Optional[str] = None
    tomador_nome: Optional[str] = None
    prestador_nome: Optional[str] = None
    descricao_servico: Optional[str] = None
    local_incidencia: Optional[str] = None
    codigo_trib_nacional: Optional[str] = None
    codigo_nbs: Optional[str] = None
    aliquota_issqn: Optional[float] = None
    valor_servico: Optional[float] = None
    valor_issqn: Optional[float] = None
    valor_pis: Optional[float] = None
    valor_cofins: Optional[float] = None
    valor_ret_cp: Optional[float] = None
    valor_ret_irrf: Optional[float] = None
    cancelada: bool = False
    motivo_cancelamento: Optional[str] = None
    # True = a competência da nota (<dCompet>) cai no (ano, mês)
    # pesquisado. False = a nota entrou na busca porque a EMISSÃO caiu
    # no mês pesquisado, mas a competência é de outro mês (nota
    # emitida com data retroativa) — ver buscar_notas_do_mes.
    bate_competencia: bool = True


@dataclass
class DiagnosticoBusca:
    """Estatísticas da varredura, para explicar um resultado de '0 notas'
    sem precisar caçar arquivo de debug toda vez."""

    total_documentos_vistos: int = 0
    documentos_sem_xml_decodificavel: int = 0
    documentos_sem_data_reconhecida: int = 0
    documentos_com_data_fora_do_mes: int = 0
    exemplos_datas_encontradas: list = field(default_factory=list)

    def resumo_texto(self, ano: int, mes: int) -> str:
        if self.total_documentos_vistos == 0:
            return (
                "Nenhum documento foi retornado pela API nesse intervalo de NSU — "
                "ou não há notas para esse CNPJ nesse trecho, ou as notas do período "
                "estão em NSUs mais altos (tente aumentar o NSU inicial ou o limite de lotes)."
            )
        if self.documentos_sem_xml_decodificavel == self.total_documentos_vistos:
            return (
                f"A API retornou {self.total_documentos_vistos} documento(s), mas nenhum "
                "pôde ser decodificado como XML — provavelmente o nome do campo que contém "
                "o arquivo está diferente do esperado no código. Rode com NFSE_DEBUG=1 e "
                "confira um nsu_*.json com conteúdo para eu ajustar."
            )
        if self.documentos_sem_data_reconhecida == self.total_documentos_vistos:
            return (
                f"A API retornou {self.total_documentos_vistos} documento(s) e o XML foi lido, "
                "mas nem a data de competência nem a de emissão foram reconhecidas em nenhum "
                "deles — a tag de data no XML real é diferente das tentadas (dCompet, dhEmi, "
                "DataHoraEmissao, dhProc)."
            )
        if self.exemplos_datas_encontradas:
            exemplos = ", ".join(
                d.strftime("%m/%Y") for d in self.exemplos_datas_encontradas[:5]
            )
            return (
                f"A API retornou {self.total_documentos_vistos} documento(s) com data "
                f"reconhecida, mas nenhum em {mes:02d}/{ano} — os meses vistos foram: {exemplos}. "
                "Se o período que você quer for mais recente ou mais antigo, ajuste o NSU inicial."
            )
        return (
            f"{self.total_documentos_vistos} documento(s) analisado(s), "
            "nenhum corresponde ao período pedido."
        )


def obter_info_certificado(caminho_pfx: str, senha: str) -> dict:
    """
    Abre o certificado só para leitura de metadados — não grava nada em
    disco, não monta sessão TLS. Serve tanto para mostrar a data de
    validade no cadastro de clientes quanto para validar a senha na hora
    do cadastro (em vez de só descobrir que a senha está errada na hora
    de usar de verdade). Levanta ErroCertificado se a senha estiver
    incorreta ou o arquivo não for um .pfx/.p12 válido.
    """
    caminho = Path(caminho_pfx)
    if not caminho.exists():
        raise ErroCertificado(f"Arquivo de certificado não encontrado: {caminho_pfx}")

    dados_pfx = caminho.read_bytes()
    try:
        _, certificado, _ = pkcs12.load_key_and_certificates(dados_pfx, senha.encode("utf-8"))
    except Exception as e:
        raise ErroCertificado(
            "Não foi possível abrir o certificado. Verifique se o arquivo "
            "é um .pfx/.p12 válido e se a senha está correta. "
            f"Detalhe técnico: {e}"
        )

    if certificado is None:
        raise ErroCertificado("O arquivo .pfx não contém um certificado válido.")

    try:
        validade = certificado.not_valid_after_utc  # cryptography >= 42
    except AttributeError:
        validade = certificado.not_valid_after  # versões mais antigas da lib

    titular = None
    try:
        titular = certificado.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        pass

    return {"validade": validade, "titular": titular}


def carregar_certificado_pfx(caminho_pfx: str, senha: str) -> tuple[str, str]:
    """
    Lê um arquivo .pfx/.p12 e grava certificado e chave privada em dois
    arquivos PEM temporários (permissão restrita ao usuário), retornando
    os caminhos. O chamador é responsável por apagar os arquivos depois
    de usar (ver `ClienteNFSeNacional.fechar`, que já faz isso).
    """
    caminho = Path(caminho_pfx)
    if not caminho.exists():
        raise ErroCertificado(f"Arquivo de certificado não encontrado: {caminho_pfx}")

    dados_pfx = caminho.read_bytes()

    try:
        chave_privada, certificado, cadeia_extra = pkcs12.load_key_and_certificates(
            dados_pfx, senha.encode("utf-8")
        )
    except Exception as e:
        raise ErroCertificado(
            "Não foi possível abrir o certificado. Verifique se o arquivo "
            "é um .pfx/.p12 válido e se a senha está correta. "
            f"Detalhe técnico: {e}"
        )

    if chave_privada is None or certificado is None:
        raise ErroCertificado("O arquivo .pfx não contém certificado e chave privada válidos.")

    tmp_dir = tempfile.mkdtemp(prefix="nfse_cert_")
    os.chmod(tmp_dir, 0o700)

    cert_path = os.path.join(tmp_dir, "cert.pem")
    key_path = os.path.join(tmp_dir, "key.pem")

    with open(cert_path, "wb") as f:
        f.write(certificado.public_bytes(Encoding.PEM))
        if cadeia_extra:
            for c in cadeia_extra:
                f.write(c.public_bytes(Encoding.PEM))
    os.chmod(cert_path, 0o600)

    with open(key_path, "wb") as f:
        f.write(
            chave_privada.private_bytes(
                Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
            )
        )
    os.chmod(key_path, 0o600)

    return cert_path, key_path


def limpar_certificado_temporario(cert_path: str, key_path: str) -> None:
    for p in (cert_path, key_path):
        try:
            os.remove(p)
        except OSError:
            pass
    try:
        os.rmdir(os.path.dirname(cert_path))
    except OSError:
        pass


class ClienteNFSeNacional:
    def __init__(
        self,
        caminho_pfx: str,
        senha_pfx: str,
        ambiente: str = "producao_restrita",
        cnpj_consulta: Optional[str] = None,
        timeout: int = 30,
        intervalo_entre_requisicoes: float = 1.5,
        max_tentativas_429: int = 6,
    ):
        if ambiente not in AMBIENTES:
            raise ValueError(f"Ambiente inválido: {ambiente}. Use um de {list(AMBIENTES)}")

        self.base_url = AMBIENTES[ambiente]
        self.base_url_danfse = AMBIENTES_DANFSE[ambiente]
        self.cnpj_consulta = re.sub(r"\D", "", cnpj_consulta) if cnpj_consulta else None
        self.timeout = timeout
        self.intervalo_entre_requisicoes = intervalo_entre_requisicoes
        self.max_tentativas_429 = max_tentativas_429
        self._ultima_requisicao_em = 0.0

        self._cert_path, self._key_path = carregar_certificado_pfx(caminho_pfx, senha_pfx)
        self._session = criar_sessao_mtls(self._cert_path, self._key_path)

    def fechar(self):
        self._session.close()
        limpar_certificado_temporario(self._cert_path, self._key_path)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.fechar()

    # ------------------------------------------------------------------
    # Requisição HTTP com throttle + retry em 429
    # ------------------------------------------------------------------

    def _aguardar_intervalo_minimo(self):
        """Garante um espaçamento mínimo entre requisições, para não
        estourar o limite de taxa da API logo de cara."""
        decorrido = time.monotonic() - self._ultima_requisicao_em
        faltante = self.intervalo_entre_requisicoes - decorrido
        if faltante > 0:
            time.sleep(faltante)

    @staticmethod
    def _calcular_espera_429(resp: "requests.Response", tentativa: int) -> float:
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                return float(retry_after)
            except ValueError:
                pass
        return min(2 ** tentativa, 60)

    def _checar_erros_do_payload(self, payload: dict) -> None:
        """
        A API retorna erros dentro de um array 'Erros', mesmo com HTTP
        200. Se houver algum código diferente de 'fim de documentos',
        levanta ErroAPI com a descrição oficial.
        """
        erros = payload.get("Erros") or []
        erros_reais = [
            e for e in erros
            if isinstance(e, dict) and e.get("Codigo") != CODIGO_FIM_DE_DOCUMENTOS
        ]
        if erros_reais:
            descricoes = "; ".join(
                f"{e.get('Codigo', '?')}: {e.get('Descricao', '(sem descrição)')}"
                for e in erros_reais
            )
            raise ErroAPI(f"API retornou erro(s): {descricoes}")

    # Códigos tratados como falha temporária, com espera + nova tentativa.
    # 429 = limite de requisições. 502/503/504 = instabilidade do servidor
    # (o endpoint /danfse/{chave} é conhecido por ser cronicamente instável
    # no lado do governo, então merece o mesmo tratamento).
    CODIGOS_RETRY_TEMPORARIO = {429, 502, 503, 504}

    def _get_com_retry(
        self,
        url: str,
        params: Optional[dict] = None,
        callback_status: Optional[Callable[[str], None]] = None,
        max_tentativas: Optional[int] = None,
    ) -> "requests.Response":
        """
        Faz um GET com mTLS respeitando o intervalo mínimo entre
        requisições e tentando de novo automaticamente em caso de erro
        temporário (429, 502, 503, 504), com backoff (usa Retry-After
        quando o servidor informa, senão backoff exponencial).
        Levanta ErroAPI em falhas de conexão/TLS ou erro temporário
        persistente além do limite de tentativas.
        Não interpreta o corpo da resposta — isso fica por conta de quem
        chamou (JSON, PDF binário, etc.).
        """
        limite = max_tentativas if max_tentativas is not None else self.max_tentativas_429
        tentativa = 0
        while True:
            self._aguardar_intervalo_minimo()
            try:
                resp = self._session.get(url, params=params, timeout=self.timeout)
            except requests.exceptions.SSLError as e:
                raise ErroAPI(
                    "Falha no handshake TLS com certificado do cliente (mTLS). "
                    "Confirme que o certificado é válido para o ambiente "
                    f"escolhido e não está expirado. Detalhe: {e}"
                )
            except requests.exceptions.RequestException as e:
                raise ErroAPI(f"Falha de conexão com {url}: {e}")
            finally:
                self._ultima_requisicao_em = time.monotonic()

            if resp.status_code in self.CODIGOS_RETRY_TEMPORARIO:
                tentativa += 1
                if tentativa > limite:
                    if resp.status_code == 429:
                        raise ErroAPI(
                            f"Recebendo 429 (Too Many Requests) repetidamente em {url} "
                            f"mesmo após {limite} tentativas com espera. O servidor do "
                            "Portal Nacional está limitando a taxa de requisições — "
                            "tente novamente mais tarde ou aumente o intervalo entre "
                            "requisições."
                        )
                    raise ErroAPI(
                        f"Servidor respondeu {resp.status_code} repetidamente em {url} "
                        f"mesmo após {limite} tentativas. Esse serviço específico do "
                        "Portal Nacional (em especial o de DANFSe/PDF) é conhecido por "
                        "ter instabilidade — tente de novo mais tarde."
                    )
                espera = self._calcular_espera_429(resp, tentativa)
                if callback_status:
                    motivo = "limite de requisições (429)" if resp.status_code == 429 else f"instabilidade do servidor ({resp.status_code})"
                    callback_status(
                        f"{motivo}. Aguardando {espera:.0f}s antes de tentar de novo "
                        f"(tentativa {tentativa}/{limite})..."
                    )
                time.sleep(espera)
                continue

            return resp

    def consultar_lote_por_nsu(
        self,
        nsu: int,
        salvar_bruto_em: Optional[str] = None,
        callback_status: Optional[Callable[[str], None]] = None,
    ) -> dict:
        """
        Chama GET /contribuintes/DFe/{nsu} e retorna o JSON decodificado.
        Levanta ErroAPI em caso de falha HTTP real (não considera os
        códigos de "fim de documentos" como erro).
        """
        url = f"{self.base_url}/contribuintes/DFe/{nsu}"
        params = {}
        if self.cnpj_consulta:
            # Segundo o manual, é possível informar um CNPJ de consulta
            # diferente do CNPJ do certificado, desde que a raiz (8
            # primeiros dígitos) seja a mesma. O nome exato do parâmetro
            # de query pode variar — ajuste aqui se a API rejeitar.
            params["cnpj"] = self.cnpj_consulta

        resp = self._get_com_retry(url, params=params, callback_status=callback_status)

        if salvar_bruto_em:
            Path(salvar_bruto_em).mkdir(parents=True, exist_ok=True)
            (Path(salvar_bruto_em) / f"nsu_{nsu}.json").write_text(
                resp.text, encoding="utf-8"
            )

        if resp.status_code == 403:
            raise ErroAPI(
                "403 Forbidden: normalmente indica problema no mTLS (certificado "
                "não corresponde a um ator autorizado a consultar este CNPJ) "
                "ou cadeia de certificação incompleta."
            )
        if resp.status_code == 404:
            return {"LoteDFe": []}
        if not resp.ok:
            raise ErroAPI(f"Erro HTTP {resp.status_code} em {url}: {resp.text[:500]}")

        try:
            payload = resp.json()
        except ValueError:
            raise ErroAPI(f"Resposta não é JSON válido: {resp.text[:500]}")

        self._checar_erros_do_payload(payload)
        return payload

    def baixar_danfse(
        self,
        chave_acesso: str,
        callback_status: Optional[Callable[[str], None]] = None,
    ) -> bytes:
        """
        Chama GET /danfse/{chaveAcesso} e retorna os bytes do PDF (DANFSe
        — a representação visual/auxiliar da NFS-e, equivalente a um
        "recibo" para compartilhar com o cliente).
        """
        chave = re.sub(r"\s", "", chave_acesso or "")
        if not chave:
            raise ErroAPI("Chave de acesso vazia — não é possível baixar o DANFSe.")

        url = f"{self.base_url_danfse}/danfse/{chave}"
        # CONFIRMADO (fonte independente, documentação oficial de outra
        # integração): esse é o endpoint correto, mas é conhecido por
        # ser cronicamente instável (502/503) do lado do governo — não
        # é um problema do nosso código. A recomendação oficial nesse
        # caso é "retry agressivo + XML como fallback" (o XML é o
        # documento juridicamente válido; o PDF é só uma renderização
        # de conveniência) — é exatamente essa a nossa estratégia aqui.
        resp = self._get_com_retry(url, callback_status=callback_status, max_tentativas=7)

        if resp.status_code == 403:
            raise ErroAPI(
                "403 Forbidden ao baixar DANFSe: certificado não autorizado a "
                "acessar este documento."
            )
        if resp.status_code == 404:
            raise ErroAPI(f"DANFSe não encontrado para a chave {chave}.")
        if not resp.ok:
            raise ErroAPI(f"Erro HTTP {resp.status_code} ao baixar DANFSe de {chave}: {resp.text[:300]}")

        content_type = resp.headers.get("Content-Type", "")
        if "pdf" not in content_type.lower() and not resp.content.startswith(b"%PDF"):
            # Alguns ambientes podem devolver o PDF em base64 dentro de JSON
            # em vez de binário direto. Tentamos decodificar como
            # alternativa antes de desistir.
            try:
                dados_json = resp.json()
                base64_pdf = None
                for chave_candidata in ("arquivo", "pdf", "danfse", "Arquivo", "Pdf"):
                    if isinstance(dados_json.get(chave_candidata), str):
                        base64_pdf = dados_json[chave_candidata]
                        break
                if base64_pdf:
                    return base64.b64decode(base64_pdf)
            except ValueError:
                pass
            raise ErroAPI(
                f"Resposta de /danfse/{chave} não parece ser um PDF válido "
                f"(Content-Type: {content_type or 'desconhecido'})."
            )

        return resp.content

    # ------------------------------------------------------------------
    # Extração de dados do payload / documentos
    # ------------------------------------------------------------------

    @staticmethod
    def _extrair_lista_documentos(payload: dict) -> list[dict]:
        """
        Nome de campo confirmado na resposta real da API: 'LoteDFe'.
        Mantemos algumas variações como rede de segurança para outras
        versões/rotas da API que possam usar nomes um pouco diferentes.
        """
        for chave in ("LoteDFe", "documentos", "lote", "loteDFe", "DFe", "dados", "itens"):
            valor = payload.get(chave)
            if isinstance(valor, list):
                return valor
        if isinstance(payload, list):
            return payload
        return []

    @staticmethod
    def _documento_indica_fim(payload: dict) -> bool:
        return any(
            isinstance(e, dict) and e.get("Codigo") == CODIGO_FIM_DE_DOCUMENTOS
            for e in (payload.get("Erros") or [])
        )

    @staticmethod
    def _extrair_campo(doc: dict, candidatos: list[str]) -> Optional[str]:
        for c in candidatos:
            if c in doc and doc[c]:
                return doc[c]
        return None

    def _decodificar_xml(self, doc: dict) -> Optional[str]:
        bruto = self._extrair_campo(
            doc, ["arquivo", "xml", "docFiscal", "conteudo", "Arquivo", "ArquivoXml", "DocFiscal"]
        )
        if not bruto:
            return None
        try:
            comprimido = base64.b64decode(bruto)
            return gzip.decompress(comprimido).decode("utf-8")
        except (OSError, gzip.BadGzipFile):
            try:
                return base64.b64decode(bruto).decode("utf-8")
            except Exception:
                return bruto if isinstance(bruto, str) and "<" in bruto else None

    @staticmethod
    def _extrair_data_emissao_do_xml(xml_texto: str) -> Optional[datetime]:
        # Campos comuns de data de emissão no leiaute nacional da NFS-e/DPS
        for tag in ("dhEmi", "DataHoraEmissao", "dhProc"):
            m = re.search(rf"<{tag}>([^<]+)</{tag}>", xml_texto)
            if m:
                valor = m.group(1)
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                    try:
                        return datetime.strptime(valor[:19], fmt)
                    except ValueError:
                        continue
        return None

    @staticmethod
    def _extrair_competencia_do_xml(xml_texto: str) -> Optional[datetime]:
        """Extrai a data de COMPETÊNCIA (<dCompet>) do XML — é essa data,
        e não a de emissão, que define a qual mês a nota pertence para
        fins fiscais (uma nota pode ser emitida em atraso, com
        competência de um mês anterior ao da emissão). É o critério
        usado para filtrar as notas do período pesquisado."""
        m = re.search(r"<dCompet>([^<]+)</dCompet>", xml_texto)
        if not m:
            return None
        valor = m.group(1).strip()
        for tamanho, fmt in ((10, "%Y-%m-%d"), (7, "%Y-%m")):
            try:
                return datetime.strptime(valor[:tamanho], fmt)
            except ValueError:
                continue
        return None

    @staticmethod
    def _tag_texto(xml_texto: str, tag: str, dentro_de: Optional[str] = None) -> Optional[str]:
        """Busca o conteúdo de uma tag simples <tag>valor</tag>. Se
        `dentro_de` for informado, procura APENAS dentro do bloco
        <dentro_de>...</dentro_de> — sem cair para busca global se não
        achar lá dentro. Isso é importante: um tomador pessoa física tem
        <CPF> em vez de <CNPJ>, e se a gente caísse para busca global
        nesse caso, acabaríamos pegando o CNPJ do PRESTADOR por engano
        (documentado bug: fazia toda nota parecer 'não classificada').
        Só faz busca global quando `dentro_de` não é informado."""
        if dentro_de:
            bloco = re.search(rf"<{dentro_de}[^>]*>(.*?)</{dentro_de}>", xml_texto, re.DOTALL)
            if not bloco:
                return None
            m = re.search(rf"<{tag}>([^<]+)</{tag}>", bloco.group(1))
            return m.group(1).strip() if m else None
        m = re.search(rf"<{tag}>([^<]+)</{tag}>", xml_texto)
        return m.group(1).strip() if m else None

    @staticmethod
    def _tag_numero(xml_texto: str, tag: str) -> Optional[float]:
        m = re.search(rf"<{tag}>([^<]+)</{tag}>", xml_texto)
        if not m:
            return None
        try:
            return float(m.group(1).strip())
        except ValueError:
            return None

    def _extrair_campos_relatorio(self, nota: "NotaEncontrada") -> None:
        """
        Preenche os campos de relatório de `nota` a partir do seu XML,
        em memória (não retorna nada, altera o objeto). Tolerante a
        variações de nome de tag — os candidatos abaixo cobrem os nomes
        mais prováveis do leiaute nacional; caso algum campo não apareça
        no relatório, é sinal de que a tag real tem outro nome e vale
        conferir com NFSE_DEBUG=1.
        """
        xml = nota.xml
        nota.numero = self._tag_texto(xml, "nNFSe") or self._tag_texto(xml, "Numero")
        nota.competencia = self._tag_texto(xml, "dCompet")
        nota.tomador_nome = self._tag_texto(xml, "xNome", dentro_de="toma")
        nota.prestador_nome = (
            self._tag_texto(xml, "xNome", dentro_de="prest")
            or self._tag_texto(xml, "xNome", dentro_de="emit")
        )
        descricao_bruta = self._tag_texto(xml, "xDescServ") or self._tag_texto(xml, "Discriminacao")
        # "\s\n" é a sequência literal usada no XML no lugar de quebra de
        # linha de verdade (ver dps_builder._escapar) — troca de volta
        # por um espaço, só para ficar legível numa célula de planilha.
        nota.descricao_servico = descricao_bruta.replace("\\s\\n", " ").strip() if descricao_bruta else None
        nota.local_incidencia = (
            self._tag_texto(xml, "xLocIncid") or self._tag_texto(xml, "xMunIncid")
        )
        nota.codigo_trib_nacional = self._tag_texto(xml, "cTribNac")
        nota.codigo_nbs = self._tag_texto(xml, "cNBS")
        nota.aliquota_issqn = self._tag_numero(xml, "pAliqAplic") or self._tag_numero(xml, "pAliq")
        nota.valor_servico = self._tag_numero(xml, "vServ") or self._tag_numero(xml, "vServPrest")
        nota.valor_issqn = self._tag_numero(xml, "vISSQN") or self._tag_numero(xml, "vIssqn")
        nota.valor_pis = self._tag_numero(xml, "vPis")
        nota.valor_cofins = self._tag_numero(xml, "vCofins")
        nota.valor_ret_cp = self._tag_numero(xml, "vRetCP")
        nota.valor_ret_irrf = self._tag_numero(xml, "vRetIRRF")

        # CNPJ do prestador (quem emitiu) e do tomador (quem recebeu) —
        # essencial para separar nota de saída (empresa é a prestadora)
        # de nota de entrada (empresa é a tomadora). Tenta alguns nomes
        # de bloco diferentes porque o leiaute varia entre "prest"/"emit".
        cnpj_prest = (
            self._tag_texto(xml, "CNPJ", dentro_de="prest")
            or self._tag_texto(xml, "CNPJ", dentro_de="emit")
        )
        cnpj_toma = self._tag_texto(xml, "CNPJ", dentro_de="toma")
        nota.prestador_cnpj = re.sub(r"\D", "", cnpj_prest) if cnpj_prest else None
        nota.tomador_cnpj = re.sub(r"\D", "", cnpj_toma) if cnpj_toma else None

    @staticmethod
    def _extrair_evento_cancelamento(xml_texto: str) -> Optional[tuple[str, str]]:
        """
        Se o documento for um evento de cancelamento de NFS-e, retorna
        (chave_da_nfse_cancelada, motivo). Caso contrário, retorna None.

        Reconhece o evento pelo código padrão 'e101101' (Cancelamento de
        NFS-e) OU, de forma mais ampla, qualquer evento cujo texto
        descritivo (<xDesc>) contenha "Cancelamento" — cobre também
        cancelamento por substituição e variações não confirmadas.
        """
        parece_evento = "<evento" in xml_texto or "pedRegEvento" in xml_texto or "infEvento" in xml_texto
        if not parece_evento:
            return None

        eh_cancelamento = "e101101" in xml_texto or bool(
            re.search(r"<xDesc>[^<]*[Cc]ancelamento[^<]*</xDesc>", xml_texto)
        )
        if not eh_cancelamento:
            return None

        m_chave = re.search(r"<chNFSe>([^<]+)</chNFSe>", xml_texto)
        chave = m_chave.group(1).strip() if m_chave else None
        if not chave:
            return None

        m_motivo = re.search(r"<xMotivo>([^<]+)</xMotivo>", xml_texto)
        motivo = m_motivo.group(1).strip() if m_motivo else "Cancelamento de NFS-e"
        return chave, motivo

    # ------------------------------------------------------------------
    # Busca de alto nível
    # ------------------------------------------------------------------

    def buscar_notas_do_mes(
        self,
        ano: int,
        mes: int,
        nsu_inicial: int = 0,
        max_lotes: int = 2000,
        parar_apos_lotes_vazios: int = 3,
        salvar_bruto_em: Optional[str] = None,
        callback_progresso: Optional[Callable[[int, int], None]] = None,
        callback_status: Optional[Callable[[str], None]] = None,
    ) -> tuple[list[NotaEncontrada], int, DiagnosticoBusca]:
        """
        Varre a distribuição por NSU a partir de `nsu_inicial`, filtrando
        localmente as notas cuja data de COMPETÊNCIA (<dCompet> do XML)
        OU cuja data de EMISSÃO cai no (ano, mes) informado — cobre tanto
        o caso normal quanto o de notas emitidas com data retroativa
        (emitidas no mês pesquisado, mas com competência de um mês
        anterior). Cada `NotaEncontrada` retornada indica em
        `bate_competencia` qual dos dois critérios ela satisfaz — usado
        para separar os dois grupos no relatório.

        Retorna (lista_de_notas, ultimo_nsu_processado, diagnostico).
        Guarde o último NSU para continuar de onde parou numa próxima
        execução, em vez de escanear tudo de novo. O diagnóstico ajuda a
        explicar um resultado de "0 notas" sem precisar olhar JSON bruto.

        callback_progresso(nsu_atual, quantidade_encontrada) é chamado a
        cada lote, útil para atualizar uma barra de progresso na UI.
        callback_status(mensagem) é chamado com mensagens textuais, por
        exemplo avisos de espera por limite de requisições (429) ou de
        fim de distribuição confirmado pela API.
        """
        encontradas: list[NotaEncontrada] = []
        cancelamentos: dict[str, str] = {}  # chave_acesso -> motivo
        diagnostico = DiagnosticoBusca()
        nsu = nsu_inicial
        lotes_vazios_seguidos = 0

        for _ in range(max_lotes):
            payload = self.consultar_lote_por_nsu(
                nsu,
                salvar_bruto_em=salvar_bruto_em,
                callback_status=callback_status,
            )
            documentos = self._extrair_lista_documentos(payload)

            if self._documento_indica_fim(payload) and not documentos:
                if callback_status:
                    callback_status(
                        f"API confirmou que não há mais documentos a partir do NSU {nsu}."
                    )
                break

            if not documentos:
                lotes_vazios_seguidos += 1
                if lotes_vazios_seguidos >= parar_apos_lotes_vazios:
                    break
                nsu += 1
                continue

            lotes_vazios_seguidos = 0

            for doc in documentos:
                diagnostico.total_documentos_vistos += 1
                nsu_doc = self._extrair_campo(doc, ["nsu", "NSU"]) or str(nsu)

                xml_texto = self._decodificar_xml(doc)
                if not xml_texto:
                    diagnostico.documentos_sem_xml_decodificavel += 1
                else:
                    # Documentos de EVENTO (ex: cancelamento) também passam
                    # pela mesma distribuição por NSU que as notas. Tratamos
                    # esses separadamente, sem contar como "nota sem data".
                    evento = self._extrair_evento_cancelamento(xml_texto)
                    if evento:
                        chave_cancelada, motivo = evento
                        cancelamentos[chave_cancelada] = motivo
                        diagnostico.total_documentos_vistos -= 1  # não é nota; não entra na contagem de notas
                    else:
                        data_emissao = self._extrair_data_emissao_do_xml(xml_texto)
                        # Critério de filtro: entra se a COMPETÊNCIA
                        # (<dCompet>) cair no (ano, mês) pesquisado OU se a
                        # EMISSÃO cair — cobre tanto o caso normal quanto
                        # o de nota emitida com data retroativa (emitida
                        # agora, competência de um mês anterior). Se por
                        # algum motivo o XML não tiver <dCompet>
                        # reconhecível, cai para a data de emissão como
                        # competência também (em vez de descartar a nota).
                        data_competencia = self._extrair_competencia_do_xml(xml_texto)
                        data_competencia_ou_fallback = data_competencia or data_emissao

                        bate_competencia = bool(
                            data_competencia_ou_fallback
                            and data_competencia_ou_fallback.year == ano
                            and data_competencia_ou_fallback.month == mes
                        )
                        bate_emissao = bool(
                            data_emissao and data_emissao.year == ano and data_emissao.month == mes
                        )

                        if not data_competencia_ou_fallback and not data_emissao:
                            diagnostico.documentos_sem_data_reconhecida += 1
                        elif bate_competencia or bate_emissao:
                            chave = self._extrair_campo(
                                doc, ["chaveAcesso", "chave", "chaveNFSe", "ChaveAcesso"]
                            )
                            nota = NotaEncontrada(
                                nsu=str(nsu_doc),
                                chave_acesso=chave,
                                data_emissao=data_emissao,
                                xml=xml_texto,
                                bate_competencia=bate_competencia,
                            )
                            self._extrair_campos_relatorio(nota)
                            encontradas.append(nota)
                        else:
                            diagnostico.documentos_com_data_fora_do_mes += 1
                            if len(diagnostico.exemplos_datas_encontradas) < 5:
                                diagnostico.exemplos_datas_encontradas.append(data_competencia_ou_fallback)

                try:
                    nsu = max(nsu, int(nsu_doc))
                except (TypeError, ValueError):
                    pass

            nsu += 1

            if callback_progresso:
                callback_progresso(nsu, len(encontradas))

        # Aplica os cancelamentos encontrados (podem ter aparecido em NSUs
        # depois da nota original, então só dá pra saber no final da varredura).
        if cancelamentos:
            for nota in encontradas:
                if nota.chave_acesso and nota.chave_acesso in cancelamentos:
                    nota.cancelada = True
                    nota.motivo_cancelamento = cancelamentos[nota.chave_acesso]

        return encontradas, nsu, diagnostico
