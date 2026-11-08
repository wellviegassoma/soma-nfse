"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FechamentoIssCelula, type FechamentoIssResumo } from "@/components/fechamento/FechamentoIssCelula";

export type EmpresaIssPetropolis = {
  id: string;
  nome: string;
  prefixoArquivo: string;
  receitaSoma: number;
  receitaRetidaSoma: number;
  issSoma: number | null;
  // CMC ou login próprio no site da Prefeitura — sem nenhum dos dois o
  // backend tenta pelo login do escritório (busca por CNPJ, menos confiável).
  temAcesso: boolean;
  fechamento: FechamentoIssResumo;
};

// valorServicos = Normal + Retido; valorIss = ISS só das Normais (o que vai na guia).
type Resumo = { valorServicos: number; valorIss: number; servicosRetidos: number; issRetido: number };

type Status = "ok" | "falta_emitir" | "diferenca" | "sem_movimento" | "erro";

type Resultado = {
  status: Status;
  mensagem: string;
  consolidado: boolean;
  resumo: Resumo | null;
  pdf: Blob | null; // guia já consolidada vem junto na conferência
};

const STATUS_ROTULO: Record<Status, { texto: string; classe: string }> = {
  ok: { texto: "Bate — guia emitida", classe: "bg-success-soft text-success" },
  falta_emitir: { texto: "Bate — falta emitir", classe: "bg-success-soft text-success" },
  diferenca: { texto: "Diferença", classe: "bg-danger-soft text-danger" },
  sem_movimento: { texto: "Sem movimento", classe: "bg-surface-muted text-foreground/60" },
  erro: { texto: "Erro", classe: "bg-danger-soft text-danger" },
};

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function lerResumoDosHeaders(headers: Headers): Resumo | null {
  const valorServicos = Number(headers.get("X-Valor-Servicos") ?? "");
  const valorIss = Number(headers.get("X-Valor-Iss") ?? "");
  if (Number.isNaN(valorServicos) || Number.isNaN(valorIss)) return null;
  return {
    valorServicos,
    valorIss,
    servicosRetidos: Number(headers.get("X-Servicos-Retidos") ?? 0) || 0,
    issRetido: Number(headers.get("X-Iss-Retido") ?? 0) || 0,
  };
}

function salvar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function avaliar(empresa: EmpresaIssPetropolis, consolidado: boolean, resumo: Resumo): Omit<Resultado, "pdf"> {
  const diferenca = resumo.valorServicos - empresa.receitaSoma;
  if (resumo.valorServicos < 0.005 && empresa.receitaSoma < 0.005) {
    return { status: "sem_movimento", mensagem: "Sem faturamento e sem movimento na Prefeitura.", consolidado, resumo };
  }
  if (Math.abs(diferenca) >= 0.01) {
    return {
      status: "diferenca",
      mensagem:
        diferenca > 0
          ? `A Prefeitura tem ${formatMoney(diferenca)} a mais — falta nota no SOMA (busca/importação).`
          : `A Prefeitura tem ${formatMoney(-diferenca)} a menos — nota no SOMA ainda não lançada lá, ou cancelada.`,
      consolidado,
      resumo,
    };
  }
  return {
    status: consolidado ? "ok" : "falta_emitir",
    mensagem: consolidado ? "Movimento consolidado e guia emitida." : "Bate — falta consolidar e emitir a guia.",
    consolidado,
    resumo,
  };
}

async function conferirNaPrefeitura(
  empresa: EmpresaIssPetropolis,
  competencia: string,
): Promise<Resultado> {
  const resposta = await fetch(`/admin/empresas/${empresa.id}/impostos/guia-iss-petropolis?competencia=${competencia}`);
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    return { status: "erro", mensagem: corpo?.error ?? `HTTP ${resposta.status}`, consolidado: false, resumo: null, pdf: null };
  }
  if ((resposta.headers.get("content-type") ?? "").includes("application/json")) {
    const corpo = await resposta.json();
    const resumo: Resumo = {
      valorServicos: Number(corpo.valor_servicos ?? 0),
      valorIss: Number(corpo.valor_iss ?? 0),
      servicosRetidos: Number(corpo.servicos_retidos ?? 0) || 0,
      issRetido: Number(corpo.iss_retido ?? 0) || 0,
    };
    return { ...avaliar(empresa, false, resumo), pdf: null };
  }
  const resumo = lerResumoDosHeaders(resposta.headers);
  const pdf = await resposta.blob();
  if (!resumo) {
    return { status: "erro", mensagem: "Guia sem valores reconhecíveis.", consolidado: true, resumo: null, pdf };
  }
  return { ...avaliar(empresa, true, resumo), pdf };
}

