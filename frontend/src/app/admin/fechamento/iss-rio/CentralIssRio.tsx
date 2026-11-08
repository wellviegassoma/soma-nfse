"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { FechamentoIssCelula, type FechamentoIssResumo } from "@/components/fechamento/FechamentoIssCelula";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { ConferenciaIss, DiferencaNotas, LinhaGuia } from "./conferencia/[companyId]/route";

export type EmpresaIssRio = {
  id: string;
  nome: string;
  prefixoArquivo: string;
  issTipo: "FIXO" | "PERCENTUAL";
  receitaSoma: number;
  issSoma: number | null;
  certificadoValido: boolean;
  certificadoVenceEmBreve: boolean;
  certificadoVenceEm: string | null;
  fechamento: FechamentoIssResumo;
};

type Status = "ok" | "falta_emitir" | "diferenca" | "sem_movimento" | "sem_guia" | "cadastro" | "erro";

type Resultado = {
  status: Status;
  mensagem: string;
  guia: LinhaGuia | null;
  baseNotaCarioca: number | null;
  retencoes: number;
  emitida: boolean;
  // Guia uniprofissional já emitida num mês que também tem guia de ISS
  // retido — o download precisa de ?uniprofissional=1 (caso da 077 em 10/2026).
  reabrirUniprofissional: boolean;
  pendentesAnteriores: ConferenciaIss["pendentes_anteriores"];
  outrasGuias: LinhaGuia[];
};

const STATUS_ROTULO: Record<Status, { texto: string; classe: string }> = {
  ok: { texto: "Bate", classe: "bg-success-soft text-success" },
  falta_emitir: { texto: "Bate — falta emitir", classe: "bg-success-soft text-success" },
  diferenca: { texto: "Diferença", classe: "bg-danger-soft text-danger" },
  sem_movimento: { texto: "Sem movimento", classe: "bg-surface-muted text-foreground/60" },
  sem_guia: { texto: "Sem guia no Nota Carioca", classe: "bg-warning-soft text-warning" },
  cadastro: { texto: "Conferir cadastro", classe: "bg-warning-soft text-warning" },
  erro: { texto: "Erro", classe: "bg-danger-soft text-danger" },
};

const PODE_EMITIR: Status[] = ["ok", "falta_emitir"];

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ehNumeroDeGuia = (documento: string) => /^\d+$/.test(documento.trim());

