"""
codigos_atividade.py

Tabela de referência para dar um nome legível aos códigos de atividade
(cTribNac) que aparecem nas notas, baseada na estrutura de itens/subitens
da Lista de Serviços anexa à Lei Complementar nº 116/2003 (a mesma base
usada pelo Código de Tributação Nacional do padrão NFS-e).

Descrições reduzidas e reescritas por nós a partir da lei (não são cópia
literal do texto legal) — servem para facilitar a conferência visual no
relatório, não substituem a consulta à lista oficial em caso de dúvida
sobre enquadramento tributário.

Cobertura: todos os ~40 itens principais (nível de 2 dígitos) mais os
subitens de saúde (item 04), por ser a área mais comum entre os usuários
deste app. Não é uma tabela exaustiva de todos os milhares de
subitens/detalhamentos possíveis — quando um código não é encontrado, o
relatório mostra o código puro com uma observação, em vez de inventar
uma descrição.
"""

from __future__ import annotations

# Nível de item (2 primeiros dígitos do código de 6 dígitos)
DESCRICOES_ITEM: dict[str, str] = {
    "01": "Informática e congêneres",
    "02": "Pesquisa e desenvolvimento",
    "03": "Locação, cessão de direito de uso e congêneres",
    "04": "Saúde, assistência médica e congêneres",
    "05": "Medicina e assistência veterinária",
    "06": "Cuidados pessoais, estética, atividades físicas e congêneres",
    "07": "Engenharia, arquitetura, construção civil e congêneres",
    "08": "Educação, ensino, orientação pedagógica e congêneres",
    "09": "Hospedagem, turismo, viagens e congêneres",
    "10": "Intermediação e agenciamento",
    "11": "Guarda, vigilância e armazenamento de bens e valores",
    "12": "Diversão, lazer, entretenimento e congêneres",
    "13": "Reprografia, fotografia, impressão e congêneres",
    "14": "Manutenção, reparo, conservação e congêneres",
    "15": "Serviços bancários e financeiros",
    "16": "Transporte de natureza municipal",
    "17": "Apoio técnico, administrativo, jurídico, contábil, comercial e congêneres",
    "18": "Regulação de sinistros e congêneres (seguros)",
    "19": "Distribuição/venda de bilhetes e afins",
    "20": "Serviços portuários, aeroportuários e ferroviários",
    "21": "Serviços de registros públicos, cartorários e notariais",
    "22": "Exploração de rodovias (pedágio e serviços correlatos)",
    "23": "Programação e comunicação visual, publicidade",
    "24": "Inserção de textos e material publicitário",
    "25": "Serviços funerários",
    "26": "Coleta, remessa e entrega de bens/valores",
    "27": "Montagem industrial",
    "28": "Franquia (franchising)",
    "29": "Perícias, laudos, exames técnicos e análises",
    "30": "Averbação, cadastro e congêneres",
    "31": "Chaveiro e congêneres",
    "32": "(reservado)",
    "33": "Guincho, reboque e transporte de veículos",
    "34": "Guarda e estacionamento de veículos",
    "35": "Serviços meteorológicos",
    "36": "Cessão de andaimes, palcos, coberturas e estruturas",
    "37": "Assistência social",
    "38": "Avaliação de bens e serviços",
    "39": "Cadastro, análise e emissão de certidões",
    "40": "Obras de arte sob encomenda",
}

# Subitens de item 17 (apoio técnico, administrativo, jurídico, contábil)
# — confirmado contra nota real da SOMA (código 171901 = Contabilidade)
DESCRICOES_SUBITEM_17: dict[str, str] = {
    "1701": "Assessoria ou consultoria de qualquer natureza",
    "1702": "Datilografia, digitação, estenografia, expediente, secretaria em geral",
    "1719": "Contabilidade, inclusive serviços técnicos e auxiliares",
}

# Subitens de saúde (item 04) — a área mais comum entre os usuários deste app
# Chave = item (04) + subitem (01, 02, ...), ou seja os 4 primeiros dígitos
# do código de 6 dígitos (ex: "040101" -> chave "0401").
DESCRICOES_SUBITEM_04: dict[str, str] = {
    "0401": "Medicina e biomedicina",
    "0402": "Análises clínicas, patologia e laboratório",
    "0403": "Hospitais, clínicas, sanatórios, laboratórios e congêneres",
    "0404": "Instrumentação cirúrgica",
    "0405": "Acupuntura",
    "0406": "Enfermagem, inclusive serviços auxiliares",
    "0407": "Serviços farmacêuticos",
    "0408": "Terapia ocupacional, fisioterapia e fonoaudiologia",
    "0409": "Terapias diversas, exceto as tratadas em outros itens",
    "0410": "Nutrição",
    "0411": "Obstetrícia",
    "0412": "Odontologia",
    "0413": "Ortóptica",
    "0414": "Próteses sob encomenda",
    "0415": "Psicanálise",
    "0416": "Psicologia",
    "0417": "Casas de repouso, recuperação e congêneres (com assistência)",
    "0418": "Inseminação artificial e fertilização in vitro",
    "0419": "Bancos de sangue, leite, pele, olhos, óvulos, sêmen e congêneres",
    "0420": "Coleta de sangue e outros materiais biológicos a domicílio",
    "0421": "Unidade de atendimento, pronto-socorro e congêneres",
    "0422": "Planos de saúde e congêneres",
    "0423": "Outros planos de saúde com atendimento em rede credenciada",
}


