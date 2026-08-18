"""
validadores.py

Validação de CPF e CNPJ (dígito verificador de verdade, não só
contagem de dígitos) — evita erro de digitação que só seria percebido
depois, na hora de emitir e ser rejeitado pelo Sefin Nacional.
"""

from __future__ import annotations

import re


def _somente_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def validar_cpf(cpf: str) -> bool:
    cpf = _somente_digitos(cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False

    soma = sum(int(cpf[i]) * (10 - i) for i in range(9))
    resto = (soma * 10) % 11
    d1 = 0 if resto == 10 else resto
    if d1 != int(cpf[9]):
        return False

    soma = sum(int(cpf[i]) * (11 - i) for i in range(10))
    resto = (soma * 10) % 11
    d2 = 0 if resto == 10 else resto
    return d2 == int(cpf[10])


def validar_cnpj(cnpj: str) -> bool:
    cnpj = _somente_digitos(cnpj)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False

    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

    soma = sum(int(cnpj[i]) * pesos1[i] for i in range(12))
    resto = soma % 11
    d1 = 0 if resto < 2 else 11 - resto
    if d1 != int(cnpj[12]):
        return False

    soma = sum(int(cnpj[i]) * pesos2[i] for i in range(13))
    resto = soma % 11
    d2 = 0 if resto < 2 else 11 - resto
    return d2 == int(cnpj[13])


def validar_cpf_ou_cnpj(documento: str) -> bool:
    """Detecta automaticamente pelo tamanho (11 = CPF, 14 = CNPJ) e
    valida o dígito verificador correspondente."""
    digitos = _somente_digitos(documento)
    if len(digitos) == 11:
        return validar_cpf(digitos)
    if len(digitos) == 14:
        return validar_cnpj(digitos)
    return False


def formatar_cpf_cnpj(documento: str) -> str:
    """Formata com pontuação para exibição (só cosmético)."""
    digitos = _somente_digitos(documento)
    if len(digitos) == 11:
        return f"{digitos[0:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:11]}"
    if len(digitos) == 14:
        return f"{digitos[0:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:14]}"
    return documento
