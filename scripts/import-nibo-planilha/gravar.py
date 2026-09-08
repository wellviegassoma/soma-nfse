# -*- coding: utf-8 -*-
"""
Fase 2 de 2: grava em produção o plano montado por preparar.py (plano.json).

Uso:
  python gravar.py --dry     # monta tudo e mostra as contagens finais, sem
                              # gravar nada — os ids de entidade nova ainda
                              # não existem, então usa um id FAKE só pra
                              # provar que a resolução (contato/categoria/
                              # conta) fecha 100% antes de tocar o banco
  python gravar.py --commit  # grava de verdade, na ordem que respeita as FKs

Idempotente: cada agendamento carrega nibo_id = "planilha:<TIPO>:<origem>:<Id>"
(único por empresa, ver índice em fin_agendamentos_nibo_id_idx). Reexecutar
pula o que já foi gravado — seguro se o processo cair no meio dos 22 mil
inserts que isso gera no total.
"""
import json
import re
import sys
import unicodedata
import urllib.request
import urllib.error
from pathlib import Path

ENV_LOCAL = Path(
    r"C:\Users\Wellington Viegas\Documents\ClaudeCode\soma-nfse\frontend\.env.local"
)
PLANO = Path(__file__).parent / "plano.json"
LOTE = 500


def ler_env(chave: str) -> str:
    texto = ENV_LOCAL.read_text(encoding="utf-8")
    m = re.search(rf"^{re.escape(chave)}=(.*)$", texto, re.MULTILINE)
    if not m:
        raise RuntimeError(f"{chave} não encontrado em .env.local")
    return m.group(1).strip()


