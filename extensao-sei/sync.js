// SOMA · SEI — lê o SEI de Petrópolis com a sessão já logada neste Chrome e
// manda tudo para o SOMA Gestão (docs/sei.md). Só leitura no SEI: nunca
// peticiona, assina nem clica em nada; só faz GET das telas e documentos
// (e o POST de paginação da própria lista de acessos).
//
// Todo acesso ao SEI roda DENTRO da aba do SEI (chrome.scripting): mesma
// origem, então o cookie de sessão vai sempre, independente da configuração
// de cookies de terceiros. Desta página saem só as chamadas ao SOMA.

const SEI = "https://sei.petropolis.rj.gov.br";
const PAUSA_DOC_MS = 250; // ritmo educado com o servidor da Prefeitura
const PAUSA_PROC_MS = 600;
const MSG_EXPIRADA = "Sessão do SEI expirada: faça login de novo na aba do SEI.";

const $ = (id) => document.getElementById(id);
let parar = false;
let rodando = false;
let abaSeiId = null;

// ---------------------------------------------------------------- utilidades

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg, cls = "") {
  const el = $("log");
  const linha = document.createElement("div");
  if (cls) linha.className = cls;
  linha.textContent = `${new Date().toLocaleTimeString("pt-BR")}  ${msg}`;
  el.appendChild(linha);
  el.scrollTop = el.scrollHeight;
}

function status(id, texto, cls = "") {
  $(id).textContent = texto;
  $(id).className = `st ${cls}`;
}

