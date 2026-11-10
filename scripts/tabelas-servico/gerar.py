"""
Gera as tabelas estáticas usadas no cadastro de serviço (frontend):

  frontend/src/lib/lista-servico-nacional.ts
      Lista de Serviços Nacional (código de tributação nacional, 6 dígitos)
      a partir do Anexo B oficial da NFS-e Nacional (gov.br/nfse).

  frontend/src/lib/servico-uso-clientes.ts
      Combinações que os clientes da SOMA de fato usaram em notas aceitas
      (notas_distribuidas, saída): NBS mais usadas por código nacional e
      código municipal (cTribMun) mais usado por município + código
      nacional. Serve de sugestão no formulário — nunca decide sozinho.

Uso (da raiz do repositório):
    python -I scripts/tabelas-servico/gerar.py <caminho do anexo_b.xlsx> [competencia_inicial]

Só faz leitura no Supabase (service role do frontend/.env.local).
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parents[2]
LIB = RAIZ / "frontend" / "src" / "lib"


def ler_env() -> dict[str, str]:
    env = {}
    for linha in (RAIZ / "frontend" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


def ts_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def gerar_lista_servico(caminho_xlsx: str) -> int:
    wb = openpyxl.load_workbook(caminho_xlsx, read_only=True, data_only=True)
    ws = wb["LISTA.SERV.NAC."]
    itens: dict[str, str] = {}
    subitens: dict[str, str] = {}
    codigos: list[tuple[str, str, str]] = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        codigo, item, subitem, desdobro, descricao = (row + (None,) * 5)[:5]
        if item is None or descricao is None:
            continue
        item_s = str(item).strip().zfill(2)
        sub_s = str(subitem).strip().zfill(2)
        desc = re.sub(r"\s+", " ", str(descricao)).strip()
        if sub_s == "00":
            itens[item_s] = desc
            continue
        if str(desdobro).strip() in ("0", "00"):
            subitens[item_s + sub_s] = desc
            continue
        if codigo is None:
            continue
        cod = re.sub(r"\D", "", str(codigo)).zfill(6)
        codigos.append((cod, desc, item_s + sub_s))

    linhas = [
        "// GERADO por scripts/tabelas-servico/gerar.py — não editar à mão.",
        "// Fonte: Anexo B da NFS-e Nacional (ANEXO_B-NBS2-LISTA_SERVICO_NACIONAL-SNNFSe-v1.01-20260122),",
        "// https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual",
        "// Usada no cadastro de serviço pra buscar o código de tributação nacional pela descrição.",
        "",
        "export type CodigoServicoNacional = {",
        "  /** 6 dígitos, como vai no cTribNac (ex.: \"040101\"). */",
        "  codigo: string;",
        "  descricao: string;",
        "  /** Descrição do subitem da LC 116 (contexto quando há vários desdobros). */",
        "  subitem: string;",
        "  /** Título do item (grupo) da lista. */",
        "  item: string;",
        "};",
        "",
        "export const ITENS_SERVICO_NACIONAL: Record<string, string> = {",
    ]
    for k, v in itens.items():
        linhas.append(f"  {ts_str(k)}: {ts_str(v)},")
    linhas += ["};", "", "export const LISTA_SERVICO_NACIONAL: CodigoServicoNacional[] = ["]
    for cod, desc, sub in codigos:
        linhas.append(
            f"  {{ codigo: {ts_str(cod)}, descricao: {ts_str(desc)}, subitem: {ts_str(subitens.get(sub, desc))}, item: {ts_str(itens.get(cod[:2], ''))} }},"
        )
    linhas += [
        "];",
        "",
        "const POR_CODIGO = new Map(LISTA_SERVICO_NACIONAL.map((c) => [c.codigo, c]));",
        "",
        "export function buscarCodigoServicoNacional(codigo: string | null | undefined) {",
        "  if (!codigo) return undefined;",
        "  return POR_CODIGO.get(codigo.replace(/\\D/g, \"\").padStart(6, \"0\"));",
        "}",
        "",
    ]
    (LIB / "lista-servico-nacional.ts").write_text("\n".join(linhas), encoding="utf-8")
    return len(codigos)


def buscar_tudo(env: dict[str, str], caminho: str) -> list[dict]:
    url = env["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/" + caminho
    chave = env["SUPABASE_SERVICE_ROLE_KEY"]
    out: list[dict] = []
    inicio = 0
    while True:
        req = urllib.request.Request(
            url,
            headers={"apikey": chave, "Authorization": "Bearer " + chave, "Range": f"{inicio}-{inicio + 999}"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            pagina = json.loads(r.read())
        out.extend(pagina)
        if len(pagina) < 1000:
            return out
        inicio += 1000


RE_CTRIBMUN = re.compile(r"<cTribMun>([^<]+)</cTribMun>")


def gerar_uso_clientes(env: dict[str, str], competencia_inicial: str) -> tuple[int, int, int]:
    empresas = buscar_tudo(env, "companies?select=id,municipality_ibge_code")
    ibge = {e["id"]: e["municipality_ibge_code"] for e in empresas}
    notas = buscar_tudo(
        env,
        "notas_distribuidas?select=company_id,codigo_trib_nacional,codigo_nbs,xml"
        f"&direcao=eq.saida&cancelada=eq.false&competencia=gte.{competencia_inicial}&order=id",
    )
    nbs_por_codigo: dict[str, Counter] = defaultdict(Counter)
    mun_por_codigo: dict[str, Counter] = defaultdict(Counter)
    for n in notas:
        cod = (n.get("codigo_trib_nacional") or "").strip()
        if not cod:
            continue
        if n.get("codigo_nbs"):
            nbs_por_codigo[cod][n["codigo_nbs"].strip()] += 1
        m = RE_CTRIBMUN.search(n.get("xml") or "")
        mun = ibge.get(n["company_id"])
        if m and mun:
            mun_por_codigo[f"{mun}|{cod}"][m.group(1).strip()] += 1

    linhas = [
        "// GERADO por scripts/tabelas-servico/gerar.py — não editar à mão.",
        f"// Combinações usadas em notas de saída aceitas dos clientes da SOMA desde {competencia_inicial}",
        "// (notas_distribuidas). Só sugestão no cadastro de serviço — quem cadastra confirma.",
        "",
        "/** cTribNac → NBS usadas junto, da mais pra menos usada: [nbs, quantidade de notas]. */",
        "export const NBS_USADAS_POR_CODIGO: Record<string, [string, number][]> = {",
    ]
    for cod in sorted(nbs_por_codigo):
        # Corta códigos "coringa" (999999999) e usos raros (< 2% das notas
        # do código) — quase sempre NBS escolhida errado no emissor.
        total = sum(nbs_por_codigo[cod].values())
        top = [
            (k, v)
            for k, v in nbs_por_codigo[cod].most_common(8)
            if v >= 2 and v / total >= 0.02 and not k.startswith("9999")
        ]
        if top:
            linhas.append(f"  {ts_str(cod)}: {json.dumps(top)},")
    linhas += [
        "};",
        "",
        "/** \"ibge|cTribNac\" → códigos municipais (cTribMun) aceitos: [código, quantidade de notas]. */",
        "export const CODIGO_MUNICIPAL_USADO: Record<string, [string, number][]> = {",
    ]
    for chave in sorted(mun_por_codigo):
        top = mun_por_codigo[chave].most_common(5)
        linhas.append(f"  {ts_str(chave)}: {json.dumps(top, ensure_ascii=False)},")
    linhas += ["};", ""]
    (LIB / "servico-uso-clientes.ts").write_text("\n".join(linhas), encoding="utf-8")
    return len(notas), len(nbs_por_codigo), len(mun_por_codigo)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    print("códigos nacionais:", gerar_lista_servico(sys.argv[1]))
    print("notas lidas / códigos com NBS / pares município×código:", gerar_uso_clientes(ler_env(), sys.argv[2] if len(sys.argv) > 2 else "2026-01-01"))
