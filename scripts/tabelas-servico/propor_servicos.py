"""
Monta a PROPOSTA de cadastro de serviços para as empresas que ainda não têm
serviço completo para emitir, a partir das notas de saída aceitas da
própria empresa (notas_distribuidas). Só lê o Supabase — não grava nada.

Saída:
  scripts/tabelas-servico/saida/proposta-servicos.xlsx  (para revisão)
  scripts/tabelas-servico/saida/proposta-servicos.json  (para aplicar depois)

Uso (da raiz do repositório):
    python -I scripts/tabelas-servico/propor_servicos.py [competencia_inicial]
"""

from __future__ import annotations

import json
import re
import statistics
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill

RAIZ = Path(__file__).resolve().parents[2]
LIB = RAIZ / "frontend" / "src" / "lib"
SAIDA = Path(__file__).resolve().parent / "saida"

# Mesmo mapa de frontend/src/lib/lc116-sugestao-atividade.ts
ATIVIDADE_POR_SUBITEM = {
    "0401": "medicina", "0405": "psicologia_terapias", "0406": "medicina",
    "0408": "fisioterapia", "0409": "psicologia_terapias", "0410": "psicologia_terapias",
    "0411": "medicina", "0412": "odontologia", "0414": "proteses_gerais",
    "0415": "psicologia_terapias", "0416": "psicologia_terapias",
}


