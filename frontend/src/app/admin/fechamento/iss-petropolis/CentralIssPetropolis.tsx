"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FechamentoIssCelula, type FechamentoIssResumo } from "@/components/fechamento/FechamentoIssCelula";
import { salvarConferenciaIss } from "@/lib/actions/iss-conferencias";
import type { ConferenciaIssSalva } from "@/lib/iss-conferencias";

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
  // Retrato do faturamento da SOMA agora — vai junto ao salvar a conferência.
  assinaturaSoma: string;
  conferenciaSalva: ConferenciaIssSalva | null;
};

// valorServicos = Normal + Retido; valorIss = ISS só das Normais (o que vai na guia).
type Resumo = { valorServicos: number; valorIss: number; servicosRetidos: number; issRetido: number };

type Status = "ok" | "falta_emitir" | "diferenca" | "sem_movimento" | "erro";

type Resultado = {
  status: Status;
  mensagem: string;
  consolidado: boolean;
  resumo: Resumo | null;
  pdf: Blob | null; // guia já consolidada vem junto na conferência (não fica salvo)
  // Quando/quem conferiu (conferência salva) — ou o erro ao salvar.
  conferidoEm?: string;
  conferidoPor?: string | null;
  erroSalvar?: string;
};

const STATUS_VALIDOS = ["ok", "falta_emitir", "diferenca", "sem_movimento", "erro"];