// AÇÃO REAL: consolida o movimento do mês na Prefeitura e emite a guia.
async function emitirNaPrefeitura(empresa: EmpresaIssPetropolis, competencia: string): Promise<Resultado> {
  const resposta = await fetch(`/admin/empresas/${empresa.id}/impostos/consolidar-guia-iss-petropolis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competencia }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.error ?? `HTTP ${resposta.status}`);
  }
  const resumo = lerResumoDosHeaders(resposta.headers);
  const pdf = await resposta.blob();
  return {
    status: "ok",
    mensagem: "Movimento consolidado e guia emitida agora.",
    consolidado: true,
    resumo,
    pdf,
  };
}

export function CentralIssPetropolis({
  empresas,
  competencia,
  podeMarcarFechamento,
  podeEmitir,
}: {
  empresas: EmpresaIssPetropolis[];
  competencia: string;
  podeMarcarFechamento: boolean;
  podeEmitir: boolean;
}) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [carregando, setCarregando] = useState<Set<string>>(new Set());
  const [conferindoTodas, setConferindoTodas] = useState(false);
  const [lote, setLote] = useState<{ rodando: boolean; feitas: number; total: number; falhas: string[] } | null>(null);
  const aaaamm = competencia.replace("-", "");
  const nomeArquivo = (e: EmpresaIssPetropolis) => `${e.prefixoArquivo} - ISS - ${aaaamm}.pdf`;

  function marcar(id: string, ligado: boolean) {
    setCarregando((s) => {
      const n = new Set(s);
      if (ligado) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function conferir(empresa: EmpresaIssPetropolis) {
    marcar(empresa.id, true);
    try {
      const r = await conferirNaPrefeitura(empresa, competencia);
      setResultados((atual) => ({ ...atual, [empresa.id]: r }));
    } catch (e) {
      setResultados((atual) => ({
        ...atual,
        [empresa.id]: {
          status: "erro",
          mensagem: e instanceof Error ? e.message : String(e),
          consolidado: false,
          resumo: null,
          pdf: null,
        },
      }));
    } finally {
      marcar(empresa.id, false);
    }
  }

  // Três por vez: o site da Prefeitura é lento e cada consulta faz login.
  async function conferirTodas() {
    setConferindoTodas(true);
    const fila = [...empresas];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (fila.length) {
          const empresa = fila.shift()!;
          await conferir(empresa);
        }
      }),
    );
    setConferindoTodas(false);
  }

  async function emitirUma(empresa: EmpresaIssPetropolis) {
    const r = resultados[empresa.id];
    if (!r) return;
    if (r.consolidado && r.pdf) {
      salvar(r.pdf, nomeArquivo(empresa));
      return;
    }
    const ok = window.confirm(
      `Consolidar o movimento de ${competencia} na Prefeitura e emitir a guia de ${empresa.nome}?\n\n` +
        `Serviços: ${formatMoney(r.resumo?.valorServicos)} · ISS da guia: ${formatMoney(r.resumo?.valorIss)}\n\n` +
        "Isso é definitivo no site da Prefeitura.",
    );
    if (!ok) return;
    marcar(empresa.id, true);
    try {
      const emitido = await emitirNaPrefeitura(empresa, competencia);
      setResultados((atual) => ({ ...atual, [empresa.id]: emitido }));
      if (emitido.pdf) salvar(emitido.pdf, nomeArquivo(empresa));
      router.refresh();
    } catch (e) {
      setResultados((atual) => ({
        ...atual,
        [empresa.id]: { ...r, mensagem: `Falhou ao emitir: ${e instanceof Error ? e.message : e}` },
      }));
    } finally {
      marcar(empresa.id, false);
    }
  }

  const batem = empresas.filter((e) => ["ok", "falta_emitir"].includes(resultados[e.id]?.status ?? ""));
  const faltaEmitir = batem.filter((e) => resultados[e.id].status === "falta_emitir");

  // Emite as que batem e ainda não foram consolidadas, e baixa todas as que
  // batem num ZIP com o nome padrão ("160 - FB HEALTH CARE - ISS - 202610.pdf").
  async function emitirEBaixarLote() {
    if (faltaEmitir.length > 0) {
      const ok = window.confirm(
        `Consolidar e emitir a guia de ${faltaEmitir.length} empresa(s) na Prefeitura (${competencia})?\n\n` +
          faltaEmitir.map((e) => `• ${e.nome}: ISS ${formatMoney(resultados[e.id].resumo?.valorIss)}`).join("\n") +
          "\n\nIsso é definitivo no site da Prefeitura.",
      );
      if (!ok) return;
    }
    const zip = new JSZip();
    const falhas: string[] = [];
    setLote({ rodando: true, feitas: 0, total: batem.length, falhas });
    for (const empresa of batem) {
      try {
        let r = resultados[empresa.id];
        if (!r.consolidado) {
          r = await emitirNaPrefeitura(empresa, competencia);
          setResultados((atual) => ({ ...atual, [empresa.id]: r }));
        }
        if (r.pdf) zip.file(nomeArquivo(empresa), r.pdf);
      } catch (e) {
        falhas.push(`${empresa.nome}: ${e instanceof Error ? e.message : e}`);
      }
      setLote((l) => l && { ...l, feitas: l.feitas + 1 });
    }
    if (falhas.length < batem.length) {
      salvar(await zip.generateAsync({ type: "blob" }), `ISS Petropolis - ${aaaamm}.zip`);
    }
    setLote({ rodando: false, feitas: batem.length, total: batem.length, falhas });
    router.refresh();
  }

  const conferidas = Object.keys(resultados).length;
  const contagem = Object.values(resultados).reduce<Partial<Record<Status, number>>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const semAcesso = empresas.filter((e) => !e.temAcesso);
  const fechadas = empresas.filter((e) => e.fechamento).length;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" loading={conferindoTodas} onClick={conferirTodas}>
            Conferir todas ({empresas.length})
          </Button>
          {podeEmitir && (
            <Button
              type="button"
              variant="secondary"
              loading={lote?.rodando}
              disabled={batem.length === 0 || conferindoTodas}
              onClick={emitirEBaixarLote}
            >
              Emitir e baixar as que batem ({batem.length})
            </Button>
          )}
          <span className="text-xs text-foreground/50">
            Fechamento: {fechadas}/{empresas.length} marcadas
            {conferidas > 0 &&
              ` · Conferidas ${conferidas}: ` +
                (Object.entries(contagem) as [Status, number][])
                  .map(([s, n]) => `${n} ${STATUS_ROTULO[s].texto.toLowerCase()}`)
                  .join(", ")}
          </span>
        </div>
        <p className="text-xs text-foreground/50">
          Conferir é só leitura. Emitir consolida o movimento do mês na Prefeitura (definitivo) e baixa a guia — o
          sistema marca o fechamento sozinho. Guia emitida direto no site: use &ldquo;Marcar emitida por fora&rdquo;.
        </p>
        {lote && !lote.rodando && lote.falhas.length > 0 && (
          <Alert tone="danger">Falharam: {lote.falhas.join("; ")}</Alert>
        )}
        {lote?.rodando && (
          <p className="text-xs text-foreground/60">
            Emitindo/baixando {lote.feitas}/{lote.total}…
          </p>
        )}
        {semAcesso.length > 0 && (
          <Alert tone="warning">
            Sem CMC nem login da Prefeitura (configure em Impostos da empresa): {semAcesso.map((e) => e.nome).join(", ")}
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
              <th className="border-b border-border px-3 py-2 text-right">Prefeitura</th>
              <th className="border-b border-border px-3 py-2 text-right">ISS da guia</th>
              <th className="border-b border-border px-3 py-2 text-left">Situação</th>
              <th className="border-b border-border px-3 py-2 text-left">Fechamento</th>
              <th className="border-b border-border px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {empresas.map((empresa) => {
              const r = resultados[empresa.id];
              const ocupada = carregando.has(empresa.id);
              return (
                <tr key={empresa.id} className="align-top">
                  <td className="px-3 py-2">
                    <a href={`/admin/empresas/${empresa.id}/impostos?competencia=${competencia}`} className="hover:underline">
                      {empresa.nome}
                    </a>
                    {!empresa.temAcesso && (
                      <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        sem acesso
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(empresa.receitaSoma)}
                    {empresa.receitaRetidaSoma > 0 && (
                      <span className="block text-[10px] text-foreground/50">
                        {formatMoney(empresa.receitaRetidaSoma)} retido
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(empresa.issSoma)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(r?.resumo?.valorServicos)}
                    {r?.resumo && r.resumo.servicosRetidos > 0 && (
                      <span className="block text-[10px] text-foreground/50">
                        {formatMoney(r.resumo.servicosRetidos)} retido
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(r?.resumo?.valorIss)}
                    {r && r.status !== "erro" && (
                      <span className="block text-[10px] text-foreground/50">
                        {r.consolidado ? "consolidado" : "não consolidado"}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[340px] px-3 py-2">
                    {ocupada && !r && <span className="text-xs text-foreground/50">conferindo…</span>}
                    {r && (
                      <>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_ROTULO[r.status].classe}`}>
                          {STATUS_ROTULO[r.status].texto}
                        </span>
                        <p className="mt-1 text-xs text-foreground/70">{r.mensagem}</p>
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
                      {r?.consolidado && r.pdf && (
                        <Button type="button" variant="secondary" disabled={ocupada} onClick={() => emitirUma(empresa)}>
                          Baixar
                        </Button>
                      )}
                      {podeEmitir && r?.status === "falta_emitir" && (
                        <Button type="button" variant="secondary" disabled={ocupada} onClick={() => emitirUma(empresa)}>
                          Emitir e baixar
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
