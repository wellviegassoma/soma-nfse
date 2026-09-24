# -*- coding: utf-8 -*-
"""
Prepara a importação do board Trello "Onboarding – Novos Clientes | SOMA"
pro módulo Comercial do soma-nfse.

Fase 1 de 2: só LÊ o board (API do Trello, escopo leitura) e o estado atual
do banco (via REST, leitura), monta o plano completo em JSON e um relatório
legível. NÃO GRAVA NADA. A gravação de verdade é gravar.py, que só roda
depois de eu conferir este relatório contra uma amostra de cards reais.

Precisa de TRELLO_KEY e TRELLO_TOKEN no ambiente (gerar em
https://trello.com/app-key — escopo leitura basta):

    TRELLO_KEY=... TRELLO_TOKEN=... python preparar.py
"""
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

BOARD_ID = "jtJOhgiN"

ENV_LOCAL = Path(
    r"C:\Users\Wellington Viegas\Documents\ClaudeCode\soma-nfse\frontend\.env.local"
)
OUT_DIR = Path(__file__).parent
OUT_PLANO = OUT_DIR / "plano.json"
OUT_RELATORIO = OUT_DIR / "relatorio.txt"

# Nome da lista no Trello (com emoji, como está hoje no board) -> nome exato
# da etapa em comercial_etapas (seed da migration 20260925200000). Um card
# numa lista fora deste mapa vira "problema" em vez de adivinhar a etapa.
ALIAS_ETAPA = {
    "📥 Novo Lead / Reunião": "Novo Lead / Reunião",
    "📝 Briefing e Diagnóstico Inicial": "Briefing e Diagnóstico Inicial",
    "🔄 Transição Contábil (se já tem CNPJ)": "Transição Contábil (já tem CNPJ)",
    "🏛 Abertura / Legalização (se for novo CNPJ)": "Abertura / Legalização (CNPJ novo)",
    "📑 Formalização e Procurações": "Formalização e Procurações",
    "⚙ Implantação Sistema": "Implantação Sistema",
    "📊 Primeiro Fechamento": "Primeiro Fechamento",
    "✅ Cliente Ativo": "Cliente Ativo",
    "Stand By": "Stand By",
    "NÃO FECHADO / REVISITAR": "Não Fechado / Revisitar",
    "Dogma": "Dogma",
}

RE_HONORARIO = re.compile(
    r"honor[aá]rios?\s+soma\s*:?\s*r\$\s*([\d.,]+)", re.IGNORECASE
)