const base = () => $("base").value;
const parse = (html) => new DOMParser().parseFromString(html, "text/html");
const limpa = (s) => (s ?? "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

async function soma(path, body) {
  const r = await fetch(base() + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if ((r.redirected && /\/login/.test(r.url)) || r.status === 401) throw new Error("SOMA: sem login neste Chrome.");
  if (r.status === 403) throw new Error("SOMA: seu usuário não tem permissão de editar a Legalização.");
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SOMA ${r.status}: ${json.error || "erro"}${json.detalhes ? " " + JSON.stringify(json.detalhes) : ""}`);
  return json;
}

// ---------------------------------------------------------------- funções injetadas na aba do SEI
// (precisam ser autocontidas: rodam no contexto da aba, sem acesso a este arquivo)

function injEstadoAba() {
  const link = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Controle de Acessos Externos");
  return { controle: link ? link.href : null };
}

function injPagina(url, campos) {
  return (async () => {
    try {
      const init = { credentials: "include" };
      if (campos) {
        const fd = new FormData();
        for (const [k, v] of campos) fd.append(k, v);
        init.method = "POST";
        init.body = fd;
      }
      const r = await fetch(url, init);
      const buf = await r.arrayBuffer();
      const cs = ((r.headers.get("content-type") || "").match(/charset=([^;]+)/i) || [])[1];
      let html;
      try {
        html = new TextDecoder(cs ? cs.trim() : "iso-8859-1").decode(buf);
      } catch {
        html = new TextDecoder("iso-8859-1").decode(buf);
      }
      return { url: r.url, status: r.status, html };
    } catch (e) {
      return { __erro: String(e && e.message ? e.message : e) };
    }
  })();
}

/**
 * Abre a página do processo num iframe escondido na aba do SEI e devolve o
 * HTML DEPOIS dos scripts da página rodarem: os links dos documentos internos
 * vêm como javascript:void(0) no HTML do servidor e só viram URL no navegador.
 */
function injPaginaRenderizada(url) {
  return new Promise((resolve) => {
    const f = document.createElement("iframe");
    f.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0";
    let feito = false;
    const fim = (v) => {
      if (feito) return;
      feito = true;
      clearTimeout(tempo);
      f.remove();
      resolve(v);
    };
    const tempo = setTimeout(() => fim({ __erro: "tempo esgotado abrindo o processo" }), 90000);
    f.onload = () =>
      setTimeout(() => {
        try {
          const d = f.contentDocument;
          fim({ url: f.contentWindow.location.href, status: 200, html: d.documentElement.outerHTML });
        } catch (e) {
          fim({ __erro: String(e && e.message ? e.message : e) });
        }
      }, 500);
    f.src = url;
    document.body.appendChild(f);
  });
}

function injDocumento(url, upload, querTexto) {
  return (async () => {
    try {
      const r = await fetch(url, { credentials: "include" });
      const buf = await r.arrayBuffer();
      const ct = (r.headers.get("content-type") || "application/octet-stream").trim();
      const cd = r.headers.get("content-disposition") || "";
      const mimeBase = ct.split(";")[0].trim().toLowerCase();
      let texto = null;
      if (/html/.test(mimeBase)) {
        const cs = (ct.match(/charset=([^;]+)/i) || [])[1];
        try {
          texto = new TextDecoder(cs ? cs.trim() : "iso-8859-1").decode(buf);
        } catch {
          texto = new TextDecoder("iso-8859-1").decode(buf);
        }
        if (/Link externo inv|usuario_externo_logar|md_gov_br_acessar/i.test(texto.slice(0, 5000))) {
          return { __erro: "SEI recusou o link do documento (sessão expirada?)" };
        }
      }
      if (r.status !== 200) return { __erro: `SEI respondeu ${r.status}` };
      let pathname = null;
      if (upload) {
        // Só tipos que o token aceita (curinga só funciona em image/*); o
        // resto vai como octet-stream e o tipo real fica gravado no SOMA.
        const permitido = /^(application\/pdf|text\/html|text\/plain|application\/zip|image\/[a-z0-9.+-]+)$/.test(mimeBase)
          ? mimeBase
          : "application/octet-stream";
        const p = await fetch(`https://vercel.com/api/blob/?pathname=${encodeURIComponent(upload.pathname)}`, {
          method: "PUT",
          body: buf,
          headers: {
            authorization: `Bearer ${upload.token}`,
            "x-api-version": "12",
            "x-vercel-blob-store-id": upload.storeId,
            "x-vercel-blob-access": "private",
            "x-content-type": permitido,
            "x-api-blob-request-id": `${upload.storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
          },
        });
        const j = await p.json().catch(() => ({}));
        if (!p.ok) return { __erro: `Blob ${p.status}: ${(j.error && (j.error.message || j.error)) || "falha no upload"}` };
        pathname = j.pathname;
      }
      return { ct, cd, tamanho: buf.byteLength, texto: querTexto ? texto : null, pathname };
    } catch (e) {
      return { __erro: String(e && e.message ? e.message : e) };
    }
  })();
}

async function naAba(func, args = []) {
  if (abaSeiId == null) throw new Error(MSG_EXPIRADA);
  let res;
  try {
    [res] = await chrome.scripting.executeScript({ target: { tabId: abaSeiId }, func, args });
  } catch (e) {
    throw new Error(`Não consegui usar a aba do SEI (${e.message}). Ela foi fechada?`);
  }
  const out = res?.result;
  if (out?.__erro) throw new Error(out.__erro);
  return out;
}

/** Página do SEI (HTML) lida dentro da aba, devolvida já parseada. */
async function seiDoc(url, campos = null, renderizar = false) {
  const r = renderizar ? await naAba(injPaginaRenderizada, [url]) : await naAba(injPagina, [url, campos]);
  const doc = parse(r.html);
  if (doc.querySelector("#txtEmail, #pwdSenha") || /md_gov_br_(acessar|desconectar)|usuario_externo_sair/.test(r.url)) {
    throw new Error(MSG_EXPIRADA);
  }
  const excecao = doc.querySelector("#divInfraExcecao, .infraExcecao")?.textContent?.trim();
  if (excecao) throw new Error(`SEI: ${excecao}`);
  return { doc, url: r.url };
}

// ---------------------------------------------------------------- verificação

async function verificarSoma() {
  status("stSoma", "verificando…");
  try {
    const r = await soma("/api/sei/ping");
    status("stSoma", `ok — ${r.usuario || "logado"}`, "ok");
    return true;
  } catch (e) {
    status("stSoma", e.message.replace(/^SOMA: /, ""), "err");
    return false;
  }
}

/** Acha uma aba do SEI logada; devolve o link (com hash) do Controle de Acessos. */
async function verificarSei() {
  status("stSei", "verificando…");
  abaSeiId = null;
  const abas = await chrome.tabs.query({ url: `${SEI}/*` });
  let erro = null;
  for (const aba of abas) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: aba.id }, func: injEstadoAba });
      if (res?.result?.controle) {
        abaSeiId = aba.id;
        status("stSei", "ok", "ok");
        return res.result.controle;
      }
    } catch (e) {
      erro = e.message;
    }
  }
  if (erro && !abas.length) status("stSei", erro, "err");
  else if (abas.length) status("stSei", "a aba do SEI não está logada: faça login (gov.br) e clique em Verificar de novo", "err");
  else status("stSei", "abra o SEI numa aba e faça login (gov.br)", "err");
  if (erro) log(`Aba do SEI: ${erro}`, "err");
  return null;
}

async function verificar() {
  const [okSoma, urlSei] = await Promise.all([verificarSoma(), verificarSei()]);
  $("btnSync").disabled = rodando || !(okSoma && urlSei);
  return okSoma && urlSei ? urlSei : null;
}

// ---------------------------------------------------------------- leitura do SEI

const dataBr = (s) => {
  const m = (s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

function linhasAcessos(doc, url) {
  const out = [];
  for (const tr of doc.querySelectorAll("table.infraTable tr")) {
    const a = tr.cells?.[1]?.querySelector("a");
    if (!a) continue;
    const numero = a.textContent.trim();
    if (!/^[A-Z]+\.\d+\/\d{4}$/.test(numero)) continue;
    out.push({
      numero,
      href: new URL(a.getAttribute("href"), url).href,
      liberacao: tr.cells[4]?.textContent.trim() || "",
      validade: tr.cells[5]?.textContent.trim() || "",
    });
  }
  return out;
}

/** Campos do formulário como o navegador enviaria (para o POST de paginação). */
function camposDoForm(form) {
  const campos = [];
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    const tipo = (el.type || "").toLowerCase();
    if (["submit", "button", "image", "reset", "file"].includes(tipo)) continue;
    if ((tipo === "checkbox" || tipo === "radio") && !el.checked) continue;
    if (el.tagName === "SELECT") {
      for (const o of el.options) if (o.selected) campos.push([el.name, o.value]);
    } else campos.push([el.name, el.value ?? ""]);
  }
  return campos;
}

async function lerAcessos(urlControle) {
  const primeira = await seiDoc(urlControle);
  // O SEI lembra na sessão a última página vista: o GET pode voltar na página 3.
  // Então a 1ª resposta só serve para saber quantas páginas há; todas (inclusive
  // a 1) são pedidas explicitamente pelo POST de paginação.
  const sel = primeira.doc.querySelector("#selInfraPaginacaoSuperior");
  const paginas = sel ? sel.options.length : 1;
  const legenda = primeira.doc.querySelector("caption")?.textContent.trim() || "";
  const todos = [];
  const porPagina = [];
  const form = primeira.doc.querySelector("form");
  const action = form ? new URL(form.getAttribute("action"), primeira.url).href : null;
  if (!form || paginas === 1) {
    todos.push(...linhasAcessos(primeira.doc, primeira.url));
    porPagina.push(`p1=${todos.length}`);
  }
  for (let p = 0; form && paginas > 1 && p < paginas; p++) {
    const campos = camposDoForm(form).filter(([k]) => k !== "hdnInfraPaginaAtual");
    campos.push(["hdnInfraPaginaAtual", String(p)]);
    const pag = await seiDoc(action, campos);
    const linhas = linhasAcessos(pag.doc, pag.url);
    const leg = pag.doc.querySelector("caption")?.textContent.trim() || "";
    log(`Página ${p + 1}: ${linhas.length} acessos (${leg || "sem legenda"}); primeiro ${linhas[0]?.numero ?? "—"}.`, "dim");
    porPagina.push(`p${p + 1}=${linhas.length} (1º ${linhas[0]?.numero ?? "—"})`);
    todos.push(...linhas);
    await dormir(PAUSA_DOC_MS);
  }
  // Agrupa por processo: acessos mais recentes primeiro.
  const porNumero = new Map();
  for (const a of todos) {
    const lista = porNumero.get(a.numero) ?? [];
    lista.push(a);
    porNumero.set(a.numero, lista);
  }
  for (const lista of porNumero.values()) lista.sort((x, y) => dataBr(y.liberacao).localeCompare(dataBr(x.liberacao)));
  const esperado = Number(legenda.match(/\((\d+) registros?/)?.[1] || 0);
  const avisos = [];
  if (esperado && todos.length < esperado) {
    avisos.push({
      onde: "lista de acessos",
      erro: `li ${todos.length} de ${esperado} acessos em ${paginas} página(s); por página: ${porPagina.join(", ")}`,
    });
  }
  return { total: todos.length, paginas, processos: porNumero, avisos };
}

function lerProcesso(doc, url) {
  const cab = doc.querySelector("#tblSeiCabecalhoProcesso");
  const campo = (rotulo) =>
    [...(cab?.rows ?? [])].find((r) => r.cells[0]?.textContent.includes(rotulo))?.cells[1] ?? null;
  const interessados = (campo("Interessados")?.innerHTML ?? "")
    .split(/<br\s*\/?>/i)
    .map((s) => limpa(parse(s).body.textContent))
    .filter(Boolean);

  const documentos = [];
  let ordem = 0;
  for (const tr of [...(doc.querySelector("#tblDocumentos")?.rows ?? [])].slice(1)) {
    const numero = tr.cells[1]?.textContent.trim();
    if (!/^\d{5,10}$/.test(numero || "")) continue;
    documentos.push({
      numero_sei: numero,
      ordem: ordem++,
      tipo: limpa(tr.cells[2]?.textContent) || null,
      data: tr.cells[3]?.textContent.trim() || null,
      unidade: tr.cells[4]?.textContent.trim() || null,
      href: linkDocumento(tr, url),
      // Para diagnóstico quando não há link: o que existe na linha (sem hash/ids).
      semLink: resumoLinks(tr),
    });
  }

  const andamentos = [];
  for (const tr of [...(doc.querySelector("#tblHistorico")?.rows ?? [])].slice(1)) {
    if (!tr.cells[2]) continue;
    andamentos.push({
      data_hora: tr.cells[0].textContent.trim(),
      unidade: tr.cells[1].textContent.trim(),
      descricao: limpa(tr.cells[2].textContent),
    });
  }

  return {
    tipo: campo("Tipo")?.textContent.trim() || null,
    data_geracao: campo("Data de Gera")?.textContent.trim() || null,
    nivel_acesso: campo("Nível de Acesso")?.textContent.trim() || campo("Acesso")?.textContent.trim() || null,
    interessados,
    documentos,
    andamentos,
    completo: !!doc.querySelector("#tblHistorico"),
  };
}

/** Link do documento na linha: href direto ou URL dentro de onclick (window.open/infraAbrir…). */
function linkDocumento(tr, url) {
  for (const el of tr.querySelectorAll("a, img, span, td")) {
    for (const attr of ["href", "onclick", "data-href"]) {
      const v = el.getAttribute(attr) || "";
      const m = v.match(/([\w./-]*documento_consulta_externa\.php\?[^'"\s)]+)/);
      if (m) return new URL(m[1].replace(/&amp;/g, "&"), url).href;
    }
  }
  return null;
}

/** Resumo dos links da linha sem dados sensíveis: arquivo .php, ação e nomes de parâmetros. */
function resumoLinks(tr) {
  return [...tr.querySelectorAll("a")]
    .map((a) => {
      const v = `${a.getAttribute("href") || ""} ${a.getAttribute("onclick") || ""}`;
      const arq = v.match(/([a-z_]+\.php)/i)?.[1] || "";
      const acao = v.match(/acao=([a-z_]+)/i)?.[1] || "";
      const fn = v.match(/^\s*(?:javascript:)?\s*([A-Za-z_]+)\(/)?.[1] || "";
      const params = [...v.matchAll(/[?&]([a-z_]+)=/gi)].map((m) => m[1]).join(",");
      return [arq, acao, fn, params].filter(Boolean).join(" ") || "(link vazio)";
    })
    .join(" | ") || "(sem <a>)";
}

/** Texto do formulário (HTML do SEI) com uma linha por célula/parágrafo. */
function textoFormulario(html) {
  const marcado = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/td|\/th|\/tr|\/div|\/h\d|\/li|\/table)\b[^>]*>/gi, "\n");
  return limpa(parse(marcado).body.textContent).slice(0, 100000);
}

function nomeArquivo(cd, numeroSei, mime) {
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  let nome = "";
  if (m) {
    try {
      nome = decodeURIComponent(m[1]);
    } catch {
      nome = m[1];
    }
  }
  if (!nome) {
    const ext = /pdf/.test(mime) ? "pdf" : /html/.test(mime) ? "html" : /jpeg/.test(mime) ? "jpg" : /png/.test(mime) ? "png" : "bin";
    nome = `${numeroSei}.${ext}`;
  }
  return nome.trim().slice(0, 200);
}

// ---------------------------------------------------------------- sincronização

async function sincronizar() {
  rodando = true;
  parar = false;
  $("btnSync").disabled = true;
  $("btnParar").disabled = false;
  const tot = { processos: 0, documentos_novos: 0, andamentos_novos: 0, erros: [] };
  let sincronizacaoId = null;

  try {
    const urlControle = await verificar();
    if (!urlControle) throw new Error("Verifique o login no SOMA e no SEI.");
    sincronizacaoId = (await soma("/api/sei/sync", { acao: "iniciar" })).sincronizacao_id;

    log("Lendo a lista de acessos externos…");
    const { total, paginas, processos, avisos } = await lerAcessos(urlControle);
    log(`${total} acessos em ${paginas} página(s), ${processos.size} processos.`, "ok");
    for (const a of avisos) {
      tot.erros.push(a);
      log(`AVISO: ${a.erro}`, "err");
    }
    $("prog").max = processos.size;
    $("prog").value = 0;

    let i = 0;
    for (const [numero, acessos] of processos) {
      if (parar) break;
      i++;
      $("resumo").textContent = `Processo ${i} de ${processos.size}: ${numero}`;
      try {
        const r = await sincronizarProcesso(sincronizacaoId, numero, acessos, tot);
        tot.processos++;
        log(
          `${numero}: ${r.andamentos_novos} andamento(s) novo(s), ${r.baixados} doc(s) baixado(s)` +
            (r.vinculo ? ` — vínculo: ${r.vinculo}` : " — SEM CLIENTE"),
          r.vinculo ? "" : "dim",
        );
      } catch (e) {
        tot.erros.push({ onde: numero, erro: String(e.message || e).slice(0, 2000) });
        log(`${numero}: ERRO ${e.message || e}`, "err");
        if (/Sessão do SEI expirada|SOMA: sem login|aba do SEI/.test(e.message || "")) {
          parar = true;
          break;
        }
      }
      $("prog").value = i;
      await dormir(PAUSA_PROC_MS);
    }
  } catch (e) {
    tot.erros.push({ onde: "geral", erro: String(e.message || e).slice(0, 2000) });
    log(`ERRO: ${e.message || e}`, "err");
  } finally {
    if (sincronizacaoId) {
      await soma("/api/sei/sync", { acao: "finalizar", sincronizacao_id: sincronizacaoId, ...tot, interrompida: parar }).catch(
        (e) => log(`Falha ao registrar o fim: ${e.message}`, "err"),
      );
    }
    const fim = `${parar ? "Interrompida" : "Concluída"}: ${tot.processos} processos, ${tot.andamentos_novos} andamentos novos, ${tot.documentos_novos} documentos baixados, ${tot.sem_acesso || 0} sem acesso no SEI, ${tot.erros.length} erro(s).`;
    $("resumo").textContent = fim;
    log(fim, tot.erros.length ? "err" : "ok");
    rodando = false;
    $("btnParar").disabled = true;
    $("btnSync").disabled = false;
  }
}

async function sincronizarProcesso(sincronizacaoId, numero, acessos, tot) {
  // Primeiro acesso (mais recente) que abra o processo com andamentos.
  let lido = null;
  let ultimoErro = null;
  for (const acesso of acessos) {
    try {
      const { doc, url } = await seiDoc(acesso.href, null, true);
      const p = lerProcesso(doc, url);
      if (p.completo) {
        lido = p;
        break;
      }
    } catch (e) {
      ultimoErro = e;
      if (e.message === MSG_EXPIRADA) throw e;
    }
  }
  if (!lido) throw ultimoErro ?? new Error("nenhum acesso abriu o processo");

  const hoje = new Date().toISOString().slice(0, 10);
  const validade = acessos.map((a) => dataBr(a.validade)).filter(Boolean).sort().pop() || "";

  // Formulário = primeiro documento, se for HTML gerado no SEI.
  let formularioTexto = null;
  const primeiro = lido.documentos.find((d) => d.href);
  if (primeiro) {
    try {
      const r = await naAba(injDocumento, [primeiro.href, null, true]);
      if (r.texto) formularioTexto = textoFormulario(r.texto);
    } catch (e) {
      log(`${numero}: não li o requerimento (${e.message})`, "dim");
    }
  }

  const resp = await soma("/api/sei/sync", {
    acao: "processo",
    sincronizacao_id: sincronizacaoId,
    processo: {
      numero,
      tipo: lido.tipo,
      data_geracao: lido.data_geracao,
      nivel_acesso: lido.nivel_acesso,
      interessados: lido.interessados,
      acesso_validade: validade ? validade.split("-").reverse().join("/") : null,
      acesso_expirado: validade ? validade < hoje : false,
    },
    formulario_texto: formularioTexto,
    documentos: lido.documentos.map(({ href, semLink, ...d }) => d),
    andamentos: lido.andamentos,
  });
  tot.andamentos_novos += resp.andamentos_novos;

  const faltando = new Set(resp.documentos_faltando);
  // Sem ponto: o Blob trata o que vem depois do 1º ponto como extensão.
  const pasta = numero.replace(/[^A-Za-z0-9]/g, "-");
  let baixadosAgora = 0;
  // Documento listado sem link = o acesso externo da SOMA não deixa abrir.
  // Não é erro: marca no SOMA e tenta de novo na próxima rodada.
  const semAcesso = [];
  for (const d of lido.documentos) {
    if (parar) break;
    if (!faltando.has(d.numero_sei)) continue;
    if (!d.href) {
      semAcesso.push(d.numero_sei);
      continue;
    }
    try {
      await dormir(PAUSA_DOC_MS);
      // Sufixo próprio (o cabeçalho x-add-random-suffix não passa no CORS da API do Blob).
      const pathname = `sei/${pasta}/${d.numero_sei}-${crypto.randomUUID().slice(0, 8)}`;
      const t = await soma("/api/sei/upload", {
        type: "blob.generate-client-token",
        payload: { pathname, clientPayload: null, multipart: false },
      });
      const upload = { pathname, token: t.clientToken, storeId: t.clientToken.split("_")[3] };
      const r = await naAba(injDocumento, [d.href, upload, false]);
      const mimeBase = r.ct.split(";")[0].trim().toLowerCase();
      await soma("/api/sei/sync", {
        acao: "documento",
        processo_id: resp.processo_id,
        numero_sei: d.numero_sei,
        blob_pathname: r.pathname,
        mime: r.ct,
        tamanho: r.tamanho,
        nome_arquivo: nomeArquivo(r.cd, d.numero_sei, mimeBase),
      });
      baixadosAgora++;
      tot.documentos_novos++;
    } catch (e) {
      tot.erros.push({ onde: `${numero} doc ${d.numero_sei}`, erro: String(e.message || e).slice(0, 2000) });
      log(`${numero} doc ${d.numero_sei}: ${e.message || e}`, "err");
      if (/sessão expirada|aba do SEI/i.test(e.message || "")) throw new Error(MSG_EXPIRADA);
    }
  }
  if (semAcesso.length) {
    tot.sem_acesso = (tot.sem_acesso || 0) + semAcesso.length;
    log(`${numero}: ${semAcesso.length} documento(s) sem acesso no SEI (o acesso externo não deixa abrir).`, "dim");
    await soma("/api/sei/sync", { acao: "sem_acesso", processo_id: resp.processo_id, numeros_sei: semAcesso }).catch((e) =>
      log(`${numero}: falha ao marcar sem acesso (${e.message})`, "err"),
    );
  }
  return { andamentos_novos: resp.andamentos_novos, baixados: baixadosAgora, vinculo: resp.vinculo };
}

// ---------------------------------------------------------------- tela

(async () => {
  const { base: salvo } = await chrome.storage.local.get("base");
  if (salvo) $("base").value = salvo;
  $("base").addEventListener("change", async () => {
    await chrome.storage.local.set({ base: base() });
    verificar();
  });
  $("btnVerificar").addEventListener("click", verificar);
  $("btnSync").addEventListener("click", sincronizar);
  $("btnParar").addEventListener("click", () => {
    parar = true;
    log("Parando depois do documento atual…", "dim");
  });
  verificar();
})();
