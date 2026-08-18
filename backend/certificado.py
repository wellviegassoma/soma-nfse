"""
certificado.py

Extraído de nfse_client.py do nfse-engine legado (que também cuida da
busca de notas via NSU — ainda não portada aqui, fica pra Fase D). Só as
funções de leitura/preparo do certificado A1, usadas por emissor.py e
pelas rotas de emissão/consulta em main.py. Nenhuma linha alterada em
relação ao original.
"""

from __future__ import annotations

import os
import tempfile
import warnings
from pathlib import Path

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


class ErroCertificado(Exception):
    pass


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
    de usar (ver `limpar_certificado_temporario`).
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
