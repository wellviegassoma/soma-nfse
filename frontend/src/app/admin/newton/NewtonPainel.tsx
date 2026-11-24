"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import JSZip from "jszip";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  aplicarEquiparacaoAction,
  aprovarNewtonAction,
  darfSalvoBase64Action,
  enviarMensagensNewtonAction,
  gerarDarfNewtonAction,
  marcarDctfwebNewtonAction,
  marcarEntregueNewtonAction,
  previaMensagensNewtonAction,
  revisarNewtonAction,
  aceitarMotivoNewtonAction,
  verificarPagamentoNewtonAction,
  type MensagemPreviaNewton,
} from "@/lib/actions/newton";
import { rotuloCompetencia, somarMeses } from "@/lib/tarefas-comum";
import { conferirPrefeituraUmaAction } from "@/lib/actions/serena";
import { buscarAgora } from "@/lib/actions/fechamento";
import type { EstadoEtapa } from "@/lib/serena";
import type { LinhaNewton } from "@/lib/newton";
import type { ResumoRotinaNewton } from "@/lib/newton-rotina";
import { BuscarTodasButton } from "../fechamento/BuscarTodasButton";
import { ConferirPrefeituraLoteButton } from "../fechamento/simples/ConferirPrefeituraLoteButton";
import { NewtonAvatar } from "./NewtonAvatar";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const COR: Record<EstadoEtapa, string> = {
  ok: "border-emerald-500 text-emerald-600",
  pendente: "border-amber-400 text-amber-500",
  problema: "border-rose-500 text-rose-600",
  na: "border-border text-foreground/30",
};
const ICONE: Record<EstadoEtapa, string> = { ok: "✓", pendente: "…", problema: "!", na: "–" };

type Filtro = "acao" | "newton" | "concluida" | "todas";

