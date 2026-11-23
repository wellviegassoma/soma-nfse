"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatarMoeda } from "@/lib/formatters";
import { lerDec, decodificarArquivo, type ResumoDeclaracao } from "@/lib/irpf/dec-parser";
import { importarDeclaracaoAction } from "@/lib/actions/irpf";

type Item = {
  chave: string;
  dec: File;
  rec: File | null;
  resumo: ResumoDeclaracao | null;
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

function base(nome: string) {
  return nome.replace(/\.(dec|rec)$/i, "").toUpperCase();
}

async function prepararItens(files: File[]): Promise<Item[]> {
  const recs = new Map<string, File>();
  for (const f of files) if (/\.rec$/i.test(f.name)) recs.set(base(f.name), f);
  const decs = files.filter((f) => /\.dec$/i.test(f.name));
  const vistos = new Set<string>();
  const itens: Item[] = [];
  for (const dec of decs) {
    const chave = `${base(dec.name)}|${dec.size}`;
    if (vistos.has(chave)) continue; // mesma declaração em "gravadas" e "transmitidas"
    vistos.add(chave);
    const rec = recs.get(base(dec.name)) ?? null;
    try {
      const textoDec = decodificarArquivo(await dec.arrayBuffer());
      const textoRec = rec ? decodificarArquivo(await rec.arrayBuffer()) : null;
      itens.push({ chave, dec, rec, resumo: lerDec(textoDec, textoRec), erro: null, estado: "PRONTO" });
    } catch (e) {
      itens.push({ chave, dec, rec, resumo: null, erro: e instanceof Error ? e.message : "Arquivo inválido", estado: "ERRO" });
    }
  }
  return itens.sort((a, b) =>
    (a.resumo?.nome ?? "~").localeCompare(b.resumo?.nome ?? "~") || (a.resumo?.exercicio ?? 0) - (b.resumo?.exercicio ?? 0),
  );
}

async function enviarArquivo(file: File, ext: "DEC" | "REC") {
  // Pathname sem CPF nem nome: só um id aleatório.
  const blob = await upload(`irpf/importacao/${crypto.randomUUID()}.${ext}`, file, {
    access: "private",
    handleUploadUrl: "/api/irpf/upload",
    contentType: "text/plain",
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

  async function importar() {
    const fila = itens.filter((i) => i.resumo && i.estado === "PRONTO");
    if (!fila.length) return;
    setEnviando(true);
    let n = 0;
    const trabalhar = async () => {
      for (;;) {
        const item = fila.shift();
        if (!item) return;
        atualizar(item.chave, { estado: "ENVIANDO" });
        try {
          const decPathname = await enviarArquivo(item.dec, "DEC");
          const recPathname = item.rec ? await enviarArquivo(item.rec, "REC") : null;
          const r = await importarDeclaracaoAction({
            decPathname,
            decNome: item.dec.name,
            recPathname,
            recNome: item.rec?.name ?? null,
          });
          if ("error" in r) atualizar(item.chave, { estado: "ERRO", mensagem: r.error });
          else atualizar(item.chave, { estado: r.acao, mensagem: r.contribuinteNovo ? "novo contribuinte" : undefined });
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
    const validos = itens.filter((i) => i.resumo);
    const porEx = new Map<number, number>();
    for (const i of validos) porEx.set(i.resumo!.exercicio, (porEx.get(i.resumo!.exercicio) ?? 0) + 1);
    const cont = (e: Item["estado"]) => itens.filter((i) => i.estado === e).length;
    return {
      validos: validos.length,
      invalidos: itens.filter((i) => !i.resumo).length,
      pessoas: new Set(validos.map((i) => i.resumo!.cpf)).size,
      porEx: [...porEx.entries()].sort((a, b) => a[0] - b[0]),
      prontos: cont("PRONTO"),
      criadas: cont("CRIADA"),
      atualizadas: cont("ATUALIZADA"),
      mantidas: cont("MANTIDA"),
      repetidas: cont("REPETIDA"),
      erros: itens.filter((i) => i.estado === "ERRO" && i.resumo).length,
      novos: itens.filter((i) => i.mensagem === "novo contribuinte").length,
    };
  }, [itens]);

  const total = itens.filter((i) => i.resumo).length;
  const acabou = !enviando && feito > 0 && resumo.prontos === 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-foreground/70">
          Escolha a pasta com as declarações (ex.: <code className="text-xs">C:\Arquivos de Programas RFB\IRPF2026\transmitidas</code>) ou
          selecione os arquivos. O sistema lê cada <b>.DEC</b> (e o <b>.REC</b> com o mesmo nome, quando houver), cadastra o
          contribuinte pelo CPF e guarda a declaração do exercício. Pode importar a mesma pasta de novo: nada se duplica.
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
              accept=".DEC,.REC,.dec,.rec"
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
            <b>{resumo.validos}</b> declaração(ões) de <b>{resumo.pessoas}</b> pessoa(s)
            {resumo.porEx.length > 0 && <> · {resumo.porEx.map(([ex, n]) => `${ex}: ${n}`).join(" · ")}</>}
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
                      {i.resumo ? i.resumo.nome : <span className="text-foreground/50">{i.dec.name}</span>}
                    </td>
                    <td className="px-3 py-2">{i.resumo?.exercicio ?? "—"}</td>
                    <td className="px-3 py-2 text-foreground/70">
                      {i.resumo ? (
                        <>
                          {i.resumo.completa ? "Completa" : "Simplificada"}
                          {i.resumo.retificadora ? " · retif." : ""}
                          {!i.resumo.transmissao && " · não transmitida"}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {i.resumo?.resultado === "PAGAR" && (
                        <span className="text-danger">Pagar {formatarMoeda(i.resumo.totais.impostoPagar)}</span>
                      )}
                      {i.resumo?.resultado === "RESTITUIR" && (
                        <span className="text-success">Restituir {formatarMoeda(i.resumo.totais.impostoRestituir)}</span>
                      )}
                      {i.resumo?.resultado === "SEM_SALDO" && <span className="text-foreground/50">Sem saldo</span>}
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
