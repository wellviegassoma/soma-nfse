"""
Gera frontend/src/lib/ibscbs-correlacao.ts a partir do Anexo VIII oficial da
NFS-e (correlação Item LC 116 × NBS × cIndOp × cClassTrib), usado no cadastro
de serviço pra sugerir o grupo IBS/CBS.

Uso (da raiz do repositório):
    python -I scripts/tabelas-servico/gerar_ibscbs.py <caminho do anexo_viii.xlsx>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "frontend" / "src" / "lib" / "ibscbs-correlacao.ts"


def limpar(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def main(caminho: str):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb["tabela geral"]
    # Células mescladas (ex.: um cClassTrib valendo pra vários itens) só têm
    # valor na primeira célula — replica pras demais, menos na coluna do item.
    for faixa in list(ws.merged_cells.ranges):
        if faixa.min_col == 1:
            continue
        valor = ws.cell(faixa.min_row, faixa.min_col).value
        ws.unmerge_cells(str(faixa))
        for linha in range(faixa.min_row, faixa.max_row + 1):
            for col in range(faixa.min_col, faixa.max_col + 1):
                ws.cell(linha, col).value = valor
    itens: dict[str, dict] = {}
    classes: dict[str, str] = {}
    indops: dict[str, str] = {}
    atual = None
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        item, desc, nbs, _, _, _, indop, local, cclass, nome_cclass = (tuple(r) + (None,) * 10)[:10]
        if item:
            atual = limpar(item)
            itens.setdefault(atual, {"descricao": limpar(desc), "cClassTrib": [], "indOp": [], "nbs": []})
        if not atual:
            continue
        reg = itens[atual]
        if nbs:
            n = re.sub(r"\D", "", str(nbs))
            if n and n not in reg["nbs"]:
                reg["nbs"].append(n)
        if indop:
            c = re.sub(r"\D", "", str(indop)).zfill(6)
            if c not in reg["indOp"]:
                reg["indOp"].append(c)
            if local:
                indops[c] = limpar(local)
        if cclass:
            c = re.sub(r"\D", "", str(cclass)).zfill(6)
            if c not in reg["cClassTrib"]:
                reg["cClassTrib"].append(c)
            if nome_cclass:
                classes[c] = limpar(nome_cclass)

    linhas = [
        "// GERADO por scripts/tabelas-servico/gerar_ibscbs.py — não editar à mão.",
        "// Fonte: Anexo VIII v1.02.00 (26/10/2026) da NFS-e Nacional — correlação Item LC 116 × NBS ×",
        "// cIndOp × cClassTrib. https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc",
        "// O próprio governo diz que a tabela ainda está em construção: é sugestão, não validação.",
        "",
        "export type CorrelacaoIbsCbs = { descricao: string; cClassTrib: string[]; indOp: string[]; nbs: string[] };",
        "",
        "/** Chave: item LC 116 com ponto (ex.: \"04.01\"). */",
        f"export const IBSCBS_POR_ITEM: Record<string, CorrelacaoIbsCbs> = {json.dumps(itens, ensure_ascii=False, indent=1)};",
        "",
        "/** cClassTrib → nome oficial. */",
        f"export const NOMES_CCLASSTRIB: Record<string, string> = {json.dumps(dict(sorted(classes.items())), ensure_ascii=False, indent=1)};",
        "",
        "/** cIndOp → local de incidência do IBS. */",
        f"export const NOMES_CINDOP: Record<string, string> = {json.dumps(dict(sorted(indops.items())), ensure_ascii=False, indent=1)};",
        "",
        "/** \"040101\" (cTribNac) → \"04.01\" */",
        "export function itemLc116DoCodigo(codigoNacional: string | null | undefined): string | undefined {",
        "  const d = (codigoNacional ?? \"\").replace(/\\D/g, \"\");",
        "  return d.length >= 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}` : undefined;",
        "}",
        "",
        "export function correlacaoIbsCbs(codigoNacional: string | null | undefined): CorrelacaoIbsCbs | undefined {",
        "  const item = itemLc116DoCodigo(codigoNacional);",
        "  return item ? IBSCBS_POR_ITEM[item] : undefined;",
        "}",
        "",
    ]
    SAIDA.write_text("\n".join(linhas), encoding="utf-8")
    print(f"itens: {len(itens)} | cClassTrib: {len(classes)} | cIndOp: {len(indops)}")
    for k in ("04.01", "04.12", "04.03", "17.19", "08.02"):
        print(k, itens.get(k, {}).get("cClassTrib"), itens.get(k, {}).get("indOp"))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
