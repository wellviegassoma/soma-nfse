# -*- coding: utf-8 -*-
"""
Prepara a importação das exportações "Contas Recebidas" e "Contas Pagas" do
Nibo (planilha, não API) pro financeiro da SOMA no soma-nfse.

Fase 1 de 2: só LÊ os arquivos e o estado atual do banco (via REST, leitura),
monta o plano completo em JSON e um relatório legível. NÃO GRAVA NADA. A
gravação de verdade é um script separado, que só roda depois de eu conferir
este relatório.

Diferença importante em relação à migração via API do Nibo (fase F6): aquela
trazia só os AGENDAMENTOS em aberto e deliberadamente não trazia o histórico
de pagamento (sem saber a conta bancária de cada baixa, o saldo sairia
errado). Aqui é o oposto: são exportações "Contas RECEBIDAS"/"Contas PAGAS"
(particípio passado) — 100% já liquidadas — e têm a coluna Banco. Então cada
linha vira um agendamento JÁ COM lançamento (baixa) na conta certa, na data
de pagamento.
"""
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

import pandas as pd

DOWNLOADS = Path(r"C:\Users\Wellington Viegas\Downloads")
ARQ_RECEBIDAS = DOWNLOADS / "contas_recebidas (1).xlsx"
ARQ_PAGAS = DOWNLOADS / "contas_pagas (3).xlsx"
COMPANY_ID = "cdcbc068-d64a-450a-be15-fa501857153c"  # SOMA Contabilidade Integrada

ENV_LOCAL = Path(
    r"C:\Users\Wellington Viegas\Documents\ClaudeCode\soma-nfse\frontend\.env.local"
)
OUT_DIR = Path(__file__).parent
OUT_PLANO = OUT_DIR / "plano.json"
OUT_RELATORIO = OUT_DIR / "relatorio.txt"

COLS_REC = [
    "Id", "Vencimento", "Competencia", "PrevistoPara", "DataPagamento",
    "CpfCnpj", "Nome", "Descricao", "Referencia", "Categoria",
    "Detalhamento", "CentroCusto", "Valor", "Identificador", "Banco",
    "NumeroNFSe",
]
COLS_PAG = COLS_REC[:15]

# Categorias da planilha que são conceitualmente as categorias de SISTEMA que
# já existem na base (juros, multas, descontos) — não criar duplicata solta,
# apontar pro nome exato que o financeiro usa.
ALIAS_CATEGORIA_SISTEMA = {
    "juros recebidos": "Juros recebidos",
    "multas recebidas": "Multas recebidas",
    "descontos concedidos": "Descontos concedidos",
    "juros pagos": "Juros Pagos",
    "multas pagas": "Multas pagas",
    "descontos recebidos": "Descontos obtidos",
}

# Banco da planilha -> nome canônico da conta a criar/casar em
# extrato_contas_bancarias. "Cora " (com espaço à direita) é bug de export.
ALIAS_BANCO = {
    "cora": "Cora",
    "cora scd s.a. - conta corrente": "Cora SCD S.A. - Conta corrente",
    "itau": "Itaú",
    "btg": "BTG",
    "outros": "Outros (origem não identificada no Nibo)",
}


