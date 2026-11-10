"""
Aplica em PRODUÇÃO as linhas "pronto_para_emitir" de saida/proposta-servicos.json:
  - acao "criar": insere o serviço novo;
  - acao "completar": preenche só os campos vazios do serviço existente
    (e corrige código nacional que não tenha 6 dígitos).
Grava em saida/aplicado-<data>.json o que foi feito (ids criados e o estado
anterior dos serviços alterados) para permitir desfazer.

Uso: python -I scripts/tabelas-servico/aplicar_proposta.py [--executar]
Sem --executar só mostra o que faria.
"""

from __future__ import annotations

import datetime
import json
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = Path(__file__).resolve().parent / "saida"

CAMPOS = [
    "name", "description", "national_tax_code", "nbs", "municipal_tax_code", "iss_rate", "tipo_retencao_issqn",
    "cst_pis_cofins", "aliquota_pis", "aliquota_cofins", "percentual_total_tributos_federal",
    "percentual_total_tributos_estadual", "percentual_total_tributos_municipal", "atividade_simples_nacional",
]


def ler_env() -> dict[str, str]:
    env = {}
    for linha in (RAIZ / "frontend" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


ENV = ler_env()


def req(metodo: str, caminho: str, corpo=None):
    chave = ENV["SUPABASE_SERVICE_ROLE_KEY"]
    r = urllib.request.Request(
        ENV["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/" + caminho,
        method=metodo,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        headers={
            "apikey": chave, "Authorization": "Bearer " + chave,
            "Content-Type": "application/json", "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read() or b"null")


def main(executar: bool):
    propostas = [p for p in json.loads((SAIDA / "proposta-servicos.json").read_text(encoding="utf-8")) if p["pronto_para_emitir"]]
    criar = [p for p in propostas if p["acao"] == "criar"]
    completar = [p for p in propostas if p["acao"] == "completar"]
    registro = {"criados": [], "alterados": []}

    novos = [{"company_id": p["company_id"], "active": True, **{c: p[c] for c in CAMPOS}} for p in criar]

    patches = []
    for p in completar:
        atual = req("GET", f"services?id=eq.{p['service_id']}&select=*")[0]
        mudanca = {c: p[c] for c in CAMPOS if atual.get(c) in (None, "") and p[c] not in (None, "")}
        if len((atual.get("national_tax_code") or "")) != 6:
            mudanca["national_tax_code"] = p["national_tax_code"]
        if not atual.get("active"):
            mudanca["active"] = True
        if mudanca:
            patches.append((atual, mudanca))

    print(f"criar: {len(novos)} | completar: {len(patches)} (de {len(completar)})")
    if not executar:
        for atual, m in patches[:5]:
            print("  ex.:", atual["name"], "→", m)
        return

    for i in range(0, len(novos), 50):
        criados = req("POST", "services", novos[i:i + 50])
        registro["criados"] += [c["id"] for c in criados]
    for atual, m in patches:
        req("PATCH", f"services?id=eq.{atual['id']}", m)
        registro["alterados"].append({"id": atual["id"], "antes": {k: atual.get(k) for k in m}, "depois": m})

    arq = SAIDA / f"aplicado-{datetime.datetime.now():%Y%m%d-%H%M%S}.json"
    arq.write_text(json.dumps(registro, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"feito: {len(registro['criados'])} criados, {len(registro['alterados'])} alterados → {arq.name}")


if __name__ == "__main__":
    main("--executar" in sys.argv)
