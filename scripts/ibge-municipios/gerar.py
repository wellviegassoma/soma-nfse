"""Gera frontend/public/ibge/municipios/<UF>.json a partir da API pública do IBGE.

Cada arquivo é uma lista [[codigo_ibge, nome], ...] ordenada por nome. O
seletor UF → Município do cadastro de cliente lê esses arquivos estáticos em
vez de chamar a API do IBGE em tempo real (evita depender dela no cadastro).

Rodar de novo só quando o IBGE criar/renomear município (raro):
    python scripts/ibge-municipios/gerar.py
"""
import json
import locale
import pathlib
import unicodedata
import urllib.request

URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"
DESTINO = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "public" / "ibge" / "municipios"


def chave(nome: str) -> str:
    return unicodedata.normalize("NFD", nome).encode("ascii", "ignore").decode().lower()


def main() -> None:
    with urllib.request.urlopen(URL, timeout=60) as resp:
        dados = json.load(resp)
    por_uf: dict[str, list[list[str]]] = {}
    for m in dados:
        por_uf.setdefault(m["UF-sigla"], []).append([str(m["municipio-id"]), m["municipio-nome"]])
    DESTINO.mkdir(parents=True, exist_ok=True)
    total = 0
    for uf, lista in sorted(por_uf.items()):
        lista.sort(key=lambda x: chave(x[1]))
        (DESTINO / f"{uf}.json").write_text(json.dumps(lista, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += len(lista)
    print(f"{len(por_uf)} UFs, {total} municípios gravados em {DESTINO}")


if __name__ == "__main__":
    main()