def ler_env() -> dict[str, str]:
    env = {}
    for linha in (RAIZ / "frontend" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


ENV = ler_env()


def buscar_tudo(caminho: str) -> list[dict]:
    url = ENV["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/" + caminho
    chave = ENV["SUPABASE_SERVICE_ROLE_KEY"]
    out: list[dict] = []
    inicio = 0
    while True:
        req = urllib.request.Request(
            url, headers={"apikey": chave, "Authorization": "Bearer " + chave, "Range": f"{inicio}-{inicio + 999}"}
        )
        with urllib.request.urlopen(req, timeout=180) as r:
            pagina = json.loads(r.read())
        out.extend(pagina)
        if len(pagina) < 1000:
            return out
        inicio += 1000


def carregar_descricoes():
    nbs = dict(re.findall(r'"(\d{9})": "((?:[^"\\]|\\.)*)"', (LIB / "nbs-tabela.ts").read_text(encoding="utf-8")))
    nac = dict(
        re.findall(r'codigo: "(\d{6})", descricao: "((?:[^"\\]|\\.)*)"', (LIB / "lista-servico-nacional.ts").read_text(encoding="utf-8"))
    )
    corr: dict[str, list[str]] = {}
    for cod, lista in re.findall(r'"(\d{6})": (\[\[.*?\]\]),', (LIB / "servico-uso-clientes.ts").read_text(encoding="utf-8")):
        corr[cod] = [x[0] for x in json.loads(lista)]
    return nbs, nac, corr


def tag(xml: str, nome: str) -> str | None:
    m = re.search(rf"<{nome}>([^<]*)</{nome}>", xml)
    return m.group(1).strip() if m else None


def num(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def moda(valores):
    c = Counter(v for v in valores if v is not None)
    return c.most_common(1)[0][0] if c else None


def mediana(valores):
    v = [x for x in valores if x is not None]
    return round(statistics.median(v), 2) if v else None


def completo(s: dict) -> bool:
    return bool(
        s["active"] and s["national_tax_code"] and s["nbs"]
        and s["percentual_total_tributos_federal"] is not None
        and s["percentual_total_tributos_estadual"] is not None
        and s["percentual_total_tributos_municipal"] is not None
    )


def main(competencia_inicial: str):
    nbs_desc, nac_desc, corr = carregar_descricoes()
    empresas = {
        e["id"]: e
        for e in buscar_tudo("companies?select=id,codigo_cliente,legal_name,tax_regime,municipality_name,ativa")
        if e.get("ativa") is not False
    }
    servicos = buscar_tudo(
        "services?select=id,company_id,name,active,national_tax_code,nbs,municipal_tax_code,iss_rate,tipo_retencao_issqn,"
        "cst_pis_cofins,percentual_total_tributos_federal,percentual_total_tributos_estadual,percentual_total_tributos_municipal,"
        "aliquota_pis,aliquota_cofins,atividade_simples_nacional,description"
    )
    serv_por_emp: dict[str, list[dict]] = defaultdict(list)
    for s in servicos:
        serv_por_emp[s["company_id"]].append(s)
    alvo = {cid for cid in empresas if not any(completo(s) for s in serv_por_emp[cid])}

    notas = buscar_tudo(
        "notas_distribuidas?select=company_id,codigo_trib_nacional,codigo_nbs,aliquota_issqn,descricao_servico,xml"
        f"&direcao=eq.saida&cancelada=eq.false&competencia=gte.{competencia_inicial}&order=id"
    )
    grupos: dict[tuple[str, str], list[dict]] = defaultdict(list)
    total_emp: Counter = Counter()
    for n in notas:
        cid = n["company_id"]
        cod = re.sub(r"\D", "", n.get("codigo_trib_nacional") or "")
        if cid not in alvo or len(cod) != 6:
            continue
        x = n.get("xml") or ""
        v_serv = num(tag(x, "vServ"))
        p_fed, p_est, p_mun = num(tag(x, "pTotTribFed")), num(tag(x, "pTotTribEst")), num(tag(x, "pTotTribMun"))
        p_sn = num(tag(x, "pTotTribSN"))
        if p_fed is None and p_sn is not None:
            p_fed, p_est, p_mun = p_sn, 0.0, 0.0
        if p_fed is None and v_serv:
            vf, ve, vm = num(tag(x, "vTotTribFed")), num(tag(x, "vTotTribEst")), num(tag(x, "vTotTribMun"))
            if vf is not None:
                p_fed, p_est, p_mun = (round(100 * (v or 0) / v_serv, 2) for v in (vf, ve, vm))
        piscofins = x[x.find("<piscofins>"): x.find("</piscofins>")] if "<piscofins>" in x else ""
        grupos[(cid, cod)].append({
            "nbs": (n.get("codigo_nbs") or "").strip() or None,
            "ctribmun": tag(x, "cTribMun"),
            "aliq": num(tag(x, "pAliq")) or n.get("aliquota_issqn"),
            "tpret": tag(x, "tpRetISSQN"),
            "cst": tag(piscofins, "CST") if piscofins else None,
            "ppis": num(tag(piscofins, "pAliqPis")) if piscofins else None,
            "pcof": num(tag(piscofins, "pAliqCofins")) if piscofins else None,
            "fed": p_fed, "est": p_est, "mun": p_mun,
            "desc": re.sub(r"\s+", " ", n.get("descricao_servico") or "").strip(),
        })
        total_emp[cid] += 1

    propostas = []
    for (cid, cod), ns in sorted(grupos.items(), key=lambda kv: (empresas[kv[0][0]].get("codigo_cliente") or "", kv[0][1])):
        if len(ns) < 3 and len(ns) / total_emp[cid] < 0.10:
            continue
        e = empresas[cid]
        regime = e.get("tax_regime")
        alertas: list[str] = []

        nbs_validas = [n["nbs"] for n in ns if n["nbs"] in nbs_desc and not n["nbs"].startswith("9999")]
        nbs = moda(nbs_validas)
        origem_nbs = "notas da empresa"
        if nbs and corr.get(cod) and nbs not in corr[cod]:
            alertas.append(f"NBS {nbs} das notas é incomum para este serviço; trocada pela mais usada")
            nbs = None
        if not nbs:
            nbs = (corr.get(cod) or [None])[0]
            origem_nbs = "mais usada por outros clientes" if nbs else "—"
        if not nbs:
            alertas.append("sem NBS: escolher no cadastro")

        cst = moda(n["cst"] for n in ns)
        if not cst:
            cst = "00" if regime == "SIMPLES_NACIONAL" else "01" if regime in ("LUCRO_PRESUMIDO", "LUCRO_REAL") else None
        if regime is None:
            alertas.append("regime da empresa não cadastrado")
        if regime == "SIMPLES_NACIONAL" and cst not in (None, "00"):
            alertas.append(f"empresa do Simples com CST {cst} nas notas")
        if regime in ("LUCRO_PRESUMIDO", "LUCRO_REAL") and cst == "00":
            alertas.append("empresa fora do Simples com CST 00 nas notas")

        fed, est, mun = mediana(n["fed"] for n in ns), mediana(n["est"] for n in ns), mediana(n["mun"] for n in ns)
        if fed is None:
            alertas.append("notas sem % de tributos: preencher")

        desc_comum, qtd = (Counter(n["desc"] for n in ns if n["desc"]).most_common(1) or [(None, 0)])[0]
        descricao = desc_comum if desc_comum and qtd / len(ns) >= 0.3 and not re.search(r"\d", desc_comum) else None

        existente = next(
            (s for s in serv_por_emp[cid] if re.sub(r"\D", "", s["national_tax_code"] or "") in (cod, cod[:4])), None
        )
        nome = re.sub(r"\.$", "", nac_desc.get(cod, cod))
        if len(nome) > 60:
            nome = nome[:57].rsplit(" ", 1)[0] + "…"

        propostas.append({
            "acao": "completar" if existente else "criar",
            "service_id": existente["id"] if existente else None,
            "company_id": cid,
            "codigo_cliente": e.get("codigo_cliente"),
            "empresa": e.get("legal_name"),
            "regime": regime,
            "municipio": e.get("municipality_name"),
            "name": existente["name"] if existente else nome,
            "description": (existente or {}).get("description") or descricao,
            "national_tax_code": cod,
            "nbs": nbs,
            "origem_nbs": origem_nbs,
            "municipal_tax_code": moda(n["ctribmun"] for n in ns),
            "iss_rate": moda(n["aliq"] for n in ns),
            "tipo_retencao_issqn": int(moda(n["tpret"] for n in ns) or 1),
            "cst_pis_cofins": cst,
            "aliquota_pis": moda(n["ppis"] for n in ns),
            "aliquota_cofins": moda(n["pcof"] for n in ns),
            "percentual_total_tributos_federal": fed,
            "percentual_total_tributos_estadual": est,
            "percentual_total_tributos_municipal": mun,
            "atividade_simples_nacional": ATIVIDADE_POR_SUBITEM.get(cod[:4]) if regime == "SIMPLES_NACIONAL" else None,
            "notas_no_grupo": len(ns),
            "pronto_para_emitir": bool(nbs and fed is not None),
            "alertas": "; ".join(alertas),
        })

    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "proposta-servicos.json").write_text(json.dumps(propostas, ensure_ascii=False, indent=1), encoding="utf-8")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Proposta"
    cols = [
        ("Ação", "acao"), ("Cód.", "codigo_cliente"), ("Empresa", "empresa"), ("Regime", "regime"), ("Município", "municipio"),
        ("Nome do serviço", "name"), ("Cód. nacional", "national_tax_code"), ("Serviço (lista nacional)", None),
        ("NBS", "nbs"), ("NBS (descrição)", None), ("Origem da NBS", "origem_nbs"), ("Cód. municipal", "municipal_tax_code"),
        ("Alíq. ISS", "iss_rate"), ("Ret. ISS (1=não)", "tipo_retencao_issqn"), ("CST PIS/COFINS", "cst_pis_cofins"),
        ("Alíq. PIS", "aliquota_pis"), ("Alíq. COFINS", "aliquota_cofins"), ("% Fed.", "percentual_total_tributos_federal"),
        ("% Est.", "percentual_total_tributos_estadual"), ("% Mun.", "percentual_total_tributos_municipal"),
        ("Atividade Simples", "atividade_simples_nacional"), ("Descrição padrão", "description"),
        ("Notas usadas", "notas_no_grupo"), ("Pronto p/ emitir", "pronto_para_emitir"), ("Alertas", "alertas"),
    ]
    ws.append([c[0] for c in cols])
    for c in ws[1]:
        c.font = Font(bold=True)
    amarelo = PatternFill("solid", fgColor="FFF2CC")
    for p in propostas:
        linha = []
        for titulo, chave in cols:
            if titulo == "Serviço (lista nacional)":
                linha.append(nac_desc.get(p["national_tax_code"]))
            elif titulo == "NBS (descrição)":
                linha.append(nbs_desc.get(p["nbs"] or ""))
            elif chave == "pronto_para_emitir":
                linha.append("sim" if p[chave] else "não")
            else:
                linha.append(p[chave])
        ws.append(linha)
        if p["alertas"]:
            for c in ws[ws.max_row]:
                c.fill = amarelo
    ws.freeze_panes = "D2"
    ws.auto_filter.ref = ws.dimensions
    for col, larg in zip("ABCDEFGHIJKLMNOPQRSTUVWXY", [10, 7, 38, 18, 16, 30, 10, 40, 11, 45, 22, 9, 7, 8, 8, 7, 8, 7, 7, 7, 16, 30, 8, 9, 60]):
        ws.column_dimensions[col].width = larg

    sem_notas = sorted(
        (empresas[c] for c in alvo if total_emp[c] == 0), key=lambda e: e.get("codigo_cliente") or ""
    )
    ws2 = wb.create_sheet("Sem notas (cadastro manual)")
    ws2.append(["Cód.", "Empresa", "Regime", "Município"])
    for c in ws2[1]:
        c.font = Font(bold=True)
    for e in sem_notas:
        ws2.append([e.get("codigo_cliente"), e.get("legal_name"), e.get("tax_regime"), e.get("municipality_name")])
    ws2.column_dimensions["B"].width = 45
    wb.save(SAIDA / "proposta-servicos.xlsx")

    emp_com = {p["company_id"] for p in propostas}
    print(f"empresas alvo: {len(alvo)} | com proposta: {len(emp_com)} | sem notas no período: {len(sem_notas)}")
    print(f"serviços propostos: {len(propostas)} (criar {sum(p['acao']=='criar' for p in propostas)}, completar {sum(p['acao']=='completar' for p in propostas)})")
    print(f"prontos p/ emitir: {sum(p['pronto_para_emitir'] for p in propostas)} | com alerta: {sum(bool(p['alertas']) for p in propostas)}")
    print("alertas:", Counter(a.split(':')[0].split(' das ')[0] for p in propostas for a in p['alertas'].split('; ') if a).most_common())


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "2026-05-01")
