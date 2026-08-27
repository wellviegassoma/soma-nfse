"""
certificado.py

Trecho de backend/certificado.py (nfse-engine) — mesmo princípio de "portar
sem alterar lógica" já usado nesse repo (ver backend/README.md). Duplicado
aqui, e não importado via caminho relativo, porque cada serviço é
implantado no Railway a partir da sua própria pasta como root directory —
um import cross-pasta quebraria no deploy. Só as duas funções realmente
usadas aqui (carregar e depois apagar o certificado temporário); nenhuma
linha alterada em relação ao original.
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

warnings.filterwarnings(
    "ignore",
    message="PKCS#12 bundle could not be parsed as DER",
    category=UserWarning,
)


class ErroCertificado(Exception):
    pass


def carregar_certificado_pfx(caminho_pfx: str, senha: str) -> tuple[str, str]:
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

    tmp_dir = tempfile.mkdtemp(prefix="integra_contador_cert_")
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