export function NewtonPainel({
  competencia,
  linhas,
  ultimaRotina,
  somenteLeitura = false,
}: {
  competencia: string;
  linhas: LinhaNewton[];
  equipe: { id: string; nome: string }[];
  revisores: string[];
  ultimaRotina: ResumoRotinaNewton | null;
  somenteLeitura?: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("acao");
  const [cidade, setCidade] = useState("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [emAndamento, iniciar] = useTransition();
  // Competência anterior ao Newton: tudo desabilitado (só consulta).
  const pendente = emAndamento || somenteLeitura;
  const [previa, setPrevia] = useState<{ tipo: "GUIA" | "COBRANCA"; mensagens: MensagemPreviaNewton[] } | null>(null);
  const [zipBaixado, setZipBaixado] = useState<string[] | null>(null);
  const [limiteRevisao, setLimiteRevisao] = useState("");
  const [equip, setEquip] = useState<{ l: LinhaNewton; escolha: Record<string, boolean>; duvida: "" | "SIM" | "NAO" } | null>(null);
  const abrirEquiparacao = (l: LinhaNewton) => {
    if (!l.equiparacao) return;
    const escolha: Record<string, boolean> = {};
    for (const n of l.equiparacao.notas) escolha[n.id] = n.sugestao === "DUVIDA" ? n.marcada : n.sugestao === "SIM";
    setEquip({ l, escolha, duvida: l.equiparacao.duvidaPadrao == null ? "" : l.equiparacao.duvidaPadrao ? "SIM" : "NAO" });
  };
  const salvarEquiparacao = () => {
    if (!equip?.l.equiparacao) return;
    const itens = equip.l.equiparacao.notas.map((n) => ({ notaId: n.id, hospitalar: !!equip.escolha[n.id] }));
    iniciar(async () => {
      const r = await aplicarEquiparacaoAction({ companyId: equip.l.id, itens, duvidaPadrao: equip.duvida === "" ? null : equip.duvida === "SIM" });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setEquip(null);
      router.refresh();
    });
  };
  const [ano, mes] = competencia.split("-");

  const conta = (f: Filtro) => (f === "todas" ? linhas.length : linhas.filter((l) => l.situacao === f).length);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => (filtro === "todas" || l.situacao === filtro) && (!cidade || l.municipio === cidade) && (!q || l.nome.toLowerCase().includes(q)));
  }, [linhas, filtro, cidade, busca]);

  const g = useMemo(() => {
    const iaAtual = (l: LinhaNewton) => l.newton?.ia_decisao && l.newton.ia_assinatura === l.assinatura;
    const temDarf = (l: LinhaNewton) => l.calc.total > 0.009;
    return {
      todas: linhas.map((l) => ({ id: l.id, nome: l.nome })),
      petropolis: linhas.filter((l) => l.municipio === "Petrópolis").map((l) => ({ id: l.id, nome: l.nome })),
      revisar: linhas.filter((l) => l.conferencia === "REVISAR" && !l.aprovada && !iaAtual(l)),
      recomendadas: linhas.filter((l) => !l.aprovada && l.conferencia === "REVISAR" && l.newton?.ia_decisao === "APROVAR" && l.newton.ia_assinatura === l.assinatura),
      encerrarMit: linhas.filter((l) => l.aprovada && !l.mitEncerrado),
      transmitirDctf: linhas.filter((l) => l.mitEncerrado && !l.newton?.dctfweb_transmitida_em),
      gerarDarf: linhas.filter((l) => l.newton?.dctfweb_transmitida_em && temDarf(l) && !l.newton.darf_gerado_em),
      zip: linhas.filter((l) => l.newton?.darf_gerado_em && !l.newton.entregue_em),
      guia: linhas.filter((l) => l.newton?.entregue_em && !l.newton.mensagem_guia_em && l.temGrupoDigisac),
      verificar: linhas.filter((l) => l.newton?.entregue_em && temDarf(l) && !l.newton.pago),
      cobrar: linhas.filter((l) => l.newton?.entregue_em && l.newton.pago === false && !l.newton.mensagem_cobranca_em && l.temGrupoDigisac),
    };
  }, [linhas]);

  const tot = useMemo(
    () => ({
      aprovadas: linhas.filter((l) => l.aprovada).length,
      mit: linhas.filter((l) => l.mitEncerrado).length,
      receita: linhas.reduce((s, l) => s + l.calc.receitaMes, 0),
      total: linhas.reduce((s, l) => s + l.calc.total, 0),
      pisCofins: linhas.reduce((s, l) => s + l.calc.devido.pis + l.calc.devido.cofins, 0),
      darfs: linhas.filter((l) => l.newton?.darf_gerado_em).length,
      comDarf: linhas.filter((l) => l.calc.total > 0.009).length,
      entregues: linhas.filter((l) => l.newton?.entregue_em).length,
      pagos: linhas.filter((l) => l.newton?.pago).length,
      fechaTrimestre: linhas.some((l) => l.calc.fechaTrimestre),
    }),
    [linhas],
  );

  const emLote = async <T,>(itens: T[], rotulo: string, fn: (i: T) => Promise<string | null>) => {
    const erros: string[] = [];
    for (const [k, i] of itens.entries()) {
      setProgresso(`${rotulo} ${k + 1} de ${itens.length}…`);
      const e = await fn(i);
      if (e) erros.push(e);
    }
    setProgresso(null);
    return erros;
  };
  const fim = (erros: string[], ok: string) => {
    setMsg(erros.length ? { erro: `${erros.length} com erro: ${erros.slice(0, 3).join("; ")}` } : { ok });
    router.refresh();
  };

  const revisar = () =>
    iniciar(async () => {
      let ap = 0;
      let es = 0;
      let custo = 0;
      const n = Number(limiteRevisao);
      const ids = g.revisar.map((l) => l.id).slice(0, n > 0 ? n : undefined);
      for (let i = 0; i < ids.length; i += 5) {
        setProgresso(`Newton revisando ${Math.min(i + 5, ids.length)} de ${ids.length}…`);
        const r = await revisarNewtonAction({ competencia, companyIds: ids.slice(i, i + 5) });
        if ("error" in r) {
          setMsg({ erro: r.error });
          setProgresso(null);
          return;
        }
        ap += r.aprovadas;
        es += r.escaladas;
        custo += r.custoUsd;
      }
      setProgresso(null);
      setMsg({ ok: `Newton revisou ${ids.length}: recomenda aprovar ${ap}, passou ${es} para a equipe (custo ~US$ ${custo.toFixed(2)}).` });
      router.refresh();
    });

  const aprovar = (lista: LinhaNewton[], rotulo: string) => {
    if (!window.confirm(`${rotulo}: aprovar o cálculo de ${lista.length} empresa(s)? Você é quem confirma.`)) return;
    iniciar(async () => {
      const r = await aprovarNewtonAction({ competencia, itens: lista.map((l) => ({ companyId: l.id, assinatura: l.assinatura })) });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      router.refresh();
    });
  };

  // Encerrar o MIT é transmissão oficial — confirmação, empresa a empresa, rota existente.
  const encerrarMit = () => {
    const total = g.encerrarMit.reduce((t, l) => t + l.calc.total, 0);
    if (!window.confirm(`Encerrar oficialmente o MIT de ${g.encerrarMit.length} empresa(s) (${brl(total)} em PIS/COFINS/IRPJ/CSLL) na competência ${rotuloCompetencia(competencia)}? É uma transmissão de verdade por empresa.`)) return;
    iniciar(async () => {
      const erros = await emLote(g.encerrarMit, "Encerrando MIT", async (l) => {
        try {
          const r = await fetch(`/admin/empresas/${l.id}/integra-contador/mit/declarar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ competencia, transmissaoImediata: false }),
          });
          const corpo = await r.json().catch(() => null);
          return r.ok && corpo?.protocoloEncerramento ? null : `${l.nome}: ${corpo?.error ?? `HTTP ${r.status}`}`;
        } catch {
          return `${l.nome}: sem resposta`;
        }
      });
      fim(erros, "MIT encerrado — próximo passo: transmitir a DCTFWeb.");
    });
  };

  const transmitirDctf = () => {
    if (!window.confirm(`Transmitir a DCTFWeb de ${g.transmitirDctf.length} empresa(s) (${rotuloCompetencia(competencia)})? A DCTFWeb junta o MIT e a folha do eSocial — é a declaração oficial.`)) return;
    iniciar(async () => {
      const erros = await emLote(g.transmitirDctf, "Transmitindo DCTFWeb", async (l) => {
        try {
          const r = await fetch(`/admin/empresas/${l.id}/integra-contador/dctfweb/transmitir/${ano}/${mes}`, { method: "POST" });
          const corpo = await r.json().catch(() => null);
          if (!r.ok) return `${l.nome}: ${corpo?.error ?? `HTTP ${r.status}`}`;
          const s = await marcarDctfwebNewtonAction({ companyId: l.id, competencia });
          return "error" in s ? `${l.nome}: ${s.error}` : null;
        } catch {
          return `${l.nome}: sem resposta`;
        }
      });
      fim(erros, "DCTFWeb transmitida — próximo passo: gerar e salvar os DARF.");
    });
  };

  const gerarDarf = () => {
    if (!window.confirm(`Gerar e salvar ${g.gerarDarf.length} DARF? Cada geração é uma consulta cobrada do Integra Contador (só uma vez por empresa).`)) return;
    iniciar(async () => {
      const erros = await emLote(g.gerarDarf, "Gerando DARF", async (l) => {
        const r = await gerarDarfNewtonAction({ companyId: l.id, competencia });
        return "error" in r ? `${l.nome}: ${r.error}` : null;
      });
      fim(erros, "DARF gerados e salvos.");
    });
  };

  const baixarZip = () =>
    iniciar(async () => {
      const zip = new JSZip();
      const ok: string[] = [];
      const erros = await emLote(g.zip, "Montando ZIP", async (l) => {
        const r = await darfSalvoBase64Action({ companyId: l.id, competencia });
        if ("error" in r) return `${l.nome}: ${r.error}`;
        zip.file(`${l.nome.replace(/[\\/:*?"<>|]/g, "")} - DARF ${competencia}.pdf`, r.base64, { base64: true });
        ok.push(l.id);
        return null;
      });
      if (ok.length) {
        const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `newton-darf-${competencia}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setZipBaixado(ok);
      }
      setMsg(erros.length ? { erro: `${erros.length} sem arquivo: ${erros.slice(0, 3).join("; ")}` } : { ok: `ZIP com ${ok.length} empresa(s) baixado — suba no eContador e marque como entregue.` });
    });

  const marcarEntregue = () =>
    iniciar(async () => {
      const r = await marcarEntregueNewtonAction({ competencia, companyIds: zipBaixado ?? [] });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setZipBaixado(null);
      router.refresh();
    });

  const prepararMensagens = (tipo: "GUIA" | "COBRANCA") =>
    iniciar(async () => {
      const itens = (tipo === "GUIA" ? g.guia : g.cobrar).map((l) => ({
        companyId: l.id,
        empresa: l.nome.replace(/^\d+ · /, ""),
        total: l.calc.total,
        comIrpj: l.calc.devido.irpj + l.calc.devido.csll > 0,
      }));
      const r = await previaMensagensNewtonAction({ competencia, tipo, itens });
      if ("error" in r) setMsg({ erro: r.error });
      else setPrevia({ tipo, mensagens: r.mensagens });
    });

  const enviarMensagens = () => {
    if (!previa) return;
    if (!window.confirm(`Enviar ${previa.mensagens.length} mensagem(ns) nos grupos do WhatsApp (Digisac)?`)) return;
    iniciar(async () => {
      const r = await enviarMensagensNewtonAction({ competencia, tipo: previa.tipo, mensagens: previa.mensagens.map((m) => ({ companyId: m.companyId, texto: m.texto })) });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setPrevia(null);
      router.refresh();
    });
  };

  const verificarPagamentos = () => {
    if (!window.confirm(`Verificar o pagamento de ${g.verificar.length} DARF? Cada consulta à Receita (Integra Contador) é cobrada.`)) return;
    iniciar(async () => {
      const erros = await emLote(g.verificar, "Verificando pagamento", async (l) => {
        const r = await verificarPagamentoNewtonAction({ companyId: l.id, competencia });
        return "error" in r ? `${l.nome}: ${r.error}` : null;
      });
      fim(erros, "Pagamentos verificados.");
    });
  };

  // ---------------------------------------------- ações de uma empresa só
  // (clique na etapa ou no motivo — sempre com confirmação).
  const rodar = (fn: () => Promise<{ ok: true; mensagem?: string } | { error: string } | string | null>, ok: string) =>
    iniciar(async () => {
      const r = await fn();
      if (typeof r === "string") setMsg({ erro: r });
      else if (r && "error" in r) setMsg({ erro: r.error });
      else setMsg({ ok: (r && "mensagem" in r && r.mensagem) || ok });
      router.refresh();
    });

  const aceitarMotivo = (l: LinhaNewton, m: { codigo: string; texto: string }) => {
    const just = window.prompt(`Aceitar e seguir — ${l.nome}\n\n${m.texto}\n\nJustificativa (fica registrada):`, m.codigo.startsWith("PREFEITURA") ? "Erro da prefeitura — fechar com base nas notas do portal." : "");
    if (just === null) return;
    rodar(() => aceitarMotivoNewtonAction({ companyId: l.id, competencia, codigo: m.codigo, justificativa: just.trim() || null }), "Motivo aceito.");
  };

  const acaoEtapa = (l: LinhaNewton, chave: string) => {
    const nome = l.nome;
    const travado = somenteLeitura && ["mit", "dctfweb", "darf", "entrega", "pagamento"].includes(chave);
    if (travado) return setMsg({ erro: "Competência anterior ao Newton: só consulta." });
    if (chave === "notas") {
      if (!window.confirm(`Buscar agora as notas de ${nome} (${rotuloCompetencia(competencia)})?`)) return;
      const fd = new FormData();
      fd.set("companyId", l.id);
      fd.set("competencia", competencia);
      return rodar(async () => {
        const r = await buscarAgora(undefined, fd);
        return r?.error ?? { ok: true as const, mensagem: "Notas buscadas." };
      }, "Notas buscadas.");
    }
    if (chave === "prefeitura") {
      if (l.municipio !== "Petrópolis") return setMsg({ erro: "No Rio a conferência do ISS é na Central ISS Rio." });
      if (!window.confirm(`Conferir agora o faturamento de ${nome} com a Prefeitura de Petrópolis? (só consulta)`)) return;
      return rodar(() => conferirPrefeituraUmaAction({ companyId: l.id, competencia }), "Conferido.");
    }
    if (chave === "conferencia" || chave === "calculo") {
      if (l.aprovada) return setMsg({ ok: `${nome}: cálculo já liberado.` });
      if (l.conferencia === "BLOQUEADO") return setMsg({ erro: `${nome}: tem bloqueio — use "aceitar" no motivo, abaixo do recado.` });
      return aprovar([l], nome);
    }
    if (chave === "mit") {
      if (l.mitEncerrado) return setMsg({ ok: `${nome}: MIT já encerrado.` });
      if (!l.aprovada) return setMsg({ erro: `${nome}: aprove o cálculo (ou aceite os motivos) antes do MIT.` });
      if (!window.confirm(`Encerrar oficialmente o MIT de ${nome} (${rotuloCompetencia(competencia)}) — ${brl(l.calc.total)}? É transmissão de verdade.`)) return;
      return rodar(async () => {
        const r = await fetch(`/admin/empresas/${l.id}/integra-contador/mit/declarar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competencia, transmissaoImediata: false }),
        });
        const corpo = await r.json().catch(() => null);
        return r.ok && corpo?.protocoloEncerramento ? { ok: true as const, mensagem: "MIT encerrado." } : (corpo?.error ?? `HTTP ${r.status}`);
      }, "MIT encerrado.");
    }
    if (chave === "dctfweb") {
      if (l.newton?.dctfweb_transmitida_em) return setMsg({ ok: `${nome}: DCTFWeb já transmitida.` });
      if (!l.mitEncerrado) return setMsg({ erro: `${nome}: encerre o MIT antes da DCTFWeb.` });
      if (!window.confirm(`Transmitir a DCTFWeb de ${nome} (${rotuloCompetencia(competencia)})? Junta o MIT e a folha do eSocial — confirme que o DP já fechou a folha.`)) return;
      return rodar(async () => {
        const r = await fetch(`/admin/empresas/${l.id}/integra-contador/dctfweb/transmitir/${ano}/${mes}`, { method: "POST" });
        const corpo = await r.json().catch(() => null);
        if (!r.ok) return corpo?.error ?? `HTTP ${r.status}`;
        return marcarDctfwebNewtonAction({ companyId: l.id, competencia });
      }, "DCTFWeb transmitida.");
    }
    if (chave === "darf") {
      if (l.calc.total <= 0.009) return setMsg({ ok: `${nome}: sem DARF neste mês.` });
      if (!l.newton?.dctfweb_transmitida_em) return setMsg({ erro: `${nome}: transmita a DCTFWeb antes do DARF.` });
      if (l.newton.darf_gerado_em) return setMsg({ ok: `${nome}: DARF já salvo.` });
      if (!window.confirm(`Gerar e salvar o DARF de ${nome}? (consulta cobrada do Integra Contador, uma vez)`)) return;
      return rodar(() => gerarDarfNewtonAction({ companyId: l.id, competencia }), "DARF salvo.");
    }
    if (chave === "entrega") {
      if (!l.newton?.darf_gerado_em) return setMsg({ erro: `${nome}: gere o DARF antes.` });
      return iniciar(async () => {
        const r = await darfSalvoBase64Action({ companyId: l.id, competencia });
        if ("error" in r) return setMsg({ erro: r.error });
        const a = document.createElement("a");
        a.href = `data:application/pdf;base64,${r.base64}`;
        a.download = `${nome.replace(/[\\/:*?"<>|]/g, "")} - DARF ${competencia}.pdf`;
        a.click();
        if (!l.newton?.entregue_em && window.confirm(`PDF baixado. Marcar ${nome} como entregue no eContador?`)) {
          const m = await marcarEntregueNewtonAction({ competencia, companyIds: [l.id] });
          setMsg("error" in m ? { erro: m.error } : { ok: m.mensagem });
          router.refresh();
        }
      });
    }
    if (chave === "pagamento") {
      if (!l.newton?.entregue_em || l.calc.total <= 0.009) return setMsg({ erro: `${nome}: nada a verificar ainda.` });
      if (!window.confirm(`Verificar o pagamento do DARF de ${nome}? (consulta cobrada)`)) return;
      return rodar(() => verificarPagamentoNewtonAction({ companyId: l.id, competencia }), "Pagamento verificado.");
    }
  };

  const btn = "rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-40";
  const btnP = "rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-40";
  const passo = (n: number) => <span className="text-xs text-foreground/50">{n}.</span>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <NewtonAvatar tamanho={52} />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Newton · Lucro Presumido</h1>
              <div className="text-xs text-foreground/50">Analista fiscal (IA) da SOMA</div>
            </div>
          </div>
          <p className="text-sm text-foreground/60">
            Carteira de IA: empresas do Lucro Presumido de Petrópolis e do Rio ({linhas.length}; filial entra na matriz). Casos que o Newton não resolve vão para a equipe do Fiscal.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/newton?competencia=${somarMeses(competencia, -1)}`} className="rounded-lg border border-border px-2 py-1">
            ‹
          </Link>
          <span className="font-semibold">Competência {rotuloCompetencia(competencia)}</span>
          <Link href={`/admin/newton?competencia=${somarMeses(competencia, 1)}`} className="rounded-lg border border-border px-2 py-1">
            ›
          </Link>
        </div>
      </div>

      {somenteLeitura && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Competência anterior ao Newton (ele assume a partir de novembro/2026): esta foi declarada pela equipe por fora — a tela fica só para consulta, sem transmitir nada.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Apuração</div>
          <div className="text-lg font-semibold">
            {tot.aprovadas}/{linhas.length} liberadas
          </div>
          <div className="text-xs text-foreground/60">
            {tot.mit} MIT encerrado(s) · {tot.fechaTrimestre ? "mês de IRPJ/CSLL do trimestre" : "mês só de PIS/COFINS (IRPJ/CSLL no fim do trimestre)"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Valores</div>
          <div className="text-lg font-semibold">{brl(tot.receita)}</div>
          <div className="text-xs text-foreground/60">
            {brl(tot.total)} de federais ({brl(tot.pisCofins)} PIS/COFINS)
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Conclusão</div>
          <div className="text-lg font-semibold">
            {tot.darfs}/{tot.comDarf} DARF gerados
          </div>
          <div className="text-xs text-foreground/60">
            {tot.entregues} entregues · {tot.pagos} pagos
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">Fluxo do mês (na ordem)</div>
          <div className="text-xs text-foreground/60">
            {ultimaRotina
              ? `Rotina automática: última em ${new Date(ultimaRotina.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${ultimaRotina.conferidas} conferida(s), ${ultimaRotina.revisadas} revisada(s) (${ultimaRotina.aprovadas} para aprovar, ${ultimaRotina.escaladas} para a equipe)${ultimaRotina.faltamRevisar ? `, faltam ${ultimaRotina.faltamRevisar}` : ""}${ultimaRotina.erro ? ` · erro: ${ultimaRotina.erro}` : ""}`
              : "Rotina automática: confere a prefeitura e revisa com IA (dias 1–25) — ainda não rodou."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {passo(1)}
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <BuscarTodasButton competencia={competencia} empresas={g.todas} />
          </div>
          {passo(2)}
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <ConferirPrefeituraLoteButton competencia={competencia} empresas={g.petropolis} />
          </div>
          {passo(3)}
          <button type="button" className={btnP} disabled={pendente || !g.revisar.length} onClick={revisar}>
            Newton revisar ({limiteRevisao && Number(limiteRevisao) > 0 ? `${Math.min(Number(limiteRevisao), g.revisar.length)} de ` : ""}
            {g.revisar.length})
          </button>
          <input
            type="number"
            min={1}
            value={limiteRevisao}
            onChange={(e) => setLimiteRevisao(e.target.value)}
            placeholder="todas"
            title="Quantas revisar agora (vazio = todas)"
            className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-xs"
          />
          {passo(4)}
          <button type="button" className={btn} disabled={pendente || !g.recomendadas.length} onClick={() => aprovar(g.recomendadas, "Recomendações do Newton")}>
            Aprovar recomendações ({g.recomendadas.length})
          </button>
          {passo(5)}
          <button type="button" className={btnP} disabled={pendente || !g.encerrarMit.length} onClick={encerrarMit}>
            Encerrar MIT ({g.encerrarMit.length})
          </button>
          {passo(6)}
          <button type="button" className={btn} disabled={pendente || !g.transmitirDctf.length} onClick={transmitirDctf}>
            Transmitir DCTFWeb ({g.transmitirDctf.length})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {passo(7)}
          <button type="button" className={btn} disabled={pendente || !g.gerarDarf.length} onClick={gerarDarf}>
            Gerar e salvar DARF ({g.gerarDarf.length})
          </button>
          {passo(8)}
          <button type="button" className={btn} disabled={pendente || !g.zip.length} onClick={baixarZip}>
            Baixar ZIP para o eContador ({g.zip.length})
          </button>
          {zipBaixado && (
            <button type="button" className={btnP} disabled={pendente} onClick={marcarEntregue}>
              Marcar {zipBaixado.length} como entregues
            </button>
          )}
          {passo(9)}
          <button type="button" className={btn} disabled={pendente || !g.guia.length} onClick={() => prepararMensagens("GUIA")}>
            Mensagem &quot;guia disponível&quot; ({g.guia.length})
          </button>
          {passo(10)}
          <button type="button" className={btn} disabled={pendente || !g.verificar.length} onClick={verificarPagamentos}>
            Verificar pagamentos ({g.verificar.length})
          </button>
          {passo(11)}
          <button type="button" className={btn} disabled={pendente || !g.cobrar.length} onClick={() => prepararMensagens("COBRANCA")}>
            Cobrança no Digisac ({g.cobrar.length})
          </button>
        </div>
        <div className="text-[11px] text-foreground/50">
          ISS do Presumido é guia municipal, fora do DARF: Central ISS{" "}
          <Link href={`/admin/fechamento/iss-petropolis?competencia=${competencia}`} className="underline">
            Petrópolis
          </Link>{" "}
          e{" "}
          <Link href={`/admin/fechamento/iss-rio?competencia=${competencia}`} className="underline">
            Rio
          </Link>
          .
        </div>
        {(progresso || msg) && <div className={cn("text-sm", msg?.erro ? "text-danger" : "text-foreground/70")}>{progresso ?? msg?.erro ?? msg?.ok}</div>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["acao", "Precisa de ação"],
            ["newton", "Com o Newton"],
            ["concluida", "Concluídas"],
            ["todas", "Todas"],
          ] as [Filtro, string][]
        ).map(([f, r]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn("rounded-lg px-3 py-1.5 text-sm", filtro === f ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-foreground/70")}
          >
            {r} <strong>{conta(f)}</strong>
          </button>
        ))}
        <select value={cidade} onChange={(e) => setCidade(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
          <option value="">Petrópolis e Rio</option>
          <option value="Petrópolis">Petrópolis</option>
          <option value="Rio de Janeiro">Rio de Janeiro</option>
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa" className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm" />
      </div>

      <Card className="divide-y divide-border">
        {visiveis.length === 0 && <div className="p-6 text-center text-sm text-foreground/60">Nada aqui.</div>}
        {visiveis.map((l) => {
          const d = l.calc.devido;
          return (
            <div key={l.id} className="flex min-w-0 flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
              <div className="w-full shrink-0 lg:w-56">
                <div className="truncate text-sm font-medium" title={l.nome}>
                  {l.nome}
                </div>
                {(l.issFixo || l.equiparacaoCadastro) && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {l.issFixo && <span className="rounded bg-indigo-50 px-1.5 py-px text-[10px] font-medium text-indigo-800">ISS fixo</span>}
                    {l.equiparacaoCadastro && <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-800">Equiparação hospitalar</span>}
                  </div>
                )}
                <div className="text-[11px] text-foreground/50">
                  {l.municipio}
                  {l.filiais.length ? ` · + ${l.filiais.length} filial` : ""} · PIS {brl(d.pis)} · COFINS {brl(d.cofins)}
                  {l.calc.fechaTrimestre ? ` · IRPJ ${brl(d.irpj)} · CSLL ${brl(d.csll)}` : ""}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-start overflow-x-auto">
                {l.etapas.map((e, i) => (
                  <div key={e.chave} className="flex min-w-[84px] flex-1 items-start">
                    <button
                      type="button"
                      disabled={emAndamento}
                      onClick={() => acaoEtapa(l, e.chave)}
                      title={`Clique para executar: ${e.nome}`}
                      className="flex flex-1 flex-col items-center rounded-lg text-center hover:bg-surface-muted disabled:opacity-60"
                    >
                      <div className="text-[10px] text-foreground/50">{e.nome}</div>
                      <div className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold", COR[e.estado])}>{ICONE[e.estado]}</div>
                      <div className="mt-0.5 text-[11px] font-medium leading-tight">{e.titulo}</div>
                      {e.detalhe && <div className="text-[10px] leading-tight text-foreground/50">{e.detalhe}</div>}
                    </button>
                    {i < l.etapas.length - 1 && <div className={cn("mt-[22px] h-0.5 w-3 shrink-0", e.estado === "ok" ? "bg-emerald-400" : "bg-border")} />}
                  </div>
                ))}
              </div>
              <div className="w-full shrink-0 lg:w-72">
                <div
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs",
                    l.situacao === "acao" ? "bg-amber-50 text-amber-900" : l.situacao === "concluida" ? "bg-emerald-50 text-emerald-900" : "bg-sky-50 text-sky-900",
                  )}
                >
                  <span className="inline-flex items-center gap-1 align-middle font-semibold">
                    <NewtonAvatar tamanho={16} selo={false} /> Newton:
                  </span>{" "}
                  {l.recado}
                  {l.newton?.ia_acoes && l.newton.ia_acoes.length > 0 && l.newton.ia_assinatura === l.assinatura && !l.aprovada && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {l.newton.ia_acoes.map((a, i) => (
                        <li key={i}>
                          →{" "}
                          {a.onde.startsWith("/") ? (
                            <Link href={a.onde} className="underline">
                              {a.acao}
                            </Link>
                          ) : (
                            `${a.acao} (${a.onde})`
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {l.motivos.length > 0 && !l.aprovada && (
                  <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
                    {l.motivos.map((m) => (
                      <li key={m.codigo} className="flex items-start gap-1">
                        <span className={cn("shrink-0 rounded px-1", m.nivel === "BLOQUEADO" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>{m.nivel === "BLOQUEADO" ? "bloqueio" : "revisar"}</span>
                        <span className="flex-1 text-foreground/70">{m.texto}</span>
                        <button type="button" disabled={emAndamento} onClick={() => aceitarMotivo(l, m)} className="shrink-0 rounded border border-border px-1 font-medium text-brand hover:bg-surface-muted">
                          aceitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {l.motivosAceitos.length > 0 && (
                  <div className="mt-1 text-[10px] text-foreground/50">
                    Aceito pela equipe: {l.motivosAceitos.map((m) => `${m.codigo}${m.justificativa ? ` (${m.justificativa})` : ""}`).join("; ")}
                  </div>
                )}
                {l.equiparacao && (
                  <div className={cn("mt-1 rounded-lg px-2.5 py-1 text-[11px]", l.equiparacao.naturezaImpede ? "bg-rose-50 text-rose-900" : l.equiparacao.pendentes ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900")}>
                    Equiparação no trimestre:{" "}
                    {brl(l.equiparacao.notas.filter((n) => n.marcada).reduce((t, n) => t + n.valor, 0))} marcado ·{" "}
                    {brl(l.equiparacao.notas.filter((n) => n.sugestao === "SIM").reduce((t, n) => t + n.valor, 0))} sugerido
                    {l.equiparacao.pendentes ? ` · ${l.equiparacao.pendentes} nota(s) para confirmar` : " · em dia"}
                    {l.equiparacao.naturezaImpede ? ` · ⚠ ${l.equiparacao.naturezaImpede}` : ""}{" "}
                    <button type="button" className="ml-1 rounded border border-current px-1.5 py-px font-medium" disabled={emAndamento} onClick={() => abrirEquiparacao(l)}>
                      revisar equiparação
                    </button>
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
                  <Link href={`/admin/empresas/${l.id}/impostos?competencia=${competencia}`} className="text-brand underline">
                    Impostos
                  </Link>
                  <Link href={`/admin/empresas/${l.id}/fechamento?competencia=${competencia}`} className="text-brand underline">
                    Notas do mês
                  </Link>
                  {l.newton?.tarefa_id && (
                    <Link href={`/admin/empresas/${l.id}/tarefas`} className="text-brand underline">
                      tarefa da equipe
                    </Link>
                  )}
                  {l.conferencia === "REVISAR" && !l.aprovada && (
                    <button type="button" className="text-brand underline" disabled={pendente} onClick={() => aprovar([l], l.nome)}>
                      aprovar
                    </button>
                  )}
                  {!l.temGrupoDigisac && <span className="text-foreground/50">sem grupo no Digisac</span>}
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {equip?.l.equiparacao && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => setEquip(null)}>
          <div className="mt-8 w-full max-w-4xl rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-semibold">Equiparação hospitalar — {equip.l.nome}</h2>
            <p className="mb-2 text-xs text-foreground/60">
              Notas do trimestre até {rotuloCompetencia(competencia)} com a sugestão do Newton (regra + o que a equipe já decidiu). Marcado = 8% IRPJ / 12% CSLL. Ao salvar, cada decisão vale para as próximas notas com a mesma descrição.
            </p>
            {equip.l.equiparacao.naturezaImpede && (
              <div className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-900">
                ⚠ A empresa é {equip.l.equiparacao.naturezaImpede}: a lei exige sociedade empresária para a equiparação. Confirme com o contador antes de marcar.
              </div>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
              <span>
                Marcado: <strong>{brl(equip.l.equiparacao.notas.filter((n) => equip.escolha[n.id]).reduce((t, n) => t + n.valor, 0))}</strong> de{" "}
                {brl(equip.l.equiparacao.notas.reduce((t, n) => t + n.valor, 0))}
              </span>
              <label className="flex items-center gap-1">
                Descrição genérica (dúvida) nesta empresa:
                <select value={equip.duvida} onChange={(e) => setEquip({ ...equip, duvida: e.target.value as "" | "SIM" | "NAO" })} className="h-7 rounded border border-border bg-surface px-1">
                  <option value="">perguntar</option>
                  <option value="SIM">entra</option>
                  <option value="NAO">não entra</option>
                </select>
              </label>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-muted text-left text-foreground/60">
                  <tr>
                    <th className="px-2 py-1">Hosp.</th>
                    <th className="px-2 py-1">Mês</th>
                    <th className="px-2 py-1">Nota</th>
                    <th className="px-2 py-1">Descrição</th>
                    <th className="px-2 py-1 text-right">Valor</th>
                    <th className="px-2 py-1">Sugestão</th>
                  </tr>
                </thead>
                <tbody>
                  {equip.l.equiparacao.notas.map((n) => (
                    <tr key={n.id} className={cn("border-t border-border", n.sugestao === "DUVIDA" && "bg-amber-50/60")}>
                      <td className="px-2 py-1">
                        <input type="checkbox" checked={!!equip.escolha[n.id]} onChange={(e) => setEquip({ ...equip, escolha: { ...equip.escolha, [n.id]: e.target.checked } })} />
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">{n.competencia.slice(5)}/{n.competencia.slice(2, 4)}</td>
                      <td className="px-2 py-1">{n.numero ?? "—"}</td>
                      <td className="px-2 py-1" title={n.tomador ?? ""}>
                        {n.descricao.slice(0, 110)}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">{brl(n.valor)}</td>
                      <td className="px-2 py-1 whitespace-nowrap" title={n.motivo}>
                        <span className={cn("rounded px-1", n.sugestao === "SIM" ? "bg-emerald-100 text-emerald-900" : n.sugestao === "NAO" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-900")}>
                          {n.sugestao === "SIM" ? "entra" : n.sugestao === "NAO" ? "não entra" : "dúvida"}
                        </span>{" "}
                        <span className="text-foreground/50">{n.origem === "APRENDIDA" ? "já decidido" : n.origem === "PADRAO_EMPRESA" ? "padrão" : n.motivo.slice(0, 28)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setEquip(null)}>
                Cancelar
              </button>
              <button type="button" className={btnP} disabled={emAndamento} onClick={salvarEquiparacao}>
                Confirmar e marcar
              </button>
            </div>
          </div>
        </div>
      )}

      {previa && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => setPrevia(null)}>
          <div className="mt-10 w-full max-w-2xl rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-semibold">{previa.tipo === "GUIA" ? "Mensagem: guia disponível" : "Mensagem: cobrança"}</h2>
            <p className="mb-3 text-xs text-foreground/60">Revise e ajuste antes de enviar. Vai para o grupo do WhatsApp de cada cliente (Digisac).</p>
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              {previa.mensagens.map((m, i) => (
                <div key={m.companyId} className="rounded-lg border border-border p-2">
                  <div className="mb-1 text-xs font-medium">
                    {m.empresa} <span className="text-foreground/50">→ {m.grupo ?? "sem grupo"}</span>
                  </div>
                  <textarea
                    value={m.texto}
                    rows={3}
                    onChange={(e) => setPrevia({ ...previa, mensagens: previa.mensagens.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                    className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setPrevia(null)}>
                Cancelar
              </button>
              <button type="button" className={btnP} disabled={pendente} onClick={enviarMensagens}>
                Enviar {previa.mensagens.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