def sem_acento(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def normalizar(s) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
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


def carregar_planilha(caminho: Path, colunas: list[str], tipo: str) -> pd.DataFrame:
    df = pd.read_excel(caminho, sheet_name="Table1")
    df.columns = colunas
    df["Vencimento"] = pd.to_datetime(df["Vencimento"], format="%d/%m/%Y", errors="coerce")
    df["PrevistoPara"] = pd.to_datetime(df["PrevistoPara"], format="%d/%m/%Y", errors="coerce")
    df["DataPagamento"] = pd.to_datetime(df["DataPagamento"], format="%d/%m/%Y", errors="coerce")
    df["OrigemTipo"] = tipo  # "REC" ou "PAG", pra compor a chave de idempotência
    return df


def descricao_final(row) -> str | None:
    desc = row["Descricao"]
    if isinstance(desc, str) and normalizar(desc) not in ("", "sem descricao"):
        return desc.strip()
    det = row.get("Detalhamento")
    if isinstance(det, str) and det.strip():
        return det.strip()
    return None


def montar_agendamentos(df: pd.DataFrame, tipo_financeiro: str) -> list[dict]:
    """Agrupa por Id (rateio de categoria quando o Nibo divide a mesma
    transação em mais de uma linha) e devolve um agendamento por grupo."""
    agendamentos = []
    for (origem_id,), grupo in df.groupby(["Id"], sort=False):
        primeira = grupo.iloc[0]
        venc = primeira["Vencimento"]
        pago_em = primeira["DataPagamento"]
        prob = None
        if pd.isna(venc):
            prob = "sem data de vencimento válida"
        elif pd.isna(pago_em):
            prob = "sem data de pagamento válida"

        previsto = primeira["PrevistoPara"]
        previsto_iso = (
            previsto.date().isoformat()
            if pd.notna(previsto) and (pd.isna(venc) or previsto.date() != venc.date())
            else None
        )

        categorias = []
        total = 0.0
        for _, linha in grupo.iterrows():
            valor = abs(float(linha["Valor"]))
            if valor <= 0:
                continue
            cat_nome = str(linha["Categoria"]).strip() if pd.notna(linha["Categoria"]) else None
            if not cat_nome:
                continue
            categorias.append({"categoria_planilha": cat_nome, "valor": round(valor, 2)})
            total += valor
        if not categorias:
            prob = prob or "sem categoria/valor válido em nenhuma linha do grupo"

        banco_planilha_bruto = str(primeira["Banco"]).strip() if pd.notna(primeira["Banco"]) else None
        banco_planilha = (
            ALIAS_BANCO.get(normalizar(banco_planilha_bruto), banco_planilha_bruto)
            if banco_planilha_bruto
            else None
        )  # já canônico aqui — gravar.py não precisa reaplicar o alias
        cpf_cnpj = str(primeira["CpfCnpj"]).strip() if pd.notna(primeira["CpfCnpj"]) else None
        nome = str(primeira["Nome"]).strip() if pd.notna(primeira["Nome"]) else None
        if not nome:
            prob = prob or "sem nome de contato"

        agendamentos.append({
            "nibo_id": f"planilha:{tipo_financeiro}:{primeira['OrigemTipo']}:{origem_id}",
            "tipo": tipo_financeiro,
            "vencimento": venc.date().isoformat() if pd.notna(venc) else None,
            "previsto_para": previsto_iso,
            "data_pagamento": pago_em.date().isoformat() if pd.notna(pago_em) else None,
            "descricao": descricao_final(primeira),
            "referencia": (
                str(primeira["Referencia"]).strip()
                if pd.notna(primeira.get("Referencia"))
                else None
            ),
            "contato_nome": nome,
            "contato_cpf_cnpj": cpf_cnpj,
            "banco_planilha": banco_planilha,
            "valor_bruto": round(total, 2),
            "categorias": categorias,
            "problema": prob,
        })
    return agendamentos


def resolver_categoria(nome_planilha: str, categorias_existentes: dict[str, dict]) -> tuple[str, bool]:
    """Devolve (nome_canonico_a_usar, ja_existe). Casa primeiro contra os
    alias de categoria de sistema, depois contra as já cadastradas por nome
    normalizado, senão a categoria é nova (usa o próprio nome da planilha)."""
    norm = normalizar(nome_planilha)
    if norm in ALIAS_CATEGORIA_SISTEMA:
        alvo = ALIAS_CATEGORIA_SISTEMA[norm]
        return alvo, normalizar(alvo) in categorias_existentes
    if norm in categorias_existentes:
        return categorias_existentes[norm]["nome"], True
    return nome_planilha.strip(), False


def mapear_grupo_por_natureza(natureza_planilha: str, nome_categoria: str) -> str:
    """Heurística igual à da migração via API (lib/nibo/mapeamento.ts):
    palavra-chave no nome, com fallback pro grupo operacional."""
    n = normalizar(nome_categoria)
    if "investiment" in n or "ativo imobilizado" in n or "consorcio" in n:
        return "INVESTIMENTO"
    if "financiamento" in n or "distribuicao de lucro" in n or "emprestimo" in n:
        return "FINANCIAMENTO"
    return "RECEITA_OPERACIONAL" if natureza_planilha == "ENTRADA" else "CUSTO_DESPESA_OPERACIONAL"


def main():
    print("Lendo planilhas...", file=sys.stderr)
    rec = carregar_planilha(ARQ_RECEBIDAS, COLS_REC, "REC")
    pag = carregar_planilha(ARQ_PAGAS, COLS_PAG, "PAG")

    print("Consultando estado atual do financeiro da SOMA...", file=sys.stderr)
    url_base = ler_env("NEXT_PUBLIC_SUPABASE_URL")
    service_key = ler_env("SUPABASE_SERVICE_ROLE_KEY")

    categorias_db = rest_get(
        url_base, service_key,
        f"fin_categorias?select=id,nome,grupo,natureza,sistema&company_id=eq.{COMPANY_ID}",
    )
    categorias_existentes = {normalizar(c["nome"]): c for c in categorias_db}

    contas_db = rest_get(
        url_base, service_key,
        f"extrato_contas_bancarias?select=id,banco&company_id=eq.{COMPANY_ID}",
    )
    contas_existentes = {normalizar(c["banco"]): c for c in contas_db}

    contatos_db = rest_get(
        url_base, service_key,
        f"fin_contatos?select=id,nome&company_id=eq.{COMPANY_ID}",
    )
    contatos_existentes = {normalizar(c["nome"]): c for c in contatos_db}

    print("Montando agendamentos (agrupando rateio por Id)...", file=sys.stderr)
    ags_receber = montar_agendamentos(rec, "RECEBER")
    ags_pagar = montar_agendamentos(pag, "PAGAR")
    todos = ags_receber + ags_pagar

    validos = [a for a in todos if not a["problema"]]
    invalidos = [a for a in todos if a["problema"]]

    # --- Bancos ---------------------------------------------------------
    bancos_planilha = {}
    for a in validos:
        # banco_planilha já saiu canônico de montar_agendamentos (ALIAS_BANCO
        # aplicado ali); aqui só valida presença e coleciona o conjunto.
        if not a["banco_planilha"]:
            a["problema"] = "sem banco informado"
            continue
        bancos_planilha.setdefault(normalizar(a["banco_planilha"]), a["banco_planilha"])
    validos = [a for a in validos if not a.get("problema")]
    invalidos = [a for a in todos if a.get("problema")]

    bancos_novos = {
        k: v for k, v in bancos_planilha.items() if k not in contas_existentes
    }
    bancos_ja_existem = {
        k: v for k, v in bancos_planilha.items() if k in contas_existentes
    }

    # --- Contatos ---------------------------------------------------------
    contatos_planilha = {}  # nome_normalizado -> {"nome":..., "cpf_cnpj":...}
    for a in validos:
        chave = normalizar(a["contato_nome"])
        if chave not in contatos_planilha:
            contatos_planilha[chave] = {
                "nome": a["contato_nome"],
                "cpf_cnpj": a["contato_cpf_cnpj"],
            }
        elif not contatos_planilha[chave]["cpf_cnpj"] and a["contato_cpf_cnpj"]:
            contatos_planilha[chave]["cpf_cnpj"] = a["contato_cpf_cnpj"]

    contatos_novos = {
        k: v for k, v in contatos_planilha.items() if k not in contatos_existentes
    }

    # --- Categorias ---------------------------------------------------------
    # No Nibo, categoria é um rótulo livre e o sinal vem do valor da própria
    # linha; no soma-nfse toda fin_categoria tem natureza FIXA. Duas
    # categorias da planilha aparecem nos dois arquivos ("Clinica Medica",
    # "Estorno") — a natureza registrada aqui é só metadado (o Painel calcula
    # o sinal pelo TIPO do agendamento, não pela natureza da categoria, ver
    # financeiro-relatorios.ts), mas escolho pelo lado de MAIOR valor total
    # movimentado, e não pela primeira ocorrência que aparecer, pra não ficar
    # arbitrário. Primeiro soma tudo por (categoria canônica, natureza), só
    # depois decide qual natureza vence pra cada categoria nova.
    soma_por_natureza: dict[tuple[str, str], float] = {}
    canonico_de: dict[str, tuple[str, bool]] = {}
    for a in validos:
        tipo_natureza = "ENTRADA" if a["tipo"] == "RECEBER" else "SAIDA"
        for c in a["categorias"]:
            canonico, ja_existe = resolver_categoria(c["categoria_planilha"], categorias_existentes)
            chave = normalizar(canonico)
            c["categoria_canonica"] = canonico
            canonico_de[chave] = (canonico, ja_existe)
            soma_por_natureza[(chave, tipo_natureza)] = (
                soma_por_natureza.get((chave, tipo_natureza), 0.0) + c["valor"]
            )

    categorias_por_nome_canonico: dict[str, dict] = {}
    for chave, (canonico, ja_existe) in canonico_de.items():
        entrada = soma_por_natureza.get((chave, "ENTRADA"), 0.0)
        saida = soma_por_natureza.get((chave, "SAIDA"), 0.0)
        tipo_natureza = "ENTRADA" if entrada >= saida else "SAIDA"
        categorias_por_nome_canonico[chave] = {
            "nome": canonico,
            "ja_existe": ja_existe,
            "natureza_planilha": tipo_natureza,
            "grupo_sugerido": (
                categorias_existentes[chave]["grupo"]
                if ja_existe
                else mapear_grupo_por_natureza(tipo_natureza, canonico)
            ),
        }
        if entrada > 0 and saida > 0:
            categorias_por_nome_canonico[chave]["aviso_ambiguidade"] = (
                f"usada em ambos os sentidos na planilha (entrada R$ {entrada:,.2f}, "
                f"saída R$ {saida:,.2f}) — natureza aqui é só indicativa"
            )

    categorias_novas = {
        k: v for k, v in categorias_por_nome_canonico.items() if not v["ja_existe"]
    }

    # --- Totais ---------------------------------------------------------
    total_receber = sum(a["valor_bruto"] for a in validos if a["tipo"] == "RECEBER")
    total_pagar = sum(a["valor_bruto"] for a in validos if a["tipo"] == "PAGAR")

    plano = {
        "company_id": COMPANY_ID,
        "agendamentos": validos,
        "invalidos": invalidos,
        "bancos_novos": bancos_novos,
        "bancos_ja_existem": bancos_ja_existem,
        "contatos_novos": contatos_novos,
        "categorias_novas": categorias_novas,
        "categorias_casadas": {
            k: v for k, v in categorias_por_nome_canonico.items() if v["ja_existe"]
        },
    }
    OUT_PLANO.write_text(json.dumps(plano, ensure_ascii=False, indent=1), encoding="utf-8")

    linhas = []
    linhas.append("=" * 78)
    linhas.append("PLANO DE IMPORTAÇÃO — Contas Recebidas/Pagas do Nibo (planilha) → SOMA")
    linhas.append("=" * 78)
    linhas.append(f"Agendamentos válidos: {len(validos)}  (RECEBER: {len(ags_receber)-sum(1 for a in invalidos if a['tipo']=='RECEBER')}, PAGAR: {len(ags_pagar)-sum(1 for a in invalidos if a['tipo']=='PAGAR')})")
    linhas.append(f"Total a receber: R$ {total_receber:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    linhas.append(f"Total a pagar:   R$ {total_pagar:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    linhas.append(f"Saldo líquido do período: R$ {(total_receber - total_pagar):,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    linhas.append("")
    linhas.append(f"Linhas IGNORADAS (com problema): {len(invalidos)}")
    for a in invalidos[:30]:
        linhas.append(f"  - {a['nibo_id']}: {a['problema']} (venc={a['vencimento']}, contato={a['contato_nome']})")
    if len(invalidos) > 30:
        linhas.append(f"  ... e mais {len(invalidos)-30}")
    linhas.append("")
    linhas.append(f"Contas bancárias JÁ CADASTRADAS que serão usadas ({len(bancos_ja_existem)}):")
    for v in bancos_ja_existem.values():
        linhas.append(f"  - {v}")
    linhas.append(f"Contas bancárias NOVAS a criar ({len(bancos_novos)}):")
    for v in bancos_novos.values():
        linhas.append(f"  - {v}")
    linhas.append("")
    linhas.append(f"Contatos já cadastrados: {len(contatos_existentes)}")
    linhas.append(f"Contatos NOVOS a criar: {len(contatos_novos)}")
    linhas.append("")
    linhas.append(f"Categorias já cadastradas usadas: {len(plano['categorias_casadas'])}")
    for v in sorted(plano["categorias_casadas"].values(), key=lambda x: x["nome"]):
        linhas.append(f"  - {v['nome']}  [{v['grupo_sugerido']}]")
    linhas.append(f"Categorias NOVAS a criar ({len(categorias_novas)}):")
    for v in sorted(categorias_novas.values(), key=lambda x: x["nome"]):
        extra = f"  [!] {v['aviso_ambiguidade']}" if v.get("aviso_ambiguidade") else ""
        linhas.append(f"  - {v['nome']}  [{v['grupo_sugerido']}, natureza planilha={v['natureza_planilha']}]{extra}")
    linhas.append("")
    linhas.append(f"Plano completo salvo em: {OUT_PLANO}")

    relatorio = "\n".join(linhas)
    OUT_RELATORIO.write_text(relatorio, encoding="utf-8")
    print(relatorio)


if __name__ == "__main__":
    main()