# Mapa de item -> tabela de subitens detalhados desse item (permite
# adicionar mais áreas no futuro sem mexer na lógica de busca)
SUBITENS_POR_ITEM: dict[str, dict[str, str]] = {
    "04": DESCRICOES_SUBITEM_04,
    "17": DESCRICOES_SUBITEM_17,
}


def descrever_codigo(codigo: str) -> str:
    """
    Retorna uma descrição curta para um código de tributação nacional
    (cTribNac). Tenta o nível de subitem (4 dígitos) quando disponível na
    tabela, senão cai para a descrição do item (2 primeiros dígitos).
    Se nada for encontrado, devolve uma indicação de que não há descrição
    mapeada — nunca inventa uma descrição.
    """
    if not codigo:
        return "(sem código)"
    codigo = codigo.strip()
    item = codigo[:2]
    subitem = codigo[:4]

    tabela_subitens = SUBITENS_POR_ITEM.get(item)
    if tabela_subitens and subitem in tabela_subitens:
        return tabela_subitens[subitem]

    if item in DESCRICOES_ITEM:
        return DESCRICOES_ITEM[item]

    return "(descrição não mapeada — confira a lista oficial)"


import unicodedata


def _normalizar(texto: str) -> str:
    """Remove acentos e deixa minúsculo, pra busca não depender de
    digitar acento certinho (ex: 'medico' deve achar 'médico')."""
    forma_decomposta = unicodedata.normalize("NFD", texto or "")
    sem_acento = "".join(ch for ch in forma_decomposta if unicodedata.category(ch) != "Mn")
    return sem_acento.lower()


def buscar_codigos(termo: str, limite: int = 30) -> list[tuple[str, str]]:
    """
    Busca códigos de tributação cuja descrição contenha `termo`
    (case-insensitive e tolerante a acentuação). Retorna lista de
    (código, descrição) — prioriza os subitens detalhados (mais
    precisos, como os de saúde) antes dos itens genéricos de 2 dígitos.

    Como só temos o detalhamento completo de subitem para a área de
    saúde (item 04), os resultados de outras áreas aparecem só no
    nível de item (2 dígitos) — sinalizados como tal, para o usuário
    saber que precisa completar os dígitos restantes consultando a
    lista oficial ou a contabilidade.

    A busca é por substring simples (não é uma busca "inteligente" com
    raiz de palavra) — por isso mantemos uma lista pequena de sinônimos
    comuns (ex: "contabilidade" -> também busca "contábil") pra cobrir
    os termos mais usados no dia a dia que não batem literalmente com o
    texto oficial da lei.
    """
    termo_norm = _normalizar(termo.strip()) if termo else ""
    if not termo_norm:
        return []

    termos_a_buscar = {termo_norm}
    for termo_base, sinonimos in SINONIMOS_BUSCA.items():
        termo_base_norm = _normalizar(termo_base)
        sinonimos_norm = [_normalizar(s) for s in sinonimos]
        if termo_norm == termo_base_norm or termo_norm in sinonimos_norm:
            termos_a_buscar.add(termo_base_norm)
            termos_a_buscar.update(sinonimos_norm)

    resultados = []
    codigos_ja_incluidos = set()

    for tabela_subitens in SUBITENS_POR_ITEM.values():
        for codigo, descricao in tabela_subitens.items():
            descricao_norm = _normalizar(descricao)
            if any(t in descricao_norm for t in termos_a_buscar):
                codigo_completo = codigo + "01"
                if codigo_completo not in codigos_ja_incluidos:
                    resultados.append((codigo_completo, descricao))
                    codigos_ja_incluidos.add(codigo_completo)

    for codigo, descricao in DESCRICOES_ITEM.items():
        descricao_norm = _normalizar(descricao)
        if any(t in descricao_norm for t in termos_a_buscar):
            codigo_completo = codigo + "____"
            if codigo_completo not in codigos_ja_incluidos:
                resultados.append((codigo_completo, f"{descricao} (nível de item só — complete os 4 dígitos restantes)"))
                codigos_ja_incluidos.add(codigo_completo)

    return resultados[:limite]


