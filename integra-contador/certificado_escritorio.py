"""
Busca e decifra o certificado e-CNPJ da própria SOMA — a mesma linha já
usada pelo soma-nfse/frontend para emitir NFS-e (tabela `certificates`,
mesmo esquema, mesma MASTER_ENCRYPTION_KEY). Não duplicamos cadastro nem
upload: só lemos o que já existe.

Formato do blob cifrado (definido em frontend/src/lib/certificate.ts,
função encryptSecret): AES-256-GCM, iv(12) || authTag(16) || ciphertext,
guardado como bytea no Postgres.
"""

from __future__ import annotations

import base64
import os
import tempfile
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from certificado import carregar_certificado_pfx
from supabase_client import obter_cliente


class ErroCertificadoEscritorio(Exception):
    pass


def _from_bytea(valor: str) -> bytes:
    """Inverso do toBytea do frontend — PostgREST devolve bytea como '\\x<hex>'."""
    hexadecimal = valor[2:] if valor.startswith("\\x") else valor
    return bytes.fromhex(hexadecimal)


def _decifrar(blob: bytes, chave: bytes) -> bytes:
    iv, tag, ciphertext = blob[:12], blob[12:28], blob[28:]
    return AESGCM(chave).decrypt(iv, ciphertext + tag, None)


def obter_certificado_temporario() -> tuple[str, str]:
    """
    Busca, decifra e grava o certificado da SOMA em arquivos PEM temporários
    (cert, key), prontos pra mTLS. Quem chamar é responsável por apagar logo
    depois de usar, via certificado.limpar_certificado_temporario — nunca
    fique com esses arquivos além da janela da chamada.
    """
    company_id = os.environ.get("SOMA_COMPANY_ID")
    if not company_id:
        raise ErroCertificadoEscritorio("SOMA_COMPANY_ID não configurado.")

    resposta = (
        obter_cliente()
        .table("certificates")
        .select("encrypted_file,encrypted_password,expires_at")
        .eq("company_id", company_id)
        .single()
        .execute()
    )
    linha = resposta.data
    if not linha:
        raise ErroCertificadoEscritorio(
            f"Nenhum certificado encontrado em `certificates` para company_id={company_id}."
        )

    expira_em = datetime.fromisoformat(linha["expires_at"])
    if expira_em < datetime.now(timezone.utc):
        raise ErroCertificadoEscritorio(
            f"O certificado da SOMA venceu em {expira_em:%d/%m/%Y} — renove no soma-nfse antes de continuar."
        )

    chave_mestra_raw = os.environ.get("MASTER_ENCRYPTION_KEY")
    if not chave_mestra_raw:
        raise ErroCertificadoEscritorio("MASTER_ENCRYPTION_KEY não configurada.")
    chave_mestra = base64.b64decode(chave_mestra_raw)

    pfx_bytes = _decifrar(_from_bytea(linha["encrypted_file"]), chave_mestra)
    senha = _decifrar(_from_bytea(linha["encrypted_password"]), chave_mestra).decode("utf-8")

    tmp = tempfile.NamedTemporaryFile(suffix=".pfx", delete=False)
    try:
        tmp.write(pfx_bytes)
        tmp.close()
        os.chmod(tmp.name, 0o600)
        return carregar_certificado_pfx(tmp.name, senha)
    finally:
        os.remove(tmp.name)
