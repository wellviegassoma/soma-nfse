"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatarMoeda } from "@/lib/formatters";
import { lerDec, decodificarArquivo } from "@/lib/irpf/dec-parser";
import { importarDeclaracaoAction, importarPdfAction, type ResultadoImportacao } from "@/lib/actions/irpf";

type Linha = {
  nome: string;
  exercicio: number;
  completa: boolean;
  retificadora: boolean;
  resultado: "SEM_SALDO" | "PAGAR" | "RESTITUIR";
  valor: number;
  transmitida: boolean;
  parcial: boolean;
};

type Item = {
  chave: string;
  tipo: "DEC" | "PDF";
  dec?: File;
  rec?: File | null;
  pdfs?: File[];
  linha: Linha | null; // .DEC: lido no navegador; PDF: preenchido depois de importar
  cpf: string | null;
  erro: string | null;
  estado: "PRONTO" | "ENVIANDO" | "CRIADA" | "ATUALIZADA" | "MANTIDA" | "REPETIDA" | "ERRO";
  mensagem?: string;
};

const ESTADO_LABEL: Record<Item["estado"], string> = {
  PRONTO: "",
  ENVIANDO: "Enviando…",
  CRIADA: "Criada",
  ATUALIZADA: "Atualizada",
  MANTIDA: "Arquivo guardado (já havia versão mais recente)",
  REPETIDA: "Já importada",
  ERRO: "Erro",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function baseDec(nome: string) {
  return nome.replace(/\.(dec|rec)$/i, "").toUpperCase();
}

/** PDF do programa do IRPF (declaração ou recibo)? Boletos de DARF e outros ficam de fora. */
function pdfDoIrpf(nome: string) {
  const n = semAcento(nome).toUpperCase();
  return n.endsWith(".PDF") && !/DARF/.test(n) && /IMAGEM-(DECLARACAO|RECIBO)|DECLARACAO|RECIBO/.test(n);
}

/** Chave que junta "…-imagem-declaracao.pdf" com "…-imagem-recibo.pdf" (e "X - DECLARAÇÃO - 2026" com "X - RECIBO - 2026"). */
function basePdf(nome: string) {
  return semAcento(nome)
    .toUpperCase()
    .replace(/\.PDF$/, "")
    .replace(/IMAGEM-(DECLARACAO|RECIBO)/, "#")
    .replace(/\b(DECLARACAO|RECIBO)\b/, "#")
    .replace(/\s+/g, " ")
    .trim();
}

async function prepararItens(files: File[]): Promise<Item[]> {
  const itens: Item[] = [];

  // .DEC/.REC — lidos aqui mesmo para a prévia.
  const recs = new Map<string, File>();
  for (const f of files) if (/\.rec$/i.test(f.name)) recs.set(baseDec(f.name), f);
  const vistos = new Set<string>();
  for (const dec of files.filter((f) => /\.dec$/i.test(f.name))) {
    const chave = `${baseDec(dec.name)}|${dec.size}`;
    if (vistos.has(chave)) continue; // mesma declaração em "gravadas" e "transmitidas"
    vistos.add(chave);
    const rec = recs.get(baseDec(dec.name)) ?? null;
    try {
      const r = lerDec(decodificarArquivo(await dec.arrayBuffer()), rec ? decodificarArquivo(await rec.arrayBuffer()) : null);
      itens.push({
        chave,
        tipo: "DEC",
        dec,
        rec,
        cpf: r.cpf,
        linha: {
          nome: r.nome,
          exercicio: r.exercicio,
          completa: r.completa,
          retificadora: r.retificadora,
          resultado: r.resultado,
          valor: r.resultado === "PAGAR" ? r.totais.impostoPagar : r.totais.impostoRestituir,
          transmitida: !!r.transmissao,
          parcial: false,
        },
        erro: null,
        estado: "PRONTO",
      });
    } catch (e) {
      itens.push({ chave, tipo: "DEC", dec, rec, cpf: null, linha: null, erro: e instanceof Error ? e.message : "Arquivo inválido", estado: "ERRO" });
    }
  }

  // PDFs — agrupados por nome; lidos no servidor ao importar.
  const grupos = new Map<string, File[]>();
  const vistosPdf = new Set<string>();
  for (const f of files.filter((x) => pdfDoIrpf(x.name))) {
    const id = `${f.name}|${f.size}`;
    if (vistosPdf.has(id)) continue;
    vistosPdf.add(id);
    const k = basePdf(f.name);
    grupos.set(k, [...(grupos.get(k) ?? []), f].slice(0, 2));
  }
  for (const [k, pdfs] of grupos) {
    itens.push({ chave: `PDF|${k}`, tipo: "PDF", pdfs, cpf: null, linha: null, erro: null, estado: "PRONTO" });
  }

  return itens.sort(
    (a, b) =>
      (a.linha?.nome ?? a.pdfs?.[0]?.name ?? "~").localeCompare(b.linha?.nome ?? b.pdfs?.[0]?.name ?? "~") ||
      (a.linha?.exercicio ?? 0) - (b.linha?.exercicio ?? 0),
  );
}

async function enviarArquivo(file: File, ext: "DEC" | "REC" | "pdf") {
  // Pathname sem CPF nem nome: só um id aleatório.
  const blob = await upload(`irpf/importacao/${crypto.randomUUID()}.${ext}`, file, {
    access: "private",
    handleUploadUrl: "/api/irpf/upload",
    contentType: ext === "pdf" ? "application/pdf" : "text/plain",
  });
  return blob.pathname;
}

export function ImportarDeclaracoes() {
  const [itens, setItens] = useState<Item[]>([]);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(0);

  async function selecionar(lista: FileList | null) {
    if (!lista?.length) return;
    setLendo(true);
    setFeito(0);
    setItens(await prepararItens(Array.from(lista)));
    setLendo(false);
  }

  function atualizar(chave: string, patch: Partial<Item>) {
    setItens((prev) => prev.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  }

  async function importarItem(item: Item): Promise<ResultadoImportacao> {
    if (item.tipo === "DEC") {
      const decPathname = await enviarArquivo(item.dec!, "DEC");
      const recPathname = item.rec ? await enviarArquivo(item.rec, "REC") : null;
      return importarDeclaracaoAction({ decPathname, decNome: item.dec!.name, recPathname, recNome: item.rec?.name ?? null });
    }
    const arquivos = [];
    for (const f of item.pdfs!) arquivos.push({ pathname: await enviarArquivo(f, "pdf"), nome: f.name });
    return importarPdfAction({ arquivos });
  }

  async function importar() {
    const fila = itens.filter((i) => !i.erro && i.estado === "PRONTO");
    if (!fila.length) return;
    setEnviando(true);
    let n = 0;
    const trabalhar = async () => {
      for (;;) {
        const item = fila.shift();
        if (!item) return;
        atualizar(item.chave, { estado: "ENVIANDO" });
        try {
          const r = await importarItem(item);
          if ("error" in r) atualizar(item.chave, { estado: "ERRO", mensagem: r.error });
          else
            atualizar(item.chave, {
              estado: r.acao,
              linha: item.linha ?? r.resumo,
              mensagem: [r.contribuinteNovo ? "novo contribuinte" : null, r.resumo.parcial ? "só o recibo (sem detalhes)" : null]
                .filter(Boolean)
                .join(" · ") || undefined,
            });
        } catch (e) {
          atualizar(item.chave, { estado: "ERRO", mensagem: e instanceof Error ? e.message : "Falha no envio" });
        }
        n++;
        setFeito(n);
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    setEnviando(false);
  }

  const resumo = useMemo(() => {
    const validos = itens.filter((i) => !i.erro);
    const porEx = new Map<number, number>();
    for (const i of validos) if (i.linha) porEx.set(i.linha.exercicio, (porEx.get(i.linha.exercicio) ?? 0) + 1);
    const cont = (e: Item["estado"]) => itens.filter((i) => i.estado === e).length;
    return {
      dec: validos.filter((i) => i.tipo === "DEC").length,
      pdf: validos.filter((i) => i.tipo === "PDF").length,
      invalidos: itens.filter((i) => i.erro).length,
      pessoas: new Set(validos.filter((i) => i.cpf).map((i) => i.cpf)).size,
      porEx: [...porEx.entries()].sort((a, b) => a[0] - b[0]),
      prontos: itens.filter((i) => !i.erro && i.estado === "PRONTO").length,
      criadas: cont("CRIADA"),
      atualizadas: cont("ATUALIZADA"),
      mantidas: cont("MANTIDA"),
      repetidas: cont("REPETIDA"),
      erros: itens.filter((i) => i.estado === "ERRO" && !i.erro).length,
      novos: itens.filter((i) => i.mensagem?.includes("novo contribuinte")).length,
    };
  }, [itens]);

  const total = resumo.dec + resumo.pdf;
  const acabou = !enviando && feito > 0 && resumo.prontos === 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-foreground/70">
          Escolha a pasta com as declarações ou selecione os arquivos. Aceita o <b>.DEC</b> (com o <b>.REC</b> de mesmo nome) e
          também os <b>PDFs</b> que o programa do IRPF gera — a declaração e o recibo de entrega (ex.: pasta{" "}
          <code className="text-xs">Desktop\IRPF 2026\DECLARAÇOES E RECIBOS</code>). O sistema cadastra o contribuinte pelo CPF e
          guarda a declaração do exercício. Pode importar a mesma pasta de novo: nada se duplica.
        </p>
        <p className="text-xs text-foreground/50">
          Quando há .DEC e PDF da mesma entrega, vale o .DEC (é mais completo). Só o recibo em PDF traz os totais, o número e a
          data de entrega, sem bens nem deduções.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
            Escolher pasta
            <input
              type="file"
              className="hidden"
              multiple
              {...{ webkitdirectory: "", directory: "" }}
              disabled={enviando}
              onChange={(e) => selecionar(e.target.files)}
            />
          </label>
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-muted">
            Escolher arquivos
            <input
              type="file"
              className="hidden"
              multiple
              accept=".DEC,.REC,.dec,.rec,.pdf,.PDF"
              disabled={enviando}
              onChange={(e) => selecionar(e.target.files)}
            />
          </label>
        </div>
        {lendo && <p className="text-sm text-foreground/60">Lendo arquivos…</p>}
      </Card>

      {itens.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm text-foreground/70">
            {resumo.dec > 0 && (
              <>
                <b>{resumo.dec}</b> .DEC de <b>{resumo.pessoas}</b> pessoa(s)
                {resumo.porEx.length > 0 && <> ({resumo.porEx.map(([ex, n]) => `${ex}: ${n}`).join(" · ")})</>}
              </>
            )}
            {resumo.dec > 0 && resumo.pdf > 0 && " · "}
            {resumo.pdf > 0 && (
              <>
                <b>{resumo.pdf}</b> declaração(ões) em PDF
              </>
            )}
            {resumo.invalidos > 0 && <span className="text-danger"> · {resumo.invalidos} arquivo(s) inválido(s)</span>}
          </div>
          {acabou ? (
            <Link href="/irpf">
              <Button variant="secondary">Ver declarações</Button>
            </Link>
          ) : (
            <Button onClick={importar} loading={enviando} disabled={resumo.prontos === 0}>
              {enviando ? `Importando ${feito}/${total}…` : `Importar ${resumo.prontos}`}
            </Button>
          )}
        </Card>
      )}

      {acabou && (
        <Alert tone={resumo.erros ? "warning" : "success"}>
          Importação concluída: {resumo.criadas} criada(s), {resumo.atualizadas} atualizada(s), {resumo.mantidas} arquivo(s) de
          versão anterior guardado(s), {resumo.repetidas} já existente(s), {resumo.novos} contribuinte(s) novo(s)
          {resumo.erros ? `, ${resumo.erros} com erro (veja abaixo)` : ""}.
        </Alert>
      )}

      {itens.length > 0 && (
        <Card className="overflow-hidden">
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted text-left text-xs text-foreground/55">
                <tr>
                  <th className="px-4 py-2 font-medium">Contribuinte</th>
                  <th className="px-3 py-2 font-medium">Exercício</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((i) => (
                  <tr key={i.chave}>
                    <td className="px-4 py-2">
                      {i.linha ? (
                        i.linha.nome
                      ) : (
                        <span className="text-foreground/50">
                          {i.tipo === "PDF" ? i.pdfs!.map((f) => f.name).join(" + ") : i.dec?.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{i.linha?.exercicio ?? "—"}</td>
                    <td className="px-3 py-2 text-foreground/70">
                      <span className="mr-1 rounded bg-surface-muted px-1 text-[10px] font-semibold text-foreground/55">{i.tipo}</span>
                      {i.linha ? (
                        <>
                          {i.linha.completa ? "Completa" : "Simplificada"}
                          {i.linha.retificadora ? " · retif." : ""}
                          {!i.linha.transmitida && " · não transmitida"}
                        </>
                      ) : i.tipo === "PDF" ? (
                        <span className="text-xs text-foreground/45">lido ao importar</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {i.linha?.resultado === "PAGAR" && <span className="text-danger">Pagar {formatarMoeda(i.linha.valor)}</span>}
                      {i.linha?.resultado === "RESTITUIR" && (
                        <span className="text-success">Restituir {formatarMoeda(i.linha.valor)}</span>
                      )}
                      {i.linha?.resultado === "SEM_SALDO" && <span className="text-foreground/50">Sem saldo</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {i.erro ? (
                        <span className="text-danger">{i.erro}</span>
                      ) : (
                        <span className={i.estado === "ERRO" ? "text-danger" : "text-foreground/60"}>
                          {ESTADO_LABEL[i.estado]}
                          {i.mensagem ? ` — ${i.mensagem}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