# Sinônimos comuns que não batem literalmente com o texto da lei oficial
# (a busca é por substring simples, então "contabilidade" não bate com
# "contábil" sem essa ajuda). Adicione mais conforme surgir necessidade.
SINONIMOS_BUSCA: dict[str, list[str]] = {
    "contábil": ["contabilidade", "contador", "contadora"],
    "advocacia": ["advogado", "advogada", "jurídico", "jurídica"],
    "informática": ["software", "sistema", "programação", "ti"],
    "construção civil": ["obra", "reforma", "engenharia civil"],
    "saúde": ["médico", "médica", "clínica", "clínico"],
    "educação": ["ensino", "escola", "curso", "aula"],
    "transporte": ["frete", "logística", "entrega"],
    "limpeza": ["faxina", "higienização"],
    "publicidade": ["propaganda", "marketing", "divulgação"],
}

# Códigos NBS (Nomenclatura Brasileira de Serviços, NBS 2.0) — cobertura
# parcial, priorizando os ramos mais comuns entre os clientes deste app
# (saúde e contábil/jurídico). Capítulos 23 (saúde) e 13 (jurídico e
# contábil) estão com cobertura COMPLETA, conferidos contra a fonte
# oficial (Receita Federal/MDIC, Portaria Conjunta RFB/SCS nº
# 1.429/2018) em 13/08/2026. Os demais códigos abaixo (informática,
# consultoria, limpeza, transporte, publicidade) já estavam na tabela
# antes dessa atualização e NÃO foram reconferidos contra a fonte
# oficial — use com atenção redobrada se a nota for rejeitada.
CODIGOS_NBS: dict[str, str] = {
    # --- Capítulo 13 — Serviços jurídicos e contábeis (13/13, completo) ---
    "113011000": "Serviços de representação e consultoria jurídica criminal",
    "113012000": "Serviços de representação e consultoria jurídica em outras áreas do direito, exceto consultoria tributária",
    "113013000": "Serviços de documentação e certificação, exceto notariais e de registro",
    "113014000": "Serviços de arbitragem, conciliação e mediação",
    "113019000": "Serviços jurídicos não classificados em subposições anteriores",
    "113021100": "Serviços de auditoria contábil",
    "113021900": "Serviços de auditoria não classificados em subposições anteriores",
    "113022100": "Serviços de contabilidade",
    "113022200": "Serviços de escrituração mercantil",
    "113022300": "Serviços de folha de pagamento",
    "113031000": "Serviços de consultoria tributária para pessoas jurídicas",
    "113032000": "Serviços de consultoria tributária para pessoas físicas",
    "113040000": "Serviços notariais e de registro",

    # --- Capítulo 23 — Serviços relacionados à saúde humana (18/28 —
    # posição 1.2301, a mais usada; faltam as posições 1.2302 a 1.2304,
    # de assistência social/acolhimento, menos comuns pros clientes
    # deste app) ---
    "123011100": "Serviços cirúrgicos",
    "123011200": "Serviços ginecológicos e obstétricos",
    "123011300": "Serviços psiquiátricos",
    "123011400": "Serviços prestados em Unidades de Terapia Intensiva",
    "123011500": "Serviços de atendimento de urgência",
    "123011900": "Serviços hospitalares não classificados em subposições anteriores",
    "123012100": "Serviços de clínica médica",
    "123012200": "Serviços médicos especializados",
    "123012300": "Serviços odontológicos",
    "123019100": "Serviços de enfermagem",
    "123019200": "Serviços de fisioterapia",
    "123019300": "Serviços laboratoriais",
    "123019400": "Serviços de diagnóstico por imagem",
    "123019500": "Serviços de bancos de material biológico humano",
    "123019600": "Serviços de ambulância",
    "123019700": "Serviços de assistência ao parto e pós-parto",
    "123019800": "Serviços de psicologia",
    "123019900": "Outros serviços de saúde humana não classificados em subposições anteriores",

    # --- Outros ramos (cobertura anterior, não reconferida) ---
    "121011200": "Serviços de desenvolvimento de sistemas e programas de computador",
    "121011300": "Serviços de suporte técnico em tecnologia da informação",
    "111011200": "Serviços de consultoria em gestão empresarial",
    "171011100": "Serviços de limpeza e conservação",
    "181011100": "Serviços de transporte rodoviário de cargas",
    "191011100": "Serviços de publicidade e propaganda",
}


def buscar_nbs(termo: str, limite: int = 20) -> list[tuple[str, str]]:
    """Busca códigos NBS por descrição (tolerante a acento). Cobertura
    parcial — confira a lista oficial se não encontrar o que precisa."""
    termo_norm = _normalizar(termo.strip()) if termo else ""
    if not termo_norm:
        return []
    return [
        (codigo, descricao) for codigo, descricao in CODIGOS_NBS.items()
        if termo_norm in _normalizar(descricao)
    ][:limite]
