# -*- coding: utf-8 -*-
"""
Grava no soma-nfse os processos lidos do eLegalize por preparar.py (plano.json).

    python gravar.py --dry      # monta tudo, mostra contagens, não grava nada
    python gravar.py --commit   # grava de verdade

Idempotente via legalizacao_processos.origem_externa='ELEGALIZE' +
origem_externa_id (colunas que já existem no schema pra isso) — reexecutar
não duplica.

Processos com company_id nulo E revisar_manualmente=true (Alteração/
Encerramento sem empresa confirmada) são SEMPRE pulados, mesmo em --commit —
exige rodar preparar.py de novo com o mapeamento corrigido primeiro.
"""
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

ENV_LOCAL = Path(
    r"C:\Users\Wellington Viegas\Documents\ClaudeCode\soma-nfse\frontend\.env.local"
)
OUT_DIR = Path(__file__).parent
PLANO = OUT_DIR / "plano.json"
LOG = OUT_DIR / "gravacao_log.txt"


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
    try:
        with urllib.request.urlopen(req) as resp:
            corpo = resp.read().decode("utf-8")
            return json.loads(corpo) if corpo else None
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8")
        raise RuntimeError(f"HTTP {exc.code}: {detalhe}") from exc


def ja_importado(url_base: str, apikey: str, origem_externa_id: str) -> bool:
    resultado = rest(
        "GET", url_base, apikey,
        f"legalizacao_processos?select=id&origem_externa=eq.ELEGALIZE"
        f"&origem_externa_id=eq.{origem_externa_id}&limit=1",
    )
    return bool(resultado)


def main():
    if sys.stdout.encoding != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")

    modo = sys.argv[1] if len(sys.argv) > 1 else "--dry"
    if modo not in ("--dry", "--commit"):
        print("Uso: python gravar.py [--dry|--commit]", file=sys.stderr)
        sys.exit(1)
    commit = modo == "--commit"

    if not PLANO.exists():
        print(f"{PLANO} não existe — rode preparar.py primeiro.", file=sys.stderr)
        sys.exit(1)
    plano = json.loads(PLANO.read_text(encoding="utf-8"))
    processos = plano["processos"]

    url_base = ler_env("NEXT_PUBLIC_SUPABASE_URL")
    service_key = ler_env("SUPABASE_SERVICE_ROLE_KEY")

    fluxos = rest("GET", url_base, service_key, "legalizacao_fluxos?select=id,chave")
    fluxo_id_por_chave = {f["chave"]: f["id"] for f in fluxos}

    criados = 0
    pulados_ja_importado = 0
    pulados_sem_empresa = 0
    erros: list[str] = []
    log_linhas = []

    for p in processos:
        nome_log = p["nome_eLegalize"]

        if p["revisar_manualmente"]:
            pulados_sem_empresa += 1
            log_linhas.append(f"PULADO (revisar empresa) {nome_log!r}")
            continue

        if p["tipo_processo"] != "ABERTURA" and not p["company_id"]:
            pulados_sem_empresa += 1
            log_linhas.append(f"PULADO (sem empresa) {nome_log!r}")
            continue

        if ja_importado(url_base, service_key, p["origem_externa_id"]):
            pulados_ja_importado += 1
            continue

        fluxo_id = fluxo_id_por_chave.get(p["fluxo_chave"])
        if not fluxo_id:
            erros.append(f"{nome_log!r}: fluxo {p['fluxo_chave']!r} não encontrado")
            continue

        if not commit:
            criados += 1
            continue

        try:
            nome_processo = nome_log
            if p["tipo_processo"] != "ABERTURA":
                empresa = rest("GET", url_base, service_key, f"companies?id=eq.{p['company_id']}&select=legal_name,trade_name")
                nome_processo = (empresa[0].get("trade_name") or empresa[0]["legal_name"]) if empresa else nome_log

            novo = rest("POST", url_base, service_key, "legalizacao_processos", body={
                "tipo_processo": p["tipo_processo"],
                "fluxo_id": fluxo_id,
                "fluxo_nome": {"ABERTURA_EMPRESA": "Abertura de Empresa", "ALTERACAO_CONTRATUAL": "Alteração Contratual", "ENCERRAMENTO_EMPRESA": "Encerramento de Empresa"}[p["fluxo_chave"]],
                "nome": nome_processo,
                "company_id": p["company_id"],
                "data_inicio": p["data_inicio"],
                "prazo_final": p["prazo_final"],
                "origem_externa": "ELEGALIZE",
                "origem_externa_id": p["origem_externa_id"],
            })
            processo_id = novo[0]["id"]

            linhas_fases = [{
                "processo_id": processo_id,
                "nome": f["nome"],
                "ordem": (i + 1) * 10,
                "data_conclusao": f["data_conclusao"],
                "concluido_em": f"{f['data_conclusao']}T12:00:00Z" if f["data_conclusao"] else None,
                "status_manual": f["status_manual"],
            } for i, f in enumerate(p["fases"])]
            rest("POST", url_base, service_key, "legalizacao_processo_fases", body=linhas_fases)

            rest("POST", url_base, service_key, "legalizacao_processo_atividade", body={
                "processo_id": processo_id,
                "tipo": "SISTEMA",
                "corpo": f"Importado do eLegalize (negócio #{p['origem_externa_id']}: {nome_log}).",
            })

            criados += 1
            log_linhas.append(f"OK {nome_log!r} -> processo_id={processo_id}")
        except Exception as exc:
            erros.append(f"{nome_log!r}: {exc}")
            log_linhas.append(f"ERRO {nome_log!r}: {exc}")

    if commit:
        LOG.write_text("\n".join(log_linhas) + "\n", encoding="utf-8")

    print(f"Modo: {'COMMIT (gravou de verdade)' if commit else 'DRY (nada foi gravado)'}")
    print(f"Processos {'criados' if commit else 'que seriam criados'}: {criados}")
    print(f"Pulados (já importados antes): {pulados_ja_importado}")
    print(f"Pulados (sem empresa confirmada — precisa revisar plano.json): {pulados_sem_empresa}")
    print(f"Erros: {len(erros)}")
    for e in erros[:30]:
        print(f"  - {e}")


if __name__ == "__main__":
    main()
