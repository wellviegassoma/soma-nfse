# -*- coding: utf-8 -*-
"""
Monta plano.json a partir dos dados extraídos manualmente do eLegalize
(elegalize_raw.json, montado via JS direto no DOM da tabela — o eLegalize não
tem API acessível, ver plano de implementação) + a lista atual de empresas do
soma-nfse (companies.json).

    python preparar.py

Classifica cada negócio por tipo de processo pela contagem de fases (10 =
Encerramento, 12 = Abertura, 18 = Alteração) e descarta fluxos fora do
escopo pedido (6 fases = "Cadastros Sistemas", não replicado).

Abertura não precisa de empresa (nasce sem company_id). Alteração e
Encerramento precisam de uma empresa já cadastrada — como o eLegalize não
guarda o id da empresa do soma-nfse, faz um fuzzy-match pelo nome contra
companies.json e marca tudo abaixo do limiar de confiança como
"REVISAR_MANUALMENTE" no relatório, para o dono confirmar antes do --commit
(mesma disciplina do import do Comercial/Trello).
"""
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

SCRATCH = Path(
    r"C:\Users\WELLIN~1\AppData\Local\Temp\claude\C--Users-Wellington-Viegas-Documents-ClaudeCode"
    r"\6900f7ba-9d7c-4998-9c35-aa0cc289aa8e\scratchpad"
)
RAW = SCRATCH / "elegalize_raw.json"
COMPANIES = SCRATCH / "companies.json"
OUT_DIR = Path(__file__).parent
PLANO = OUT_DIR / "plano.json"
RELATORIO = OUT_DIR / "relatorio.txt"

FLUXO_POR_FASES = {10: "ENCERRAMENTO_EMPRESA", 12: "ABERTURA_EMPRESA", 18: "ALTERACAO_CONTRATUAL"}
TIPO_POR_FASES = {10: "ENCERRAMENTO", 12: "ABERTURA", 18: "ALTERACAO"}
LIMIAR_CONFIANCA = 0.55

# Confirmado manualmente com o dono (ver conversa) — sobrescreve o fuzzy-match
# pra esses negócios específicos, chave = realId do eLegalize.
CONFIRMADO_MANUALMENTE = {
    "120": "ed430c7f-f14d-4fac-9d1d-11232c6e3d6a",  # RRAD
    "118": "a18391e9-7c6c-4b16-854c-b566e78884ee",  # COMAF
    "116": "04c1456e-0bc3-462d-9979-15efee8b3639",  # LIGA
    "115": "b8173af1-2510-4640-8cf3-87e28234725a",  # TechBone
    "114": "de5be0e9-511a-400f-a9b7-96c331b724eb",  # Instituto Dela
    "113": "19343490-9fd7-486b-ad3a-0599eecf197b",  # Odonto Medical
    # Empresas novas (ainda sem CNPJ, em legalização) — cadastradas agora sem
    # CNPJ pra já poder controlar o processo de Alteração; CNPJ entra depois.
    "332": "20a77db3-e5d6-4978-91bb-180cc1210062",  # AMCF Participações
    "331": "3631682e-4e70-4f59-9a7c-bd209ace395b",  # BFM Treinamentos LTDA
    "233": "2129ce06-0ceb-4a93-9b80-a7265682a8c7",  # Sensualità Moda Íntima Unissex
}
EMPRESA_AINDA_NAO_EXISTE: set[str] = set()

# Palavras genéricas demais pra decidir uma correspondência sozinhas — "BFM
# Participações" e "AMCF Participações" batem alto no SequenceMatcher só por
# causa de "Participações", mas são empresas completamente diferentes. Exige
# que pelo menos uma palavra DISTINTIVA (fora dessa lista) apareça nos dois
# lados antes de aceitar qualquer match, não importa o score bruto.
PALAVRAS_GENERICAS = {
    "ltda", "eireli", "me", "epp", "sa", "s", "a", "de", "da", "do", "das", "dos",
    "e", "para", "com", "servicos", "servico", "medicos", "medico", "medicina",
    "clinica", "clinicas", "instituto", "participacoes", "participacao",
    "treinamentos", "treinamento", "consultoria", "solucoes", "solucao",
    "saude", "integrada", "especializada", "ensino", "pesquisa", "alteracao",
    "alteracoes", "qsa", "quadro", "societario", "endereco", "atividade",
    "atividades", "socios", "socias", "cirurgia",
}


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode("ascii")
    texto = re.sub(r"^\d+\s*-\s*", "", texto)  # tira prefixo "134 - "
    texto = re.sub(r"[^a-z0-9 ]", " ", texto.lower())
    return re.sub(r"\s+", " ", texto).strip()


def palavras_distintivas(texto_normalizado: str) -> set[str]:
    return {p for p in texto_normalizado.split() if p not in PALAVRAS_GENERICAS and len(p) > 2}


def data_iso(data_br: str) -> str | None:
    if not data_br or data_br == "---":
        return None
    d, m, a = data_br.split("/")
    return f"{a}-{m}-{d}"