// Mesma conferência feita à mão em 03/11/2026: na guia percentual compara a
// receita "1015 - Movimento Econômico" (só as notas emitidas pela empresa)
// com o faturamento da SOMA — as outras receitas da guia são ISS que a
// empresa reteve como tomadora e a SOMA não calcula.
function avaliar(empresa: EmpresaIssRio, conferencia: ConferenciaIss): Resultado {
  const uniprofissional = conferencia.linhas.find((l) => l.origem.includes("DSPREST"));
  const nacional = conferencia.linhas.find((l) => l.origem.includes("NFS-e"));
  const base = {
    pendentesAnteriores: conferencia.pendentes_anteriores,
    baseNotaCarioca: null,
    retencoes: 0,
    reabrirUniprofissional: false,
  };

  if (empresa.issTipo === "FIXO") {
    if (!uniprofissional) {
      return {
        ...base,
        status: nacional ? "cadastro" : "sem_guia",
        mensagem: nacional
          ? "Cadastro diz ISS fixo, mas o Nota Carioca só tem guia percentual no mês."
          : "Nenhuma guia uniprofissional no mês.",
        guia: nacional ?? null,
        emitida: false,
        outrasGuias: [],
      };
    }
    const emitida = ehNumeroDeGuia(uniprofissional.documento);
    const bate = !emitida || (uniprofissional.valor != null && Math.abs(uniprofissional.valor - (empresa.issSoma ?? -1)) < 0.01);
    return {
      ...base,
      status: !bate ? "diferenca" : emitida ? "ok" : "falta_emitir",
      mensagem: !bate
        ? `Guia de ${formatMoney(uniprofissional.valor)} × SOMA ${formatMoney(empresa.issSoma)} — confira a quantidade de profissionais.`
        : emitida
          ? "Guia uniprofissional emitida."
          : `"${uniprofissional.valor_texto}" — emite com a quantidade de profissionais do cadastro.`,
      guia: uniprofissional,
      emitida,
      reabrirUniprofissional: emitida && !!nacional,
      // Mês com guia uniprofissional + guia "NFS-e Nacional" = ISS retido.
      outrasGuias: nacional ? [nacional] : [],
    };
  }

  if (!nacional) {
    if (uniprofissional) {
      return {
        ...base,
        status: "cadastro",
        mensagem: "O Nota Carioca trata a empresa como sociedade uniprofissional; o cadastro diz ISS percentual.",
        guia: uniprofissional,
        emitida: false,
        outrasGuias: [],
      };
    }
    return {
      ...base,
      status: empresa.receitaSoma > 0 ? "sem_guia" : "sem_movimento",
      mensagem:
        empresa.receitaSoma > 0
          ? "A SOMA tem faturamento, mas o Nota Carioca não tem guia no mês (ISS todo retido? nota ainda não chegou?)."
          : "Sem faturamento e sem guia.",
      guia: null,
      emitida: false,
      outrasGuias: [],
    };
  }

  const receitas = nacional.receitas ?? [];
  const movimento = receitas.find((r) => r.codigo === "1015");
  const retencoes = receitas.filter((r) => r.codigo !== "1015").reduce((s, r) => s + (r.base ?? 0), 0);
  const baseNotaCarioca = movimento?.base ?? (receitas.length ? 0 : null);
  const emitida = ehNumeroDeGuia(nacional.documento);
  const bate =
    baseNotaCarioca != null
      ? Math.abs(baseNotaCarioca - empresa.receitaSoma) < 0.01
      : nacional.valor != null && Math.abs(nacional.valor - (empresa.issSoma ?? -1)) < 0.05;
  const diferenca = baseNotaCarioca != null ? empresa.receitaSoma - baseNotaCarioca : null;
  return {
    ...base,
    baseNotaCarioca,
    retencoes,
    status: !bate ? "diferenca" : emitida ? "ok" : "falta_emitir",
    mensagem: !bate
      ? diferenca != null
        ? `SOMA ${diferenca > 0 ? "tem" : "tem a menos"} ${formatMoney(Math.abs(diferenca))} de faturamento — use "Comparar notas".`
        : "Valor da guia não bate com o ISS da SOMA."
      : retencoes > 0
        ? `Faturamento bate. A guia inclui ${formatMoney(retencoes)} de base de ISS retido como tomadora.`
        : "Faturamento bate.",
    guia: nacional,
    emitida,
    outrasGuias: uniprofissional ? [uniprofissional] : [],
  };
}

async function baixarGuia(empresa: EmpresaIssRio, competencia: string, resultado: Resultado): Promise<Blob> {
  const params = new URLSearchParams({ competencia });
  if (resultado.reabrirUniprofissional) params.set("uniprofissional", "1");
  const resposta = await fetch(`/admin/empresas/${empresa.id}/impostos/guia-iss?${params}`);
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.error ?? `HTTP ${resposta.status}`);
  }
  return resposta.blob();
}

function salvar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function DiferencaNotasView({ diferenca }: { diferenca: DiferencaNotas }) {
  const vazia =
    diferenca.soNaSoma.length + diferenca.soNoNotaCarioca.length + diferenca.valorDiferente.length === 0;
  if (vazia) return <p className="text-xs text-foreground/60">As notas são as mesmas nos dois lados.</p>;
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {diferenca.soNaSoma.map((n) => (
        <li key={`s${n.numero}`}>
          Só na SOMA: nota <strong>{n.numero}</strong>, {formatMoney(n.valor)} — competência{" "}
          {n.competencia.split("-").reverse().join("/")}
          {n.dataEmissao && `, emitida em ${new Date(n.dataEmissao).toLocaleDateString("pt-BR")}`}
        </li>
      ))}
      {diferenca.soNoNotaCarioca.map((n) => (
        <li key={`n${n.numero}`}>
          Só no Nota Carioca: nota <strong>{n.numero}</strong>, {formatMoney(n.valor)}, emitida em {n.dataEmissao}
          {n.somaTemCancelada && " (cancelada na SOMA)"}
        </li>
      ))}
      {diferenca.valorDiferente.map((n) => (
        <li key={`v${n.numero}`}>
          Valor diferente: nota <strong>{n.numero}</strong> — SOMA {formatMoney(n.soma)} × Nota Carioca{" "}
          {formatMoney(n.notaCarioca)}
        </li>
      ))}
    </ul>
  );
}