def sem_acento(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def normalizar(s) -> str:
    if s is None:
        return ""
    return sem_acento(str(s)).strip().lower()


def ler_env(chave: str) -> str:
    texto = ENV_LOCAL.read_text(encoding="utf-8")
    m = re.search(rf"^{re.escape(chave)}=(.*)$", texto, re.MULTILINE)
    if not m:
        raise RuntimeError(f"{chave} não encontrado em .env.local")
    return m.group(1).strip()


def rest_get(url_base: str, apikey: str, path: str):
    req = urllib.request.Request(
        f"{url_base}/rest/v1/{path}",
        headers={"apikey": apikey, "Authorization": f"Bearer {apikey}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def trello_get(path: str, key: str, token: str, **params):
    params = {**params, "key": key, "token": token}
    url = f"https://api.trello.com/1/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extrair_honorario(descricao: str | None) -> float | None:
    if not descricao:
        return None
    m = RE_HONORARIO.search(descricao)
    if not m:
        return None
    valor = m.group(1).replace(".", "").replace(",", ".")
    try:
        return round(float(valor), 2)
    except ValueError:
        return None


def montar_checklist(card: dict) -> list[dict]:
    itens = []
    for checklist in card.get("checklists", []):
        categoria = checklist.get("name", "").strip()
        for item in checklist.get("checkItems", []):
            itens.append({
                "categoria": categoria,
                "item": item.get("name", "").strip(),
                "concluido": item.get("state") == "complete",
            })
    return itens


def montar_anexos(card: dict) -> list[dict]:
    anexos = []
    for att in card.get("attachments", []):
        # Attachments do Trello incluem tanto arquivos quanto links soltos
        # colados na descrição — só nos interessam uploads de verdade.
        if not att.get("isUpload"):
            continue
        anexos.append({
            "nome": att.get("name") or att.get("fileName") or "anexo",
            "url": att.get("url"),
        })
    return anexos


def main():
    if sys.stdout.encoding != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")

    trello_key = os.environ.get("TRELLO_KEY")
    trello_token = os.environ.get("TRELLO_TOKEN")
    if not trello_key or not trello_token:
        print("Defina TRELLO_KEY e TRELLO_TOKEN no ambiente (trello.com/app-key).", file=sys.stderr)
        sys.exit(1)

    print("Lendo listas do board...", file=sys.stderr)
    listas = trello_get(f"boards/{BOARD_ID}/lists", trello_key, trello_token, fields="id,name")
    nome_lista_por_id = {l["id"]: l["name"] for l in listas}

    print("Lendo cards do board (com checklists e anexos)...", file=sys.stderr)
    cards = trello_get(
        f"boards/{BOARD_ID}/cards",
        trello_key,
        trello_token,
        filter="open",
        fields="name,desc,idList,shortUrl",
        attachments="true",
        checklists="all",
    )

    print("Consultando etapas cadastradas no soma-nfse...", file=sys.stderr)
    url_base = ler_env("NEXT_PUBLIC_SUPABASE_URL")
    service_key = ler_env("SUPABASE_SERVICE_ROLE_KEY")
    etapas_db = rest_get(url_base, service_key, "comercial_etapas?select=id,nome,ativo")
    etapas_por_nome = {normalizar(e["nome"]): e for e in etapas_db}

    ja_importados = rest_get(
        url_base, service_key,
        "comercial_prospect_atividade?select=metadata&tipo=eq.SISTEMA&metadata->>trello_card_id=not.is.null",
    )
    ids_ja_importados = {a["metadata"].get("trello_card_id") for a in ja_importados}

    prospects = []
    problemas = []
    for card in cards:
        nome_lista = nome_lista_por_id.get(card["idList"], "")
        etapa_db_nome = ALIAS_ETAPA.get(nome_lista)
        problema = None
        if card["id"] in ids_ja_importados:
            problema = "já importado antes (pulado)"
        elif not etapa_db_nome:
            problema = f'lista "{nome_lista}" sem etapa correspondente no banco (ver ALIAS_ETAPA)'
        elif normalizar(etapa_db_nome) not in etapas_por_nome:
            problema = f'etapa "{etapa_db_nome}" não existe no banco — rode a migration antes'
        elif not etapas_por_nome[normalizar(etapa_db_nome)]["ativo"]:
            problema = f'etapa "{etapa_db_nome}" está inativa no banco'

        prospect = {
            "trello_card_id": card["id"],
            "trello_url": card.get("shortUrl"),
            "nome": card["name"].strip(),
            "etapa_trello": nome_lista,
            "etapa_db": etapa_db_nome,
            "descricao": (card.get("desc") or "").strip() or None,
            "honorario_soma": extrair_honorario(card.get("desc")),
            "checklist": montar_checklist(card),
            "anexos": montar_anexos(card),
            "problema": problema,
        }
        if problema:
            problemas.append(prospect)
        else:
            prospects.append(prospect)

    plano = {"board_id": BOARD_ID, "prospects": prospects, "problemas": problemas}
    OUT_PLANO.write_text(json.dumps(plano, ensure_ascii=False, indent=1), encoding="utf-8")

    linhas = []
    linhas.append("=" * 78)
    linhas.append("PLANO DE IMPORTAÇÃO — Trello Comercial → soma-nfse")
    linhas.append("=" * 78)
    linhas.append(f"Cards prontos pra importar: {len(prospects)}")
    linhas.append(f"Cards com problema (não serão importados): {len(problemas)}")
    for p in problemas[:30]:
        linhas.append(f"  - {p['nome']!r}: {p['problema']}")
    if len(problemas) > 30:
        linhas.append(f"  ... e mais {len(problemas) - 30}")
    linhas.append("")
    total_checklist = sum(len(p["checklist"]) for p in prospects)
    total_anexos = sum(len(p["anexos"]) for p in prospects)
    linhas.append(f"Total de itens de checklist a copiar: {total_checklist}")
    linhas.append(f"Total de anexos a baixar/reenviar: {total_anexos}")
    linhas.append("")
    linhas.append("Por etapa:")
    contagem_etapa: dict[str, int] = {}
    for p in prospects:
        contagem_etapa[p["etapa_db"]] = contagem_etapa.get(p["etapa_db"], 0) + 1
    for etapa, qtd in sorted(contagem_etapa.items(), key=lambda kv: -kv[1]):
        linhas.append(f"  - {etapa}: {qtd}")
    linhas.append("")
    linhas.append(f"Plano completo salvo em: {OUT_PLANO}")

    relatorio = "\n".join(linhas)
    OUT_RELATORIO.write_text(relatorio, encoding="utf-8")
    print(relatorio)


if __name__ == "__main__":
    main()
