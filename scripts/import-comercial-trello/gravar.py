# -*- coding: utf-8 -*-
"""
Grava no soma-nfse os prospects lidos por preparar.py (plano.json).

    python gravar.py --dry      # monta tudo, mostra contagens, não grava nada
    python gravar.py --commit   # grava de verdade

Idempotente: cada prospect criado grava o id do card do Trello dentro de
comercial_prospect_atividade.metadata (evento SISTEMA) — reexecutar não
duplica (reconfere direto no banco antes de cada insert, não só confia no
plano.json já filtrado).

Anexos: baixa cada arquivo do Trello (precisa de TRELLO_KEY/TRELLO_TOKEN, os
mesmos de preparar.py) e reenvia pro Vercel Blob chamando o helper Node
`frontend/scripts/upload-blob-cli.mjs` — reaproveita o put() oficial do
@vercel/blob em vez de reimplementar o contrato REST do Blob aqui.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ENV_LOCAL = Path(
    r"C:\Users\Wellington Viegas\Documents\ClaudeCode\soma-nfse\frontend\.env.local"
)
OUT_DIR = Path(__file__).parent
PLANO = OUT_DIR / "plano.json"
LOG = OUT_DIR / "gravacao_log.txt"
UPLOAD_BLOB_CLI = (
    Path(__file__).parent.parent.parent / "frontend" / "scripts" / "upload-blob-cli.mjs"
)


def ler_env(chave: str) -> str:
    texto = ENV_LOCAL.read_text(encoding="utf-8")
    m = re.search(rf"^{re.escape(chave)}=(.*)$", texto, re.MULTILINE)
    if not m:
        raise RuntimeError(f"{chave} não encontrado em .env.local")
    return m.group(1).strip()


def rest(method: str, url_base: str, apikey: str, path: str, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{url_base}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": apikey,
            "Authorization": f"Bearer {apikey}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(req) as resp:
        corpo = resp.read().decode("utf-8")
        return json.loads(corpo) if corpo else None


def ja_importado(url_base: str, apikey: str, trello_card_id: str) -> bool:
    resultado = rest(
        "GET", url_base, apikey,
        f"comercial_prospect_atividade?select=id&tipo=eq.SISTEMA"
        f"&metadata->>trello_card_id=eq.{trello_card_id}&limit=1",
    )
    return bool(resultado)


def baixar_anexo(url: str, trello_key: str, trello_token: str) -> Path:
    sep = "&" if "?" in url else "?"
    req = urllib.request.Request(f"{url}{sep}key={trello_key}&token={trello_token}")
    tmp = Path(tempfile.mktemp())
    with urllib.request.urlopen(req) as resp, open(tmp, "wb") as f:
        f.write(resp.read())
    return tmp


def enviar_pro_blob(arquivo_local: Path, pathname: str) -> dict:
    resultado = subprocess.run(
        ["node", str(UPLOAD_BLOB_CLI), str(arquivo_local), pathname],
        capture_output=True, text=True,
    )
    if resultado.returncode != 0:
        raise RuntimeError(resultado.stderr.strip() or "Falha ao enviar pro Blob.")
    return json.loads(resultado.stdout.strip().splitlines()[-1])


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "--dry"
    if modo not in ("--dry", "--commit"):
        print("Uso: python gravar.py [--dry|--commit]", file=sys.stderr)
        sys.exit(1)
    commit = modo == "--commit"

    if not PLANO.exists():
        print(f"{PLANO} não existe — rode preparar.py primeiro.", file=sys.stderr)
        sys.exit(1)
    plano = json.loads(PLANO.read_text(encoding="utf-8"))
    prospects = plano["prospects"]

    url_base = ler_env("NEXT_PUBLIC_SUPABASE_URL")
    service_key = ler_env("SUPABASE_SERVICE_ROLE_KEY")
    trello_key = os.environ.get("TRELLO_KEY")
    trello_token = os.environ.get("TRELLO_TOKEN")

    etapas = rest("GET", url_base, service_key, "comercial_etapas?select=id,nome")
    etapa_id_por_nome = {e["nome"]: e["id"] for e in etapas}
    categorias = rest("GET", url_base, service_key, "comercial_checklist_categorias?select=nome,ordem")
    ordem_categoria_por_nome = {c["nome"]: c["ordem"] for c in categorias}

    criados = 0
    pulados = 0
    erros: list[str] = []
    log_linhas = []

    for prospect in prospects:
        card_id = prospect["trello_card_id"]
        if ja_importado(url_base, service_key, card_id):
            pulados += 1
            continue

        etapa_id = etapa_id_por_nome.get(prospect["etapa_db"])
        if not etapa_id:
            erros.append(f"{prospect['nome']!r}: etapa {prospect['etapa_db']!r} não encontrada")
            continue

        if not commit:
            criados += 1
            continue

        try:
            novo = rest("POST", url_base, service_key, "comercial_prospects", body={
                "nome": prospect["nome"],
                "etapa_id": etapa_id,
                "descricao": prospect["descricao"],
                "honorario_soma": prospect["honorario_soma"],
            })
            prospect_id = novo[0]["id"]

            if prospect["checklist"]:
                linhas_checklist = [{
                    "prospect_id": prospect_id,
                    "categoria_nome": item["categoria"],
                    "categoria_ordem": ordem_categoria_por_nome.get(item["categoria"], 999),
                    "item_descricao": item["item"],
                    "item_ordem": i,
                    "concluido": item["concluido"],
                } for i, item in enumerate(prospect["checklist"])]
                rest("POST", url_base, service_key, "comercial_prospect_checklist", body=linhas_checklist)

            for anexo in prospect["anexos"]:
                if not (trello_key and trello_token):
                    log_linhas.append(f"{prospect['nome']!r}: anexo {anexo['nome']!r} pulado (sem TRELLO_KEY/TOKEN)")
                    continue
                tmp = baixar_anexo(anexo["url"], trello_key, trello_token)
                try:
                    blob = enviar_pro_blob(tmp, f"comercial/{prospect_id}/{anexo['nome']}")
                finally:
                    tmp.unlink(missing_ok=True)
                rest("POST", url_base, service_key, "comercial_prospect_anexos", body={
                    "prospect_id": prospect_id,
                    "blob_url": blob["url"],
                    "blob_pathname": blob["pathname"],
                    "nome_arquivo": anexo["nome"],
                })

            rest("POST", url_base, service_key, "comercial_prospect_atividade", body={
                "prospect_id": prospect_id,
                "tipo": "SISTEMA",
                "corpo": "Importado do Trello.",
                "metadata": {"trello_card_id": card_id, "trello_url": prospect["trello_url"]},
            })

            criados += 1
            log_linhas.append(f"OK {prospect['nome']!r} -> prospect_id={prospect_id}")
        except Exception as exc:
            erros.append(f"{prospect['nome']!r}: {exc}")
            log_linhas.append(f"ERRO {prospect['nome']!r}: {exc}")

    if commit:
        LOG.write_text("\n".join(log_linhas) + "\n", encoding="utf-8")

    print(f"Modo: {'COMMIT (gravou de verdade)' if commit else 'DRY (nada foi gravado)'}")
    print(f"Prospects {'criados' if commit else 'que seriam criados'}: {criados}")
    print(f"Pulados (já importados antes): {pulados}")
    print(f"Erros: {len(erros)}")
    for e in erros[:30]:
        print(f"  - {e}")


if __name__ == "__main__":
    main()
