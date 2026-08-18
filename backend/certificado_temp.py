"""
certificado_temp.py

Ponte entre o certificado recebido em memória (bytes, mandados pelo
alterdata-api a cada requisição) e as funções já existentes de
xml_signer.py/nfse_client.py, que esperam um CAMINHO de arquivo .pfx
local (porque `cryptography.pkcs12` e o mTLS do `requests` trabalham
com arquivo, não com bytes soltos). Em vez de alterar aquelas funções já
validadas, este módulo só escreve os bytes recebidos num arquivo
temporário de curta duração (apagado sempre, mesmo em erro) e devolve o
caminho — igual ao que o app desktop já fazia com o cache local, só que
aqui o arquivo dura apenas o tempo de uma requisição.
"""

from __future__ import annotations

import contextlib
import shutil
import tempfile
from pathlib import Path
from typing import Iterator


@contextlib.contextmanager
def certificado_temporario(dados_pfx: bytes) -> Iterator[str]:
    pasta = tempfile.mkdtemp(prefix="nfse_engine_cert_")
    caminho = Path(pasta) / "certificado.pfx"
    try:
        caminho.write_bytes(dados_pfx)
        yield str(caminho)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