def melhor_empresa(nome_negocio: str, companies: list[dict]) -> tuple[dict | None, float]:
    alvo = normalizar(nome_negocio)
    alvo_distintivo = palavras_distintivas(alvo)
    melhor, melhor_score = None, 0.0
    for c in companies:
        for candidato in (c.get("legal_name"), c.get("trade_name")):
            if not candidato:
                continue
            candidato_norm = normalizar(candidato)
            score = SequenceMatcher(None, alvo, candidato_norm).ratio()
            # Sem nenhuma palavra distintiva em comum, o match não é confiável
            # mesmo com score bruto alto (nomes genéricos coincidem à toa).
            if alvo_distintivo and not (alvo_distintivo & palavras_distintivas(candidato_norm)):
                score *= 0.5
            if score > melhor_score:
                melhor, melhor_score = c, score
    return melhor, melhor_score


def main():
    if not RAW.exists():
        raise SystemExit(f"{RAW} não existe — rode a extração via browser primeiro.")
    negocios = json.loads(RAW.read_text(encoding="utf-8"))
    companies = json.loads(COMPANIES.read_text(encoding="utf-8"))

    processos = []
    excluidos = []
    relatorio_linhas = []

    for n in negocios:
        n_fases = len(n["fases"])
        tipo = TIPO_POR_FASES.get(n_fases)
        if tipo is None:
            excluidos.append(n)
            continue

        fases = []
        for f in n["fases"]:
            status_raw = f["status"]
            data_concl = data_iso(f["dataConclusao"])
            status_manual = None
            if status_raw in ("Paralisada", "Paralisado"):
                status_manual = "PARALISADO"
            elif status_raw == "Aguardando dados":
                status_manual = "AGUARDANDO_DADOS"
            elif status_raw == "A conferir":
                status_manual = "A_CONFERIR"
            fases.append({
                "nome": f["nome"],
                "data_conclusao": data_concl,
                "status_manual": None if data_concl else status_manual,
            })

        empresa_match, score = (None, 0.0)
        precisa_empresa = tipo != "ABERTURA"
        empresa_nao_existe = n["realId"] in EMPRESA_AINDA_NAO_EXISTE
        company_id_confirmado = CONFIRMADO_MANUALMENTE.get(n["realId"])

        if precisa_empresa and not empresa_nao_existe and not company_id_confirmado:
            empresa_match, score = melhor_empresa(n["nome"], companies)

        if empresa_nao_existe:
            revisar = True
            company_id_final = None
        elif company_id_confirmado:
            revisar = False
            company_id_final = company_id_confirmado
        else:
            revisar = precisa_empresa and score < LIMIAR_CONFIANCA
            company_id_final = None if revisar else (empresa_match["id"] if empresa_match else None)

        processo = {
            "origem_externa_id": n["realId"],
            "tipo_processo": tipo,
            "fluxo_chave": FLUXO_POR_FASES[n_fases],
            "nome_eLegalize": n["nome"],
            "data_inicio": data_iso(n["dataInicial"]),
            "prazo_final": data_iso(n["prazoFinal"]),
            "company_id": company_id_final,
            "company_match_nome": empresa_match["legal_name"] if empresa_match else None,
            "company_match_score": round(score, 3),
            "revisar_manualmente": revisar,
            "empresa_ainda_nao_existe": empresa_nao_existe,
            "fases": fases,
        }
        processos.append(processo)

        if empresa_nao_existe:
            tag, empresa_info = "SEM EMPRESA AINDA", " -> empresa nova, em legalização (confirmado)"
        elif company_id_confirmado:
            tag, empresa_info = "confirmado", " -> confirmado manualmente"
        elif not precisa_empresa:
            tag, empresa_info = "OK", ""
        elif revisar:
            tag = "⚠ REVISAR"
            empresa_info = f" -> {empresa_match['legal_name']} ({score:.2f})" if empresa_match else " -> (sem candidato)"
        else:
            tag = "ok"
            empresa_info = f" -> {empresa_match['legal_name']} ({score:.2f})" if empresa_match else ""
        relatorio_linhas.append(f"[{tag}] #{n['realId']} {tipo:12s} {n['nome']}" + empresa_info)

    for n in excluidos:
        relatorio_linhas.append(f"[EXCLUIDO] #{n['realId']} {len(n['fases'])} fases (fluxo fora de escopo) — {n['nome']}")

    resumo = {
        "total_lidos": len(negocios),
        "importaveis": len(processos),
        "excluidos": len(excluidos),
        "abertura": sum(1 for p in processos if p["tipo_processo"] == "ABERTURA"),
        "alteracao": sum(1 for p in processos if p["tipo_processo"] == "ALTERACAO"),
        "encerramento": sum(1 for p in processos if p["tipo_processo"] == "ENCERRAMENTO"),
        "precisam_revisao_manual": sum(1 for p in processos if p["revisar_manualmente"]),
    }

    PLANO.write_text(json.dumps({"resumo": resumo, "processos": processos}, ensure_ascii=False, indent=2), encoding="utf-8")

    cabecalho = (
        f"Total lido no eLegalize: {resumo['total_lidos']}\n"
        f"Importáveis: {resumo['importaveis']} "
        f"(Abertura {resumo['abertura']} / Alteração {resumo['alteracao']} / Encerramento {resumo['encerramento']})\n"
        f"Excluídos (fluxo fora de escopo): {resumo['excluidos']}\n"
        f"Precisam revisão manual (empresa não encontrada com confiança): {resumo['precisam_revisao_manual']}\n"
        + "=" * 80 + "\n"
    )
    RELATORIO.write_text(cabecalho + "\n".join(relatorio_linhas) + "\n", encoding="utf-8")

    print(cabecalho)
    print(f"plano.json -> {PLANO}")
    print(f"relatorio.txt -> {RELATORIO}")


if __name__ == "__main__":
    main()