export function CentralIssRio({
  empresas,
  competencia,
  podeMarcarFechamento,
}: {
  empresas: EmpresaIssRio[];
  competencia: string;
  podeMarcarFechamento: boolean;
}) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [carregando, setCarregando] = useState<Set<string>>(new Set());
  const [notas, setNotas] = useState<Record<string, DiferencaNotas | string>>({});
  const [conferindoTodas, setConferindoTodas] = useState(false);
  const [lote, setLote] = useState<{ rodando: boolean; feitas: number; total: number; falhas: string[] } | null>(null);
  const aaaamm = competencia.replace("-", "");

  function marcar(id: string, ligado: boolean) {
    setCarregando((atual) => {
      const novo = new Set(atual);
      if (ligado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  async function conferir(empresa: EmpresaIssRio) {
    if (!empresa.certificadoValido) {
      setResultados((r) => ({
        ...r,
        [empresa.id]: {
          status: empresa.receitaSoma > 0 ? "erro" : "sem_movimento",
          mensagem: "Sem certificado digital válido — não dá pra entrar no Nota Carioca.",
          guia: null,
          baseNotaCarioca: null,
          retencoes: 0,
          emitida: false,
          reabrirUniprofissional: false,
          pendentesAnteriores: [],
          outrasGuias: [],
        },
      }));
      return;
    }
    marcar(empresa.id, true);
    try {
      const resposta = await fetch(`/admin/fechamento/iss-rio/conferencia/${empresa.id}?competencia=${competencia}`);
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? `HTTP ${resposta.status}`);
      setResultados((r) => ({ ...r, [empresa.id]: avaliar(empresa, corpo as ConferenciaIss) }));
    } catch (e) {
      setResultados((r) => ({
        ...r,
        [empresa.id]: {
          status: "erro",
          mensagem: e instanceof Error ? e.message : String(e),
          guia: null,
          baseNotaCarioca: null,
          retencoes: 0,
          emitida: false,
          reabrirUniprofissional: false,
          pendentesAnteriores: [],
          outrasGuias: [],
        },
      }));
    } finally {
      marcar(empresa.id, false);
    }
  }

  // 3 de cada vez: cada conferência é um login de Chromium no serviço.
  async function conferirTodas() {
    setConferindoTodas(true);
    const fila = [...empresas];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let e = fila.shift(); e; e = fila.shift()) await conferir(e);
      }),
    );
    setConferindoTodas(false);
  }

  async function compararNotas(empresa: EmpresaIssRio) {
    marcar(empresa.id, true);
    try {
      const resposta = await fetch(
        `/admin/fechamento/iss-rio/conferencia/${empresa.id}?competencia=${competencia}&notas=1`,
      );
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? `HTTP ${resposta.status}`);
      const conferencia = corpo as ConferenciaIss;
      const erroNotas = conferencia.linhas.find((l) => l.notas_erro)?.notas_erro;
      setNotas((n) => ({ ...n, [empresa.id]: erroNotas ?? conferencia.diferencaNotas ?? "Sem notas pra comparar." }));
    } catch (e) {
      setNotas((n) => ({ ...n, [empresa.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      marcar(empresa.id, false);
    }
  }

  async function emitirUma(empresa: EmpresaIssRio) {
    const resultado = resultados[empresa.id];
    if (!resultado) return;
    marcar(empresa.id, true);
    try {
      salvar(await baixarGuia(empresa, competencia, resultado), `${empresa.prefixoArquivo} - ISS - ${aaaamm}.pdf`);
      if (!resultado.emitida) await conferir(empresa);
      router.refresh(); // coluna Fechamento: a guia baixada daqui marca "pelo sistema"
    } catch (e) {
      setResultados((r) => ({
        ...r,
        [empresa.id]: { ...resultado, mensagem: `Falhou ao emitir/baixar: ${e instanceof Error ? e.message : e}` },
      }));
    } finally {
      marcar(empresa.id, false);
    }
  }

  const prontasParaEmitir = empresas.filter((e) => PODE_EMITIR.includes(resultados[e.id]?.status));

  // Emite as que ainda não foram emitidas e baixa todas num ZIP com o nome
  // padrão de cada guia ("093 - CHRISORTO - ISS - 202610.pdf").
  async function emitirEBaixarLote() {
    const zip = new JSZip();
    const falhas: string[] = [];
    setLote({ rodando: true, feitas: 0, total: prontasParaEmitir.length, falhas });
    for (const empresa of prontasParaEmitir) {
      try {
        const blob = await baixarGuia(empresa, competencia, resultados[empresa.id]);
        zip.file(`${empresa.prefixoArquivo} - ISS - ${aaaamm}.pdf`, blob);
      } catch (e) {
        falhas.push(`${empresa.nome}: ${e instanceof Error ? e.message : e}`);
      }
      setLote((l) => l && { ...l, feitas: l.feitas + 1 });
    }
    if (falhas.length < prontasParaEmitir.length) {
      salvar(await zip.generateAsync({ type: "blob" }), `ISS Rio - ${aaaamm}.zip`);
    }
    setLote({ rodando: false, feitas: prontasParaEmitir.length, total: prontasParaEmitir.length, falhas });
    // Reconfere as que foram emitidas agora, pra coluna "Guia" mostrar o número.
    await Promise.all(
      prontasParaEmitir.filter((e) => !resultados[e.id].emitida).map((e) => conferir(e)),
    );
    router.refresh();
  }

  const conferidas = Object.keys(resultados).length;
  const contagem = Object.values(resultados).reduce<Partial<Record<Status, number>>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const certificadosVencendo = empresas.filter((e) => e.certificadoVenceEmBreve);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" loading={conferindoTodas} onClick={conferirTodas}>
            Conferir todas ({empresas.length})
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={lote?.rodando}
            disabled={prontasParaEmitir.length === 0 || conferindoTodas}
            onClick={emitirEBaixarLote}
          >
            Emitir e baixar as que batem ({prontasParaEmitir.length})
          </Button>
          {conferidas > 0 && (
            <p className="text-xs text-foreground/60">
              {conferidas}/{empresas.length} conferidas —{" "}
              {(Object.keys(contagem) as Status[]).map((s) => `${STATUS_ROTULO[s].texto}: ${contagem[s]}`).join(" · ")}
            </p>
          )}
        </div>
        <p className="text-xs text-foreground/50">
          Conferir só lê o Nota Carioca. Emitir gera a guia oficial no site — só entram as que batem com a SOMA
          (as com diferença ficam pra você decidir, com o botão da própria linha).
        </p>
        {lote && !lote.rodando && (
          <Alert tone={lote.falhas.length ? "warning" : "success"}>
            {lote.total - lote.falhas.length} guia(s) no ZIP.
            {lote.falhas.length > 0 && <span className="mt-1 block">Falharam: {lote.falhas.join("; ")}</span>}
          </Alert>
        )}
        {lote?.rodando && (
          <p className="text-xs text-foreground/60">
            Emitindo/baixando {lote.feitas}/{lote.total}…
          </p>
        )}
        {certificadosVencendo.length > 0 && (
          <Alert tone="warning">
            Certificado vencendo em menos de 30 dias:{" "}
            {certificadosVencendo
              .map((e) => `${e.nome} (${new Date(e.certificadoVenceEm!).toLocaleDateString("pt-BR")})`)
              .join(", ")}
          </Alert>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="text-xs text-foreground/50">
              <th className="border-b border-border px-3 py-2 text-left">Empresa</th>
              <th className="border-b border-border px-3 py-2 text-right">Faturamento SOMA</th>
              <th className="border-b border-border px-3 py-2 text-right">ISS SOMA</th>
              <th className="border-b border-border px-3 py-2 text-right">Base Nota Carioca</th>
              <th className="border-b border-border px-3 py-2 text-right">Guia</th>
              <th className="border-b border-border px-3 py-2 text-left">Situação</th>
              <th className="border-b border-border px-3 py-2 text-left">Fechamento</th>
              <th className="border-b border-border px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {empresas.map((empresa) => {
              const r = resultados[empresa.id];
              const ocupada = carregando.has(empresa.id);
              const diferencaNotas = notas[empresa.id];
              return (
                <tr key={empresa.id} className="align-top">
                  <td className="px-3 py-2">
                    <a href={`/admin/empresas/${empresa.id}/impostos?competencia=${competencia}`} className="hover:underline">
                      {empresa.nome}
                    </a>
                    <span className="ml-2 text-[10px] text-foreground/50">
                      {empresa.issTipo === "FIXO" ? "fixo" : "%"}
                    </span>
                    {!empresa.certificadoValido && (
                      <span className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
                        sem certificado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(empresa.receitaSoma)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(empresa.issSoma)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(r?.baseNotaCarioca)}
                    {r && r.retencoes > 0 && (
                      <span className="block text-[10px] text-foreground/50">+ {formatMoney(r.retencoes)} retido</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r?.guia ? (r.guia.valor != null ? formatMoney(r.guia.valor) : r.guia.valor_texto) : "-"}
                    {r?.guia && (
                      <span className="block text-[10px] text-foreground/50">
                        {r.emitida ? `nº ${r.guia.documento}` : "não emitida"}
                      </span>
                    )}
                    {r?.outrasGuias.map((g) => (
                      <span key={g.origem} className="block text-[10px] text-foreground/50">
                        + {g.valor != null ? formatMoney(g.valor) : g.valor_texto} ({g.origem})
                      </span>
                    ))}
                  </td>
                  <td className="max-w-[360px] px-3 py-2">
                    {ocupada && !r && <span className="text-xs text-foreground/50">conferindo…</span>}
                    {r && (
                      <>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_ROTULO[r.status].classe}`}
                        >
                          {STATUS_ROTULO[r.status].texto}
                        </span>
                        <p className="mt-1 text-xs text-foreground/70">{r.mensagem}</p>
                        {r.pendentesAnteriores.length > 0 && (
                          <p className="mt-1 text-xs text-warning">
                            Em aberto de outros meses:{" "}
                            {r.pendentesAnteriores.map((p) => `${p.competencia} (${p.valor_texto})`).join(", ")}
                          </p>
                        )}
                        {diferencaNotas && (
                          <div className="mt-2 rounded border border-border p-2">
                            {typeof diferencaNotas === "string" ? (
                              <p className="text-xs text-danger">{diferencaNotas}</p>
                            ) : (
                              <DiferencaNotasView diferenca={diferencaNotas} />
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <FechamentoIssCelula
                      companyId={empresa.id}
                      competencia={competencia}
                      fechamento={empresa.fechamento}
                      podeMarcar={podeMarcarFechamento}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" loading={ocupada} onClick={() => conferir(empresa)}>
                        Conferir
                      </Button>
                      {r?.status === "diferenca" && r.guia?.origem.includes("NFS-e") && (
                        <Button type="button" variant="secondary" disabled={ocupada} onClick={() => compararNotas(empresa)}>
                          Comparar notas
                        </Button>
                      )}
                      {r?.guia && r.status !== "erro" && r.status !== "cadastro" && (
                        <Button type="button" variant="secondary" disabled={ocupada} onClick={() => emitirUma(empresa)}>
                          {r.emitida ? "Baixar" : "Emitir e baixar"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
