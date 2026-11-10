"""
Proposta de IBS/CBS (cClassTrib, cIndOp, CST) para os serviços ativos das
empresas fora do Simples (Lucro Presumido/Real), a partir das notas de saída
aceitas da própria empresa (notas_distribuidas, grupo <IBSCBS> da DPS) e, na
falta delas, do Anexo VIII oficial. Só lê o Supabase.

Saída: scripts/tabelas-servico/saida/proposta-ibscbs.xlsx e .json

Uso: python -I scripts/tabelas-servico/propor_ibscbs.py [--executar]
Com --executar grava em produção só os serviços com o grupo vazio e salva o
log em saida/aplicado-ibscbs-<data>.json.
"""

from __future__ import annotations

import datetime
import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = Path(__file__).resolve().parent / "saida"


def ler_env() -> dict[str, str]:
    env = {}
    for linha in (RAIZ / "frontend" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


ENV = ler_env()


def req(metodo: str, caminho: str, corpo=None, intervalo: str | None = None):
    chave = ENV["SUPABASE_SERVICE_ROLE_KEY"]
    h = {"apikey": chave, "Authorization": "Bearer " + chave, "Content-Type": "application/json", "Prefer": "return=representation"}
    if intervalo:
        h["Range"] = intervalo
    r = urllib.request.Request(
        ENV["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/" + caminho, method=metodo,
        data=json.dumps(corpo).encode() if corpo is not None else None, headers=h,
    )
    with urllib.request.urlopen(r, timeout=180) as resp:
        return json.loads(resp.read() or b"null")


def buscar_tudo(caminho: str, passo: int = 1000) -> list[dict]:
    out, inicio = [], 0
    while True:
        pagina = req("GET", caminho, intervalo=f"{inicio}-{inicio + passo - 1}")
        out.extend(pagina)
        if len(pagina) < passo:
            return out
        inicio += passo


def carregar_anexo():
    s = (RAIZ / "frontend" / "src" / "lib" / "ibscbs-correlacao.ts").read_text(encoding="utf-8")
    itens = json.loads(re.search(r"IBSCBS_POR_ITEM[^=]*= (\{.*?\n\});", s, re.S).group(1))
    nomes = json.loads(re.search(r"NOMES_CCLASSTRIB[^=]*= (\{.*?\n\});", s, re.S).group(1))
    return itens, nomes


def tag(xml: str, nome: str):
    m = re.search(rf"<{nome}>([^<]*)</{nome}>", xml)
    return m.group(1).strip() if m else None


def main(executar: bool):
    itens, nomes = carregar_anexo()
    empresas = {
        e["id"]: e
        for e in buscar_tudo("companies?select=id,codigo_cliente,legal_name,tax_regime,ativa")
        if e.get("ativa") is not False and e.get("tax_regime") in ("LUCRO_PRESUMIDO", "LUCRO_REAL")
    }
    servicos = [
        s for s in buscar_tudo(
            "services?select=id,company_id,name,national_tax_code,ibscbs_cst,ibscbs_cclasstrib,ibscbs_cind_op&active=eq.true"
        ) if s["company_id"] in empresas
    ]

    # Por empresa + código nacional: o que as notas aceitas usaram.
    uso: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for cid in empresas:
        notas = buscar_tudo(
            f"notas_distribuidas?select=codigo_trib_nacional,xml&company_id=eq.{cid}&direcao=eq.saida"
            "&cancelada=eq.false&competencia=gte.2026-09-01&order=id", passo=500,
        )
        for n in notas:
            x = n.get("xml") or ""
            dps = x[max(0, x.find("<infDPS")):]
            g = re.search(r"<IBSCBS>[\s\S]*?</IBSCBS>", dps)
            if not g:
                continue
            cod = re.sub(r"\D", "", n.get("codigo_trib_nacional") or "")
            trio = (tag(g.group(0), "cClassTrib"), tag(g.group(0), "cIndOp"))
            if all(trio):
                uso[(cid, cod)][trio] += 1

    propostas = []
    for s in servicos:
        cod = re.sub(r"\D", "", s["national_tax_code"] or "")
        e = empresas[s["company_id"]]
        alertas = []
        origem = ""
        cclass = cindop = None
        if uso.get((s["company_id"], cod)):
            (cclass, cindop), qtd = uso[(s["company_id"], cod)].most_common(1)[0]
            origem = f"notas da empresa ({qtd})"
        else:
            corr = itens.get(f"{cod[:2]}.{cod[2:4]}") if len(cod) >= 4 else None
            if corr and corr["cClassTrib"] and corr["indOp"]:
                cclass, cindop = corr["cClassTrib"][0], corr["indOp"][0]
                origem = "Anexo VIII (tabela oficial)"
                if len(corr["cClassTrib"]) > 1:
                    alertas.append("Anexo tem mais de uma classificação para este item: conferir")
            else:
                alertas.append("sem sugestão: preencher no cadastro")
        corr = itens.get(f"{cod[:2]}.{cod[2:4]}") if len(cod) >= 4 else None
        if cclass and corr and corr["cClassTrib"] and cclass not in corr["cClassTrib"]:
            alertas.append(f"notas usam {cclass}, Anexo VIII indica {', '.join(corr['cClassTrib'])}")
        ja = bool(s.get("ibscbs_cclasstrib"))
        propostas.append({
            "service_id": s["id"], "company_id": s["company_id"], "codigo_cliente": e.get("codigo_cliente"),
            "empresa": e.get("legal_name"), "regime": e.get("tax_regime"), "servico": s["name"],
            "national_tax_code": cod, "ibscbs_cclasstrib": cclass, "ibscbs_cst": cclass[:3] if cclass else None,
            "ibscbs_cind_op": cindop, "nome_cclasstrib": nomes.get(cclass or "", ""), "origem": origem,
            "ja_preenchido": ja, "alertas": "; ".join(alertas),
        })

    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "proposta-ibscbs.json").write_text(json.dumps(propostas, ensure_ascii=False, indent=1), encoding="utf-8")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Proposta IBS-CBS"
    cols = [("Cód.", "codigo_cliente"), ("Empresa", "empresa"), ("Regime", "regime"), ("Serviço", "servico"),
            ("Cód. nacional", "national_tax_code"), ("cClassTrib", "ibscbs_cclasstrib"), ("CST", "ibscbs_cst"),
            ("Classificação", "nome_cclasstrib"), ("cIndOp", "ibscbs_cind_op"), ("Origem", "origem"),
            ("Já preenchido", "ja_preenchido"), ("Alertas", "alertas")]
    ws.append([c[0] for c in cols])
    for c in ws[1]:
        c.font = Font(bold=True)
    amarelo = PatternFill("solid", fgColor="FFF2CC")
    for p in sorted(propostas, key=lambda p: (p["codigo_cliente"] or "", p["servico"])):
        ws.append(["sim" if p[k] is True else "não" if p[k] is False else p[k] for _, k in cols])
        if p["alertas"]:
            for c in ws[ws.max_row]:
                c.fill = amarelo
    for col, larg in zip("ABCDEFGHIJKL", [7, 40, 18, 30, 10, 11, 6, 45, 9, 26, 9, 55]):
        ws.column_dimensions[col].width = larg
    ws.freeze_panes = "C2"
    wb.save(SAIDA / "proposta-ibscbs.xlsx")

    a_gravar = [p for p in propostas if p["ibscbs_cclasstrib"] and p["ibscbs_cind_op"] and not p["ja_preenchido"]]
    print(f"empresas LP/Real: {len(empresas)} | serviços ativos: {len(propostas)} | com proposta: {len(a_gravar)}")
    print("origens:", Counter(p["origem"].split(" (")[0] or "sem" for p in propostas).most_common())
    print("combinações:", Counter((p["ibscbs_cclasstrib"], p["ibscbs_cind_op"]) for p in a_gravar).most_common(8))
    print("com alerta:", sum(bool(p["alertas"]) for p in propostas), Counter(p["alertas"].split(":")[0] for p in propostas if p["alertas"]).most_common())

    if executar:
        log = []
        for p in a_gravar:
            req("PATCH", f"services?id=eq.{p['service_id']}&ibscbs_cclasstrib=is.null", {
                "ibscbs_cclasstrib": p["ibscbs_cclasstrib"], "ibscbs_cst": p["ibscbs_cst"], "ibscbs_cind_op": p["ibscbs_cind_op"],
            })
            log.append(p["service_id"])
        arq = SAIDA / f"aplicado-ibscbs-{datetime.datetime.now():%Y%m%d-%H%M%S}.json"
        arq.write_text(json.dumps({"atualizados": log}, indent=1), encoding="utf-8")
        print(f"gravados {len(log)} → {arq.name} (antes os 3 campos estavam vazios)")


if __name__ == "__main__":
    main("--executar" in sys.argv)
