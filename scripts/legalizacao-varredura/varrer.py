"""Varredura das pastas de clientes em busca de documentos de legalização.

Percorre "SOMA - Documentos/<código> - <nome>" (OneDrive), identifica pelo
nome do arquivo (e da pasta) alvarás, licenças sanitárias, conselho de
classe, CNES, bombeiros, COMDEP, MTR, ISS autônomo e certidões, tenta ler a
validade no nome do arquivo e no texto do PDF, e cruza com o que está
cadastrado no SOMA Gestão. Só lê — não grava nada no banco.

Saída: planilha Excel com a relação por arquivo e o resumo por cliente.

    python -I scripts/legalizacao-varredura/varrer.py [pasta_documentos] [saida.xlsx]
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import unicodedata
import urllib.request

RAIZ_REPO = pathlib.Path(__file__).resolve().parents[2]
PASTA_PADRAO = pathlib.Path.home() / "SOMA Contabilidade Integrada" / "SOMA - Documentos"
SAIDA_PADRAO = pathlib.Path(__file__).resolve().parent / "relacao-documentos-legalizacao.xlsx"
EXTENSOES = {".pdf", ".jpg", ".jpeg", ".png"}
HOJE = dt.date.today()

# Tipo identificado -> nome do tipo no SOMA Gestão (None = não comparar).
TIPOS_SISTEMA = {
    "Alvará de Funcionamento": ["Alvará de Funcionamento"],
    "Vigilância Sanitária": ["Vigilância Sanitária"],
    "CNES": ["CNES"],
    "Conselho de Classe": [
        "Conselho de Classe – Certificado de Regularidade",
        "Conselho de Classe – Responsável Técnico",
        "Conselho de Classe – Anuidade",
    ],
    "Corpo de Bombeiros": ["Certificado de Aprovação do Corpo de Bombeiro da Empresa"],
    "COMDEP / Coleta de resíduos": ["Declaração de Coleta - COMDEP"],
    "MTR – INEA": ["MTR – INEA"],
    "ISS Autônomo": ["ISS Autônomo"],
    "Certidão RFB": ["Certidão RFB"],
}

PREFIXO_TIPO = {"6": "Alvará de Funcionamento", "7": "Vigilância Sanitária", "8": "Conselho de Classe", "9": "CNES"}

REGRAS = [  # (regex no texto normalizado, tipo) — a primeira que casar vale
    (r"cbmrj|bombeir", "Corpo de Bombeiros"),
    (r"comdep|pgrss|declaracao de coleta|coleta de residuo", "COMDEP / Coleta de resíduos"),
    (r"\bmtr\b|\binea\b", "MTR – INEA"),
    (r"\bcnes\b", "CNES"),
    (r"alvara|alavara", "Alvará de Funcionamento"),
    (r"vigilan|sanitari|\bvisa\b|licenca sanit", "Vigilância Sanitária"),
    (r"cremerj|\bcrm\b|\bcro\b|crmv|crefito|coren|\bcrtr\b|\bcore\b|\bcrc\b|\bcrp\b|\bcrn\b|conselho|\bcart\b|\bepao\b|anuidade", "Conselho de Classe"),
    (r"iss autonomo|iss fixo|autonomo", "ISS Autônomo"),
    (r"certid.*(rfb|receita|federal|pgfn|uniao)|(rfb|pgfn).*certid", "Certidão RFB"),
]

CATEGORIAS = [
    (r"\bguia\b|boleto|\bdam\b|\bdarm\b|\btaxa\b|pagamento|\bpagto\b|\bpag\b|comprovante|\bcomp\b|\bgr\b", "Guia / pagamento"),
    (r"protocolo|requerimento|formulario|solicitacao|processo|procuracao", "Protocolo / requerimento"),
    (r"laudo|limpeza|potabilidade|praga|dedetiz|caixa d", "Documento de apoio"),
]

PASTAS_IGNORADAS = re.compile(r"documento.{0,3}s?.{0,3}(do|dos|da)?.{0,3}s[oó]cio|doc\.? s[oó]cio", re.I)
# Subpastas do cliente que não guardam documento de legalização (DP, contábil,
# fiscal...): evita certidão de nascimento de admissão, CRF do FGTS etc.
PASTAS_FORA = re.compile(
    r"departamento|pessoal|cont[aá]bil|contabilidade|fiscal|livro caixa|informe|irpf|parcelamento|"
    r"certificado digital|pessoa f[ií]sica|nfs|xml|sped|folha|admiss|rescis",
    re.I,
)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[_\-.()\[\]]+", " ", s)


def data_valida(a: int, m: int, d: int):
    if a < 100:
        a += 2000
    try:
        return dt.date(a, m, d)
    except ValueError:
        return None


def validade_no_nome(nome_norm: str):
    if "indetermin" in nome_norm:
        return "INDETERMINADO"
    m = re.search(r"(?:val|venc\w*|validade|valido ate)\s*(\d{1,2})\s?[ ./]?\s?(\d{1,2})\s?[ ./]?\s?(\d{2,4})", nome_norm)
    if m:
        return data_valida(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.search(r"(?:val|venc\w*)\s*(\d{2})(\d{2})(\d{2,4})\b", nome_norm)
    if m:
        return data_valida(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    return None


PALAVRAS_VENC = re.compile(r"(validade|v[aá]lid[ao]\s+at[ée]|vencimento|vence\s+em|expira|data validade)", re.I)


def validade_no_pdf(caminho: pathlib.Path):
    try:
        from pypdf import PdfReader
        texto = " ".join((p.extract_text() or "") for p in PdfReader(str(caminho)).pages[:3])
    except Exception:
        return None, False
    if not texto.strip():
        return None, False  # escaneado / sem camada de texto
    t = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode().lower()
    for m in re.finditer(r"(\d{2})[/-](\d{2})[/-](\d{4})", t):
        if PALAVRAS_VENC.search(t[max(0, m.start() - 60): m.start()]):
            d = data_valida(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            if d:
                return d, True
    if "indetermin" in t:
        return "INDETERMINADO", True
    return None, True


def ano_no_nome(nome: str):
    m = re.match(r"^0*\d{1,3}[_-]\d{1,4}[_-](\d{4})", nome)
    if m and 1990 <= int(m.group(1)) <= HOJE.year + 1:
        return int(m.group(1))
    anos = [int(a) for a in re.findall(r"(?<!\d)(20\d{2})(?!\d)", nome) if 2000 <= int(a) <= HOJE.year + 2]
    return max(anos) if anos else None


def classificar(rel: pathlib.PurePath):
    nome = rel.name
    alvo = norm(nome)
    pastas = norm(" ".join(rel.parts[:-1]))
    tipo = None
    for rx, t in REGRAS:
        if re.search(rx, alvo):
            tipo = t
            break
    m = re.match(r"^0*(\d{1,2})[_-]0*\d{1,4}[_-]", nome)
    if m and m.group(1) in PREFIXO_TIPO and tipo in (None, "Certidão (outras)"):
        tipo = PREFIXO_TIPO[m.group(1)]
    if tipo is None:  # nome genérico dentro de pasta com o tipo (ex.: Legalização/Alvará/guia.pdf)
        for rx, t in REGRAS[:-1]:  # pasta "Certidões" sozinha não define tipo
            if re.search(rx, pastas):
                tipo = t
                break
    if tipo is None:
        return None
    categoria = "Licença / certificado"
    for rx, c in CATEGORIAS:
        if re.search(rx, alvo) or (c == "Guia / pagamento" and re.search(r"\bguia\b", pastas)):
            categoria = c
            break
    subtipo = ""
    if tipo == "Conselho de Classe":
        subtipo = "Responsável Técnico" if re.search(r"\bcart\b|responsavel tecnico|\brt\b", alvo) else (
            "Anuidade" if re.search(r"anuidade|boleto", alvo) else "Certificado de Regularidade")
    return tipo, subtipo, categoria


def supabase():
    env = {}
    for linha in (RAIZ_REPO / "frontend" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]

    def get(caminho):
        req = urllib.request.Request(f"{url}/rest/v1/{caminho}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
        return json.load(urllib.request.urlopen(req))

    return get


def main():
    pasta = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else PASTA_PADRAO
    saida = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else SAIDA_PADRAO
    get = supabase()

    empresas = get("companies?select=id,codigo_cliente,legal_name,trade_name,ativa,municipality_name,state&limit=5000")
    por_codigo = {}
    for e in empresas:
        if e["codigo_cliente"] and e["codigo_cliente"].strip().isdigit():
            por_codigo.setdefault(int(e["codigo_cliente"]), []).append(e)
    tipos = {t["id"]: t["nome"] for t in get("legalizacao_tipos_documento?select=id,nome")}
    docs_sistema = {}
    for d in get("legalizacao_documentos?select=company_id,tipo_id,data_vencimento,nome_arquivo&limit=10000"):
        docs_sistema[(d["company_id"], tipos.get(d["tipo_id"]))] = d

    arquivos, pastas_clientes, sem_cadastro = [], [], []
    for p in sorted(pasta.iterdir()):
        m = re.match(r"^(\d{3,4})\s*-\s*(.+)$", p.name)
        if not p.is_dir() or not m:
            continue
        codigo = int(m.group(1))
        emp = sorted(por_codigo.get(codigo, []), key=lambda e: not e["ativa"])
        empresa = emp[0] if emp else None
        pastas_clientes.append(codigo)
        if not empresa:
            sem_cadastro.append((m.group(1), m.group(2)))
        for raiz, dirs, files in os.walk(p):
            dirs[:] = [d for d in dirs if not PASTAS_IGNORADAS.search(d)
                       and not (pathlib.Path(raiz) == p and PASTAS_FORA.search(d))]
            for f in files:
                cam = pathlib.Path(raiz) / f
                if cam.suffix.lower() not in EXTENSOES:
                    continue
                rel = cam.relative_to(p)
                c = classificar(rel)
                if not c:
                    continue
                tipo, subtipo, categoria = c
                val_nome = validade_no_nome(norm(f))
                val_pdf, tem_texto = (None, None)
                if categoria == "Licença / certificado" and cam.suffix.lower() == ".pdf" and val_nome is None:
                    val_pdf, tem_texto = validade_no_pdf(cam)
                try:
                    modificado = dt.datetime.fromtimestamp(cam.stat().st_mtime).date()
                except OSError:
                    modificado = None
                arquivos.append({
                    "codigo": m.group(1), "pasta": p.name, "empresa": empresa, "tipo": tipo, "subtipo": subtipo,
                    "categoria": categoria, "arquivo": f, "caminho": str(rel.parent) if str(rel.parent) != "." else "",
                    "val_nome": val_nome, "val_pdf": val_pdf, "pdf_texto": tem_texto,
                    "ano": ano_no_nome(f), "modificado": modificado,
                })

    gerar_planilha(arquivos, empresas, por_codigo, pastas_clientes, sem_cadastro, docs_sistema, saida)


def validade(a):
    return a["val_nome"] if a["val_nome"] is not None else a["val_pdf"]


def chave_melhor(a):
    v = validade(a)
    return (
        1 if a["categoria"] == "Licença / certificado" else 0,
        dt.date.max if v == "INDETERMINADO" else (v or dt.date.min),
        a["ano"] or 0,
        a["modificado"] or dt.date.min,
    )


def fmt(v):
    if v == "INDETERMINADO":
        return "Indeterminada"
    return v.strftime("%d/%m/%Y") if isinstance(v, dt.date) else ""


def situacao_validade(v):
    if v == "INDETERMINADO":
        return "Sem vencimento"
    if not isinstance(v, dt.date):
        return "Validade não identificada"
    return "Vencida" if v < HOJE else "Válida"


def comparar(empresa, tipo, v, docs_sistema):
    nomes = TIPOS_SISTEMA.get(tipo)
    if not empresa or nomes is None:
        return "", ""
    sist = next((docs_sistema[(empresa["id"], n)] for n in nomes if (empresa["id"], n) in docs_sistema), None)
    if not sist:
        return "", "Não cadastrado no sistema"
    sv = sist["data_vencimento"]
    sv_d = dt.date.fromisoformat(sv) if sv else "INDETERMINADO"
    if not isinstance(v, dt.date) and v != "INDETERMINADO":
        return fmt(sv_d), "Cadastrado (validade do arquivo não identificada)"
    if v == sv_d:
        return fmt(sv_d), "Igual ao sistema"
    if v == "INDETERMINADO" or sv_d == "INDETERMINADO":
        return fmt(sv_d), "Diferente do sistema"
    return fmt(sv_d), "Arquivo mais novo que o sistema" if v > sv_d else "Sistema mais novo que o arquivo"


def gerar_planilha(arquivos, empresas, por_codigo, pastas_clientes, sem_cadastro, docs_sistema, saida):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    hdr = PatternFill("solid", fgColor="1F3A5F")
    cores = {"Vencida": "FDE2E1", "Válida": "E3F4E8", "Sem vencimento": "E8EEF8"}

    def cabecalho(ws, cols, larguras):
        ws.append(cols)
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = hdr
            c.alignment = Alignment(vertical="center", wrap_text=True)
        for i, w in enumerate(larguras, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
        ws.freeze_panes = "C2"

    # Resumo: melhor documento por cliente × tipo (só licenças/certificados)
    ws = wb.active
    ws.title = "Resumo por cliente"
    cabecalho(ws, ["Código", "Cliente", "Ativo", "Município", "Tipo", "Subtipo (conselho)", "Arquivo mais recente",
                   "Validade", "Situação", "Vencimento no sistema", "Comparação com o sistema", "Pasta", "Qtde arquivos do tipo"],
              [8, 40, 7, 20, 26, 22, 50, 12, 18, 14, 34, 40, 10])
    grupos = {}
    for a in arquivos:
        grupos.setdefault((a["codigo"], a["tipo"]), []).append(a)
    for (codigo, tipo), lista in sorted(grupos.items(), key=lambda x: (int(x[0][0]), x[0][1])):
        melhor = max(lista, key=chave_melhor)
        e = melhor["empresa"]
        v = validade(melhor) if melhor["categoria"] == "Licença / certificado" else None
        sv, comp = comparar(e, tipo, v, docs_sistema)
        sit = situacao_validade(v) if melhor["categoria"] == "Licença / certificado" else "Só guia/protocolo"
        ws.append([codigo, (e["trade_name"] or e["legal_name"]) if e else melhor["pasta"][6:],
                   ("Sim" if e["ativa"] else "Não") if e else "Sem cadastro",
                   (f'{e["municipality_name"]}/{e["state"]}' if e and e["municipality_name"] else ""),
                   tipo, melhor["subtipo"], melhor["arquivo"], fmt(v), sit, sv, comp, melhor["caminho"], len(lista)])
        if sit in cores:
            ws.cell(ws.max_row, 9).fill = PatternFill("solid", fgColor=cores[sit])
    ws.auto_filter.ref = ws.dimensions

    # Todos os arquivos encontrados
    wa = wb.create_sheet("Todos os arquivos")
    cabecalho(wa, ["Código", "Cliente", "Tipo", "Subtipo (conselho)", "Categoria", "Arquivo", "Validade no nome",
                   "Validade lida no PDF", "PDF com texto?", "Ano no nome", "Modificado em", "Pasta"],
              [8, 40, 26, 22, 22, 55, 14, 14, 10, 9, 12, 45])
    for a in sorted(arquivos, key=lambda x: (int(x["codigo"]), x["tipo"], x["arquivo"])):
        e = a["empresa"]
        wa.append([a["codigo"], (e["trade_name"] or e["legal_name"]) if e else a["pasta"][6:], a["tipo"], a["subtipo"],
                   a["categoria"], a["arquivo"], fmt(a["val_nome"]), fmt(a["val_pdf"]),
                   "" if a["pdf_texto"] is None else ("Sim" if a["pdf_texto"] else "Não (escaneado)"),
                   a["ano"] or "", a["modificado"].strftime("%d/%m/%Y") if a["modificado"] else "", a["caminho"]])
    wa.auto_filter.ref = wa.dimensions

    # Clientes ativos sem nenhum documento encontrado
    wsem = wb.create_sheet("Ativos sem documentos")
    cabecalho(wsem, ["Código", "Cliente", "Município", "Tem pasta?"], [8, 45, 24, 11])
    com_doc = {int(a["codigo"]) for a in arquivos}
    for e in sorted((e for e in empresas if e["ativa"]), key=lambda e: int(e["codigo_cliente"]) if (e["codigo_cliente"] or "").isdigit() else 99999):
        cod = int(e["codigo_cliente"]) if (e["codigo_cliente"] or "").isdigit() else None
        if cod is not None and cod in com_doc:
            continue
        wsem.append([e["codigo_cliente"] or "", e["trade_name"] or e["legal_name"],
                     f'{e["municipality_name"]}/{e["state"]}' if e["municipality_name"] else "",
                     "Sim" if cod in pastas_clientes else "Não"])

    wpc = wb.create_sheet("Pastas sem cadastro")
    cabecalho(wpc, ["Código da pasta", "Nome da pasta"], [14, 60])
    for cod, nome in sem_cadastro:
        wpc.append([cod, nome])

    wi = wb.create_sheet("Como ler", 0)
    for linha in [
        "Relação de documentos de legalização encontrados nas pastas dos clientes",
        f"Gerada em {HOJE.strftime('%d/%m/%Y')} a partir de SOMA - Documentos (somente leitura — nada foi gravado no sistema).",
        "",
        f"{len(arquivos)} arquivo(s) identificados em {len({a['codigo'] for a in arquivos})} pasta(s) de cliente.",
        "",
        "Resumo por cliente: um documento por cliente e tipo — o de maior validade (ou o mais recente).",
        "Validade: lida do nome do arquivo (ex.: VAL30.04.2027, INDETERMINADO) ou, se não houver, do texto do PDF.",
        "  PDF escaneado não tem texto: nesses casos a validade fica em branco e precisa ser conferida no documento.",
        "Comparação com o sistema: confronta com o vencimento cadastrado no SOMA Gestão para o mesmo tipo.",
        "Identificação pelo nome: 006 = alvará, 007 = vigilância, 008 = conselho, 009 = CNES, além de palavras",
        "  como alvará, vigilância, CREMERJ/CRO/CART, CNES, bombeiro/CBMRJ, COMDEP/PGRSS, MTR, certidão.",
        "Pastas de documentos dos sócios foram ignoradas.",
        "",
        "Todos os arquivos: cada arquivo encontrado, com categoria (licença, guia/pagamento, protocolo, apoio).",
        "Ativos sem documentos: clientes ativos sem nenhum documento de legalização encontrado.",
        "Pastas sem cadastro: pastas cujo código não existe no SOMA Gestão.",
    ]:
        wi.append([linha])
    wi["A1"].font = Font(bold=True, size=14)
    wi.column_dimensions["A"].width = 120
    wb.active = 1
    wb.save(saida)
    print(f"{len(arquivos)} arquivos, {len(grupos)} cliente×tipo -> {saida}")


if __name__ == "__main__":
    main()