// Conferência salva -> resultado da tela (sem o PDF: "Baixar" busca de novo).
function resultadoSalvo(salva: ConferenciaIssSalva): Resultado | null {
  const d = salva.dados as Partial<Resultado>;
  if (!STATUS_VALIDOS.includes(salva.status)) return null;
  return {
    status: salva.status as Status,
    mensagem: salva.mensagem ?? "",
    consolidado: d.consolidado ?? false,
    resumo: d.resumo ?? null,
    pdf: null,
    conferidoEm: salva.conferidoEm,
    conferidoPor: salva.conferidoPor,
  };
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const [resultados, setResultados] = useState<Record<string, Resultado>>(() => {
    const iniciais: Record<string, Resultado> = {};
    for (const e of empresas) {
      const r = e.conferenciaSalva && resultadoSalvo(e.conferenciaSalva);
      if (r) iniciais[e.id] = r;
    }
    return iniciais;
  });
  // Faturamento/cadastro mudou desde a conferência salva: reprocessar antes de emitir.
  const [desatualizadas, setDesatualizadas] = useState<Set<string>>(
    () => new Set(empresas.filter((e) => e.conferenciaSalva?.desatualizada).map((e) => e.id)),
  );
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

  // Mostra o resultado e salva a conferência (status + quando/quem), pra
  // central abrir com ela da próxima vez sem logar na Prefeitura.
  async function guardar(empresa: EmpresaIssPetropolis, resultado: Resultado): Promise<Resultado> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pdf, conferidoEm, conferidoPor, erroSalvar, ...dados } = resultado;
    let final: Resultado = resultado;
    try {
      const salvo = await salvarConferenciaIss({
        companyId: empresa.id,
        competencia,
        municipio: "petropolis",
        status: resultado.status,
        mensagem: resultado.mensagem,
        dados,
        assinaturaSoma: empresa.assinaturaSoma,
        faturamentoSoma: empresa.receitaSoma,
        issSoma: empresa.issSoma,
      });
      final = salvo.ok
        ? { ...dados, pdf, conferidoEm: salvo.conferidoEm, conferidoPor: salvo.conferidoPor }
        : { ...dados, pdf, erroSalvar: salvo.erro };
    } catch (e) {
      final = { ...dados, pdf, erroSalvar: e instanceof Error ? e.message : String(e) };
    }
    setResultados((atual) => ({ ...atual, [empresa.id]: final }));
    setDesatualizadas((atual) => {
      if (!atual.has(empresa.id)) return atual;
      const novo = new Set(atual);
      novo.delete(empresa.id);
      return novo;
    });
    return final;
  }

  async function conferir(empresa: EmpresaIssPetropolis) {
    marcar(empresa.id, true);
    try {
      await guardar(empresa, await conferirNaPrefeitura(empresa, competencia));
    } catch (e) {
      await guardar(empresa, {
        status: "erro",
        mensagem: e instanceof Error ? e.message : String(e),
        consolidado: false,
        resumo: null,
        pdf: null,
      });
    } finally {
      marcar(empresa.id, false);
    }
  }

  // Só as que ainda não têm conferência salva, deram erro ou ficaram
  // desatualizadas — as outras ficam como estão ("Reprocessar" na linha).
  const pendentes = empresas.filter(
    (e) => !resultados[e.id] || resultados[e.id].status === "erro" || desatualizadas.has(e.id),
  );

  // PDF da guia já consolidada: a conferência salva não guarda o arquivo,
  // então busca de novo na Prefeitura (só leitura).
  async function pdfDaGuia(empresa: EmpresaIssPetropolis, r: Resultado): Promise<Blob> {
    if (r.pdf) return r.pdf;
    const novo = await conferirNaPrefeitura(empresa, competencia);
    if (!novo.pdf) throw new Error(novo.status === "erro" ? novo.mensagem : "A Prefeitura não devolveu a guia.");
    setResultados((atual) => ({ ...atual, [empresa.id]: { ...atual[empresa.id], pdf: novo.pdf } }));
    return novo.pdf;
  }

  // Três por vez: o site da Prefeitura é lento e cada consulta faz login.
  async function conferirPendentes() {
    setConferindoTodas(true);
    const fila = [...pendentes];
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
    if (r.consolidado) {
      marcar(empresa.id, true);
      try {
        salvar(await pdfDaGuia(empresa, r), nomeArquivo(empresa));
      } catch (e) {
        setResultados((atual) => ({
          ...atual,
          [empresa.id]: { ...r, mensagem: `Falhou ao baixar: ${e instanceof Error ? e.message : e}` },
        }));
      } finally {
        marcar(empresa.id, false);
      }
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
      const emitido = await guardar(empresa, await emitirNaPrefeitura(empresa, competencia));
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

  const batem = empresas.filter(
    (e) => ["ok", "falta_emitir"].includes(resultados[e.id]?.status ?? "") && !desatualizadas.has(e.id),
  );
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
          r = await guardar(empresa, await emitirNaPrefeitura(empresa, competencia));
        }
        zip.file(nomeArquivo(empresa), await pdfDaGuia(empresa, r));
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
          <Button
            type="button"
            loading={conferindoTodas}
            disabled={pendentes.length === 0}
            onClick={conferirPendentes}
          >
            Conferir pendentes ({pendentes.length})
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
            {desatualizadas.size > 0 && ` · ${desatualizadas.size} desatualizada(s)`}
          </span>
        </div>
        <p className="text-xs text-foreground/50">
          Conferir é só leitura, e o resultado fica salvo: &ldquo;Conferir pendentes&rdquo; só roda as que ainda não
          foram conferidas, deram erro ou ficaram desatualizadas (o faturamento da SOMA mudou depois da
          conferência); pra refazer uma, use &ldquo;Reprocessar&rdquo; na linha. Emitir consolida o movimento do mês na Prefeitura (definitivo) e baixa a guia — o
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
              const desatualizada = desatualizadas.has(empresa.id);
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
                        {desatualizada && (
                          <span className="ml-1 rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
                            Desatualizada
                          </span>
                        )}
                        <p className="mt-1 text-xs text-foreground/70">{r.mensagem}</p>
                        {desatualizada && (
                          <p className="mt-1 text-xs text-warning">
                            O faturamento da SOMA mudou depois desta conferência — reprocesse antes de emitir.
                          </p>
                        )}
                        {r.conferidoEm && (
                          <p className="mt-1 text-[10px] text-foreground/50">
                            Conferido em {dataHora(r.conferidoEm)}
                            {r.conferidoPor && ` por ${r.conferidoPor}`}
                          </p>
                        )}
                        {r.erroSalvar && <p className="mt-1 text-[10px] text-danger">Não foi salvo: {r.erroSalvar}</p>}
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
                        {r ? "Reprocessar" : "Conferir"}
                      </Button>
                      {r?.consolidado && (
                        <Button type="button" variant="secondary" disabled={ocupada} onClick={() => emitirUma(empresa)}>
                          Baixar
                        </Button>
                      )}
                      {podeEmitir && r?.status === "falta_emitir" && !desatualizada && (
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