URL_BASE = ler_env("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = ler_env("SUPABASE_SERVICE_ROLE_KEY")


def rest(method: str, path: str, body=None, prefer: str | None = None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{URL_BASE}/rest/v1/{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req) as resp:
            corpo = resp.read().decode("utf-8")
            return json.loads(corpo) if corpo else None
    except urllib.error.HTTPError as e:
        corpo_erro = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {corpo_erro}") from None


def lotes(seq, tamanho):
    for i in range(0, len(seq), tamanho):
        yield seq[i : i + tamanho]


def inserir_em_lotes(path: str, linhas: list[dict], prefer: str, rotulo: str) -> list[dict]:
    total = 0
    resultado = []
    for lote in lotes(linhas, LOTE):
        r = rest("POST", path, lote, prefer=prefer)
        total += len(lote)
        if r:
            resultado.extend(r)
        print(f"  {rotulo}: {total}/{len(linhas)}", file=sys.stderr)
    return resultado


def norm(s: str) -> str:
    # Mesma normalização de preparar.py (remove acento também) — as duas
    # precisam bater byte a byte, senão um nome acentuado que virou chave de
    # "contatos_novos" lá não é encontrado aqui na hora de resolver o id.
    if not s:
        return ""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )
    return sem_acento.strip().lower()


def main():
    commit = (sys.argv[1] if len(sys.argv) > 1 else "--dry") == "--commit"
    print(f"Modo: {'GRAVANDO DE VERDADE' if commit else 'dry (nada será gravado)'}", file=sys.stderr)

    plano = json.loads(PLANO.read_text(encoding="utf-8"))
    company_id = plano["company_id"]
    agendamentos = plano["agendamentos"]

    # =====================================================================
    # 1) Contas bancárias, categorias, contatos — cria o que falta (commit)
    #    e monta o mapa nome_normalizado -> id pras três entidades. Em modo
    #    dry, entidade nova ganha um id FAKE:<nome> só pra provar que a
    #    resolução das próximas fases fecha; não é usado pra gravar nada.
    # =====================================================================
    def montar_mapa(entidades_novas: dict, tabela: str, linhas_para_criar: list[dict], campo_nome: str):
        mapa = {}
        if commit and linhas_para_criar:
            inserir_em_lotes(tabela, linhas_para_criar, "return=minimal", tabela)
        todas = rest("GET", f"{tabela}?select=id,{campo_nome}&company_id=eq.{company_id}&limit=10000")
        for row in todas or []:
            mapa[norm(row[campo_nome])] = row["id"]
        if not commit:
            for chave_norm, dados in entidades_novas.items():
                nome = dados["nome"] if isinstance(dados, dict) else dados
                mapa.setdefault(norm(nome), f"FAKE:{nome}")
        return mapa

    print(f"\n[1/4] Contas bancárias novas: {len(plano['bancos_novos'])}", file=sys.stderr)
    contas_a_criar = [
        {
            "company_id": company_id,
            "banco": nome,
            "agencia": "-",
            "conta": "-",
            "tipo": "CORRENTE",
            "saldo_inicial": 0,
            "ativo": True,
        }
        for nome in plano["bancos_novos"].values()
    ]
    conta_id_por_nome = montar_mapa(
        {k: {"nome": v} for k, v in plano["bancos_novos"].items()},
        "extrato_contas_bancarias", contas_a_criar, "banco",
    )

    print(f"[1/4] Categorias novas: {len(plano['categorias_novas'])}", file=sys.stderr)
    categorias_a_criar = [
        {
            "company_id": company_id,
            "grupo": v["grupo_sugerido"],
            "nome": v["nome"],
            "natureza": v["natureza_planilha"],
            "sistema": False,
            "ordem": 9000,
        }
        for v in plano["categorias_novas"].values()
    ]
    categoria_id_por_nome = montar_mapa(
        plano["categorias_novas"], "fin_categorias", categorias_a_criar, "nome",
    )

    def tipo_contato_provavel(tipos_usados: set[str]) -> str:
        # Só aparece em RECEBER -> cliente. Aparece em PAGAR (só ou junto
        # com RECEBER) -> fornecedor. É um chute inicial editável na tela.
        return "CLIENTE" if tipos_usados == {"RECEBER"} else "FORNECEDOR"

    tipos_por_contato: dict[str, set[str]] = {}
    for a in agendamentos:
        tipos_por_contato.setdefault(norm(a["contato_nome"]), set()).add(a["tipo"])

    contatos_a_criar = [
        {
            "company_id": company_id,
            "tipo": tipo_contato_provavel(tipos_por_contato.get(k, set())),
            "nome": v["nome"],
            "cpf_cnpj": re.sub(r"[.\-/]", "", v["cpf_cnpj"]) if v["cpf_cnpj"] else None,
        }
        for k, v in plano["contatos_novos"].items()
    ]
    print(f"[1/4] Contatos novos: {len(contatos_a_criar)}", file=sys.stderr)
    contato_id_por_nome = montar_mapa(
        plano["contatos_novos"], "fin_contatos", contatos_a_criar, "nome",
    )

    # =====================================================================
    # 2) Agendamentos
    # =====================================================================
    linhas_agendamento = []
    ignorados_sem_contato = 0
    for a in agendamentos:
        contato_id = contato_id_por_nome.get(norm(a["contato_nome"]))
        if not contato_id:
            ignorados_sem_contato += 1
            continue
        linhas_agendamento.append({
            "company_id": company_id,
            "tipo": a["tipo"],
            "contato_id": None if str(contato_id).startswith("FAKE:") else contato_id,
            "vencimento": a["vencimento"],
            "previsto_para": a["previsto_para"],
            "descricao": a["descricao"],
            "referencia": a["referencia"],
            "valor_bruto": a["valor_bruto"],
            "nibo_id": a["nibo_id"],
        })
    print(f"\n[2/4] Agendamentos a inserir: {len(linhas_agendamento)} (sem contato resolvido: {ignorados_sem_contato})", file=sys.stderr)
    if linhas_agendamento:
        print("   amostra:", json.dumps(linhas_agendamento[0], ensure_ascii=False), file=sys.stderr)

    if commit and linhas_agendamento:
        inserir_em_lotes("fin_agendamentos", linhas_agendamento, "return=minimal", "agendamentos")

    agendamento_id_por_nibo_id: dict[str, str] = {}
    if commit:
        todos_nibo_ids = [a["nibo_id"] for a in agendamentos]
        for lote in lotes(todos_nibo_ids, 200):
            filtro = ",".join(lote)
            r = rest(
                "GET",
                f"fin_agendamentos?select=id,nibo_id&company_id=eq.{company_id}&nibo_id=in.({filtro})",
            )
            for row in r or []:
                agendamento_id_por_nibo_id[row["nibo_id"]] = row["id"]
        print(f"   ids de agendamento recuperados: {len(agendamento_id_por_nibo_id)}", file=sys.stderr)
    else:
        agendamento_id_por_nibo_id = {a["nibo_id"]: f"FAKE:{a['nibo_id']}" for a in agendamentos}

    # =====================================================================
    # 3) Rateio de categoria
    # =====================================================================
    linhas_rateio = []
    sem_categoria = 0
    sem_agendamento = 0
    for a in agendamentos:
        ag_id = agendamento_id_por_nibo_id.get(a["nibo_id"])
        if not ag_id:
            sem_agendamento += len(a["categorias"])
            continue
        for c in a["categorias"]:
            cat_id = categoria_id_por_nome.get(norm(c["categoria_canonica"]))
            if not cat_id:
                sem_categoria += 1
                continue
            linhas_rateio.append({
                "agendamento_id": ag_id,
                "categoria_id": cat_id,
                "valor": c["valor"],
            })
    print(f"\n[3/4] Rateio de categoria a inserir: {len(linhas_rateio)} (sem categoria: {sem_categoria}, sem agendamento: {sem_agendamento})", file=sys.stderr)
    if commit and linhas_rateio:
        real = [
            {**r, "agendamento_id": r["agendamento_id"]}
            for r in linhas_rateio
            if not str(r["agendamento_id"]).startswith("FAKE:")
        ]
        inserir_em_lotes("fin_agendamento_categorias", real, "return=minimal", "rateio")

    # =====================================================================
    # 4) Lançamentos (a baixa, com sinal, na conta e data reais)
    # =====================================================================
    linhas_lancamento = []
    sem_conta = 0
    for a in agendamentos:
        ag_id = agendamento_id_por_nibo_id.get(a["nibo_id"])
        if not ag_id:
            continue
        conta_id = conta_id_por_nome.get(norm(a["banco_planilha"]))
        if not conta_id:
            sem_conta += 1
            continue
        sinal = 1 if a["tipo"] == "RECEBER" else -1
        linhas_lancamento.append({
            "company_id": company_id,
            "agendamento_id": ag_id,
            "conta_id": conta_id,
            "data": a["data_pagamento"],
            "valor": round(sinal * a["valor_bruto"], 2),
        })
    print(f"\n[4/4] Lançamentos a inserir: {len(linhas_lancamento)} (sem conta resolvida: {sem_conta})", file=sys.stderr)
    if commit and linhas_lancamento:
        real = [l for l in linhas_lancamento if not str(l["agendamento_id"]).startswith("FAKE:")]
        inserir_em_lotes("fin_lancamentos", real, "return=minimal", "lançamentos")

    print("\n" + ("Concluído." if commit else "Dry-run concluído — nada foi gravado."), file=sys.stderr)
    print(json.dumps({
        "agendamentos": len(linhas_agendamento),
        "rateio": len(linhas_rateio),
        "lancamentos": len(linhas_lancamento),
        "contas_novas": len(contas_a_criar),
        "categorias_novas": len(categorias_a_criar),
        "contatos_novos": len(contatos_a_criar),
        "sem_contato": ignorados_sem_contato,
        "sem_categoria": sem_categoria,
        "sem_conta": sem_conta,
    }, indent=1))


if __name__ == "__main__":
    main()
