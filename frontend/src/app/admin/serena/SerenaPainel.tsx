"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import JSZip from "jszip";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  aprovarRecomendacoesAction,
  dasSalvoBase64Action,
  enviarMensagensAction,
  gerarDasSerenaAction,
  guiasEmitidasBase64Action,
  salvarGuiaEmitidaAction,
  salvarLeituraGuiasRioAction,
  marcarEntregueAction,
  previaMensagensAction,
  revisarSerenaAction,
  aceitarMotivoSerenaAction,
  conferirPrefeituraUmaAction,
  type MensagemPrevia,
} from "@/lib/actions/serena";
import { rotuloCompetencia, somarMeses } from "@/lib/tarefas-comum";
import { buscarAgora } from "@/lib/actions/fechamento";
import type { EstadoEtapa, LinhaSerena } from "@/lib/serena";
import type { ResumoRotina } from "@/lib/serena-rotina";
import { BuscarTodasButton } from "../fechamento/BuscarTodasButton";
import { SerenaAvatar } from "./SerenaAvatar";
import { ConferirPrefeituraLoteButton } from "../fechamento/simples/ConferirPrefeituraLoteButton";
import { EnviarSimplesLoteButton } from "../fechamento/simples/EnviarSimplesLoteButton";

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

type Filtro = "acao" | "serena" | "concluida" | "todas";

export function SerenaPainel({
  competencia,
  linhas,
  ultimaRotina,
}: {
  competencia: string;
  linhas: LinhaSerena[];
  equipe: { id: string; nome: string }[];
  revisores: string[];
  ultimaRotina: ResumoRotina | null;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("acao");
  const [cidade, setCidade] = useState("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [previa, setPrevia] = useState<{ tipo: "GUIA" | "COBRANCA"; mensagens: MensagemPrevia[] } | null>(null);
  const [zipBaixado, setZipBaixado] = useState<string[] | null>(null);
  const [limiteRevisao, setLimiteRevisao] = useState("");

  const conta = (f: Filtro) => (f === "todas" ? linhas.length : linhas.filter((l) => l.situacao === f).length);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (l) => (filtro === "todas" || l.situacao === filtro) && (!cidade || l.municipio === cidade) && (!q || l.nome.toLowerCase().includes(q)),
    );
  }, [linhas, filtro, cidade, busca]);

  // Grupos para as ações em lote (sempre sobre a carteira inteira).
  const g = useMemo(() => {
    const iaAtual = (l: LinhaSerena) => l.serena?.ia_decisao && l.serena.ia_assinatura === l.assinatura;
    return {
      todas: linhas.map((l) => ({ id: l.id, nome: l.nome })),
      petropolis: linhas.filter((l) => l.municipio === "Petrópolis").map((l) => ({ id: l.id, nome: l.nome })),
      revisar: linhas.filter((l) => l.conferencia === "REVISAR" && !l.aprovada && !iaAtual(l)),
      recomendadas: linhas.filter((l) => !l.aprovada && l.serena?.ia_decisao === "APROVAR" && l.serena.ia_assinatura === l.assinatura),
      transmitir: linhas.filter((l) => l.aprovada && !l.declarada).map((l) => ({ id: l.id, nome: l.nome })),
      gerarDas: linhas.filter((l) => l.declarada && l.das > 0 && !l.serena?.das_gerado_em),
      zip: linhas.filter((l) => (l.serena?.das_gerado_em && !l.serena.entregue_em) || l.guiasIss.emitidasAEntregar.length > 0),
      rio: linhas.filter((l) => l.municipio === "Rio de Janeiro"),
      guiasPendentes: linhas.filter((l) => l.guiasIss.pendentes.length > 0),
      guia: linhas.filter((l) => l.serena?.entregue_em && !l.serena.mensagem_guia_em && l.temGrupoDigisac),
      verificar: linhas.filter((l) => l.serena?.entregue_em && l.das > 0 && !l.pago),
      cobrar: linhas.filter((l) => l.serena?.entregue_em && l.pago === false && !l.serena.mensagem_cobranca_em && l.temGrupoDigisac),
    };
  }, [linhas]);

  const tot = useMemo(
    () => ({
      calculadas: linhas.filter((l) => !l.etapas.find((e) => e.chave === "calculo" && e.estado === "problema")).length,
      transmitidas: linhas.filter((l) => l.declarada).length,
      receita: linhas.reduce((s, l) => s + l.receita, 0),
      das: linhas.reduce((s, l) => s + l.das, 0),
      dasGerados: linhas.filter((l) => l.serena?.das_gerado_em).length,
      entregues: linhas.filter((l) => l.serena?.entregue_em).length,
      pagos: linhas.filter((l) => l.pago).length,
      comDas: linhas.filter((l) => l.das > 0).length,
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

  const revisar = () =>
    iniciar(async () => {
      let ap = 0;
      let es = 0;
      let custo = 0;
      const n = Number(limiteRevisao);
      const ids = g.revisar.map((l) => l.id).slice(0, n > 0 ? n : undefined);
      for (let i = 0; i < ids.length; i += 5) {
        setProgresso(`Serena revisando ${Math.min(i + 5, ids.length)} de ${ids.length}…`);
        const r = await revisarSerenaAction({ competencia, companyIds: ids.slice(i, i + 5) });
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
      setMsg({ ok: `Serena revisou ${ids.length}: recomenda aprovar ${ap}, passou ${es} para a equipe (custo ~US$ ${custo.toFixed(2)}).` });
      router.refresh();
    });

  const aprovar = () => {
    if (!window.confirm(`Aprovar as ${g.recomendadas.length} empresa(s) que a Serena recomendou? Você é quem confirma.`)) return;
    iniciar(async () => {
      const r = await aprovarRecomendacoesAction({ competencia, itens: g.recomendadas.map((l) => ({ companyId: l.id, assinatura: l.assinatura })) });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      router.refresh();
    });
  };

  const gerarDas = () => {
    if (!window.confirm(`Gerar e salvar ${g.gerarDas.length} DAS? Cada geração é uma consulta cobrada do Integra Contador (só uma vez por empresa).`)) return;
    iniciar(async () => {
      const erros = await emLote(g.gerarDas, "Gerando DAS", async (l) => {
        const r = await gerarDasSerenaAction({ companyId: l.id, competencia });
        return "error" in r ? `${l.nome}: ${r.error}` : null;
      });
      setMsg(erros.length ? { erro: `${erros.length} com erro: ${erros.slice(0, 3).join("; ")}` } : { ok: "DAS gerados e salvos." });
      router.refresh();
    });
  };

  const baixarZip = () =>
    iniciar(async () => {
      const zip = new JSZip();
      const ok: string[] = [];
      const erros = await emLote(g.zip, "Montando ZIP", async (l) => {
        const nome = l.nome.replace(/[\\/:*?"<>|]/g, "");
        let algum = false;
        if (l.serena?.das_gerado_em && !l.serena.entregue_em) {
          const r = await dasSalvoBase64Action({ companyId: l.id, competencia });
          if ("error" in r) return `${l.nome}: ${r.error}`;
          zip.file(`${nome} - DAS ${competencia}.pdf`, r.base64, { base64: true });
          algum = true;
        }
        for (const gi of await guiasEmitidasBase64Action(l.id)) {
          zip.file(`${nome} - Guia ISS Rio ${gi.competencia}.pdf`, gi.base64, { base64: true });
          algum = true;
        }
        if (algum) ok.push(l.id);
        return null;
      });
      if (ok.length) {
        const conteudo = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(conteudo);
        const a = document.createElement("a");
        a.href = url;
        a.download = `serena-das-${competencia}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setZipBaixado(ok);
      }
      setMsg(erros.length ? { erro: `${erros.length} sem arquivo: ${erros.slice(0, 3).join("; ")}` } : { ok: `ZIP com ${ok.length} DAS baixado — suba no eContador e marque como entregue.` });
    });

  const marcarEntregue = () =>
    iniciar(async () => {
      const r = await marcarEntregueAction({ competencia, companyIds: zipBaixado ?? [] });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setZipBaixado(null);
      router.refresh();
    });

  const prepararMensagens = (tipo: "GUIA" | "COBRANCA") =>
    iniciar(async () => {
      const itens = (tipo === "GUIA" ? g.guia : g.cobrar).map((l) => ({ companyId: l.id, empresa: l.nome.replace(/^\d+ · /, ""), das: l.das }));
      const r = await previaMensagensAction({ competencia, tipo, itens });
      if ("error" in r) setMsg({ erro: r.error });
      else setPrevia({ tipo, mensagens: r.mensagens });
    });

  const enviarMensagens = () => {
    if (!previa) return;
    if (!window.confirm(`Enviar ${previa.mensagens.length} mensagem(ns) nos grupos do WhatsApp (Digisac)?`)) return;
    iniciar(async () => {
      const r = await enviarMensagensAction({ competencia, tipo: previa.tipo, mensagens: previa.mensagens.map((m) => ({ companyId: m.companyId, texto: m.texto })) });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setPrevia(null);
      router.refresh();
    });
  };

  // Guias de ISS no Rio (fora do DAS): leitura pelo robô da Nota Carioca (só leitura).
  const conferirGuiasRio = () => {
    if (!window.confirm(`Conferir as guias de ISS na Nota Carioca de ${g.rio.length} empresa(s) do Rio? O robô leva de 30 s a 1 min por empresa (sem custo).`)) return;
    iniciar(async () => {
      let comPendencia = 0;
      const erros = await emLote(g.rio, "Lendo a Nota Carioca", async (l) => {
        try {
          const r = await fetch(`/admin/fechamento/iss-rio/conferencia/${l.id}?competencia=${competencia}`, { cache: "no-store" });
          const corpo = await r.json().catch(() => null);
          const resultado = r.ok && corpo?.linhas ? { linhas: corpo.linhas, pendentes_anteriores: corpo.pendentes_anteriores ?? [] } : { erro: corpo?.error ?? `HTTP ${r.status}` };
          const s = await salvarLeituraGuiasRioAction({ companyId: l.id, resultado });
          if (!("erro" in resultado) && "ok" in s && s.mensagem && !s.mensagem.startsWith("0 ")) comPendencia++;
          return "erro" in resultado ? `${l.nome}: ${resultado.erro}` : null;
        } catch {
          return `${l.nome}: sem resposta`;
        }
      });
      setMsg({ ok: `Guias conferidas: ${g.rio.length - erros.length} empresa(s) lidas, ${comPendencia} com guia pendente${erros.length ? `; ${erros.length} sem leitura (ex.: sem certificado)` : ""}.` });
      router.refresh();
    });
  };

  // Emitir na Nota Carioca cria documento oficial — sempre com confirmação.
  const emitirGuiasRio = () => emitirGuias(g.guiasPendentes.flatMap((l) => l.guiasIss.pendentes.map((p) => ({ l, p }))));

  // Uma guia só (botão no aviso da empresa) ou o lote inteiro.
  const emitirGuias = (itens: { l: LinhaSerena; p: LinhaSerena["guiasIss"]["pendentes"][number] }[]) => {
    const total = itens.reduce((t, i) => t + (i.p.valor ?? 0), 0);
    const empresas = new Set(itens.map((i) => i.l.id)).size;
    const quais = itens.length === 1 ? `de ${itens[0].p.competencia.slice(5)}/${itens[0].p.competencia.slice(0, 4)} da ${itens[0].l.nome}` : `de ${empresas} empresa(s)`;
    if (!window.confirm(`Emitir ${itens.length} guia(s) de ISS na Nota Carioca (${brl(total)}) ${quais}? A emissão cria o documento oficial na prefeitura.`)) return;
    iniciar(async () => {
      const erros = await emLote(itens, "Emitindo guia", async ({ l, p }) => {
        try {
          const r = await fetch(`/admin/empresas/${l.id}/impostos/guia-iss?competencia=${p.competencia}&registrar=0`, { cache: "no-store" });
          if (!r.ok || !r.headers.get("Content-Type")?.startsWith("application/pdf")) {
            const corpo = await r.json().catch(() => null);
            return `${l.nome} ${p.competencia}: ${corpo?.error ?? `HTTP ${r.status}`}`;
          }
          const buf = new Uint8Array(await r.arrayBuffer());
          let bin = "";
          for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000));
          const s = await salvarGuiaEmitidaAction({ companyId: l.id, competencia: p.competencia, base64: btoa(bin) });
          return "error" in s ? `${l.nome} ${p.competencia}: ${s.error}` : null;
        } catch {
          return `${l.nome} ${p.competencia}: sem resposta`;
        }
      });
      setMsg(erros.length ? { erro: `${erros.length} com erro: ${erros.slice(0, 3).join("; ")}` } : { ok: "Guias emitidas — vão no próximo ZIP do eContador." });
      router.refresh();
    });
  };

  const verificarPagamentos = () => {
    if (!window.confirm(`Verificar o pagamento de ${g.verificar.length} DAS? Cada consulta à Receita (Integra Contador) é cobrada.`)) return;
    iniciar(async () => {
      const erros = await emLote(g.verificar, "Verificando pagamento", async (l) => {
        const r = await fetch(`/admin/empresas/${l.id}/integra-contador/pagamentos?competencia=${competencia}`, { cache: "no-store" });
        return r.ok ? null : `${l.nome}: HTTP ${r.status}`;
      });
      setMsg(erros.length ? { erro: `${erros.length} com erro` } : { ok: "Pagamentos verificados." });
      router.refresh();
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

  const aceitarMotivo = (l: LinhaSerena, m: { codigo: string; texto: string; nivel: string }) => {
    if (m.nivel === "BLOQUEADO") return setMsg({ erro: "Bloqueio de declaração não dá para pular — sem isso o PGDAS-D não pode ser montado. Resolva o cadastro." });
    const just = window.prompt(`Aceitar e seguir — ${l.nome}\n\n${m.texto}\n\nJustificativa (fica registrada):`, m.codigo.startsWith("PREFEITURA") ? "Erro da prefeitura — fechar com base nas notas do portal." : "");
    if (just === null) return;
    rodar(() => aceitarMotivoSerenaAction({ companyId: l.id, competencia, codigo: m.codigo, justificativa: just.trim() || null }), "Motivo aceito.");
  };

  const acaoEtapa = (l: LinhaSerena, chave: string) => {
    const nome = l.nome;
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
      if (l.municipio !== "Petrópolis") return setMsg({ erro: "No Rio o Simples vem da NFS-e Nacional — clique em Notas para buscar de novo." });
      if (!window.confirm(`Conferir agora o faturamento de ${nome} com a Prefeitura de Petrópolis? (só consulta)`)) return;
      return rodar(() => conferirPrefeituraUmaAction({ companyId: l.id, competencia }), "Conferido.");
    }
    if (chave === "calculo" || chave === "conferencia") {
      if (l.aprovada) return setMsg({ ok: `${nome}: já liberada para transmitir.` });
      if (l.conferencia === "BLOQUEADO") return setMsg({ erro: `${nome}: bloqueada — ${l.recado}` });
      if (l.serena?.ia_decisao === "APROVAR" && l.serena.ia_assinatura === l.assinatura) {
        if (!window.confirm(`Aprovar ${nome}, que a Serena recomendou?`)) return;
        return rodar(() => aprovarRecomendacoesAction({ competencia, itens: [{ companyId: l.id, assinatura: l.assinatura }] }), "Aprovada.");
      }
      return setMsg({ erro: `${nome}: aceite os motivos (abaixo do recado) para liberar.` });
    }
    if (chave === "pgdas") {
      if (l.declarada) return setMsg({ ok: `${nome}: PGDAS-D já transmitido.` });
      if (!l.aprovada) return setMsg({ erro: `${nome}: aprove (ou aceite os motivos) antes de transmitir.` });
      if (!window.confirm(`Transmitir de verdade o PGDAS-D de ${nome} (${rotuloCompetencia(competencia)}) — ${brl(l.das)}? Só se corrige depois com retificadora.`)) return;
      return rodar(async () => {
        const r = await fetch(`/admin/empresas/${l.id}/integra-contador/simples/declarar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competencia, indicadorTransmissao: true, retificadora: false }),
        });
        const corpo = await r.json().catch(() => null);
        if (r.ok && corpo?.resultado?.idDeclaracao) return { ok: true as const, mensagem: "PGDAS-D transmitido." };
        return corpo?.jaDeclarada ? "Já havia declaração nessa competência." : (corpo?.error ?? `HTTP ${r.status}`);
      }, "PGDAS-D transmitido.");
    }
    if (chave === "das") {
      if (l.das <= 0) return setMsg({ ok: `${nome}: sem DAS neste mês.` });
      if (!l.declarada) return setMsg({ erro: `${nome}: transmita o PGDAS-D antes do DAS.` });
      if (l.serena?.das_gerado_em) return setMsg({ ok: `${nome}: DAS já salvo.` });
      if (!window.confirm(`Gerar e salvar o DAS de ${nome}? (consulta cobrada do Integra Contador, uma vez)`)) return;
      return rodar(() => gerarDasSerenaAction({ companyId: l.id, competencia }), "DAS salvo.");
    }
    if (chave === "entrega") {
      if (!l.serena?.das_gerado_em) return setMsg({ erro: `${nome}: gere o DAS antes.` });
      return iniciar(async () => {
        const r = await dasSalvoBase64Action({ companyId: l.id, competencia });
        if ("error" in r) return setMsg({ erro: r.error });
        const a = document.createElement("a");
        a.href = `data:application/pdf;base64,${r.base64}`;
        a.download = `${nome.replace(/[\\/:*?"<>|]/g, "")} - DAS ${competencia}.pdf`;
        a.click();
        if (!l.serena?.entregue_em && window.confirm(`PDF baixado. Marcar ${nome} como entregue no eContador?`)) {
          const m = await marcarEntregueAction({ competencia, companyIds: [l.id] });
          setMsg("error" in m ? { erro: m.error } : { ok: m.mensagem });
          router.refresh();
        }
      });
    }
    if (chave === "pagamento") {
      if (!l.serena?.entregue_em || l.das <= 0) return setMsg({ erro: `${nome}: nada a verificar ainda.` });
      if (!window.confirm(`Verificar o pagamento do DAS de ${nome}? (consulta cobrada)`)) return;
      return rodar(async () => {
        const r = await fetch(`/admin/empresas/${l.id}/integra-contador/pagamentos?competencia=${competencia}`, { cache: "no-store" });
        return r.ok ? { ok: true as const, mensagem: "Pagamento verificado." } : `HTTP ${r.status}`;
      }, "Pagamento verificado.");
    }
  };

  const btn = "rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-40";
  const btnP = "rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-40";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <SerenaAvatar tamanho={52} />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Serena · Simples Nacional</h1>
              <div className="text-xs text-foreground/50">Analista fiscal (IA) da SOMA</div>
            </div>
          </div>
          <p className="text-sm text-foreground/60">
            Carteira de IA: todas as empresas do Simples de Petrópolis e do Rio ({linhas.length}). Casos que a Serena não resolve vão para a equipe do Fiscal.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/serena?competencia=${somarMeses(competencia, -1)}`} className="rounded-lg border border-border px-2 py-1">
            ‹
          </Link>
          <span className="font-semibold">Competência {rotuloCompetencia(competencia)}</span>
          <Link href={`/admin/serena?competencia=${somarMeses(competencia, 1)}`} className="rounded-lg border border-border px-2 py-1">
            ›
          </Link>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Apuração</div>
          <div className="text-lg font-semibold">
            {tot.calculadas}/{linhas.length} calculadas
          </div>
          <div className="text-xs text-foreground/60">
            {tot.transmitidas} transmitidas · {linhas.length - tot.transmitidas} aguardando
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Valores</div>
          <div className="text-lg font-semibold">{brl(tot.receita)}</div>
          <div className="text-xs text-foreground/60">{brl(tot.das)} de Simples calculado</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Conclusão</div>
          <div className="text-lg font-semibold">
            {tot.dasGerados}/{tot.comDas} DAS gerados
          </div>
          <div className="text-xs text-foreground/60">
            {tot.entregues} entregues · {tot.pagos} pagos
          </div>
        </Card>
      </div>

      {/* Esteira do mês: ações em lote, na ordem */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">Fluxo do mês (na ordem)</div>
          <div className="text-xs text-foreground/60">
            {ultimaRotina
              ? `Rotina automática (motor 7h30 e 11h30, IA 8h30 e 12h30, dias 1–25): última em ${new Date(ultimaRotina.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${ultimaRotina.conferidas} conferida(s) na prefeitura, ${ultimaRotina.revisadas} revisada(s) (${ultimaRotina.aprovadas} para aprovar, ${ultimaRotina.escaladas} para a equipe)${ultimaRotina.faltamRevisar ? `, faltam ${ultimaRotina.faltamRevisar}` : ""}${ultimaRotina.erro ? ` · erro: ${ultimaRotina.erro}` : ""}`
              : "Rotina automática: motor às 7h30 e 11h30, auditoria com IA às 8h30 e 12h30 (dias 1–25) — ainda não rodou."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground/50">1.</span>
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <BuscarTodasButton competencia={competencia} empresas={g.todas} />
          </div>
          <span className="text-xs text-foreground/50">2.</span>
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <ConferirPrefeituraLoteButton competencia={competencia} empresas={g.petropolis} />
          </div>
          <span className="text-xs text-foreground/50">3.</span>
          <button type="button" className={btnP} disabled={pendente || !g.revisar.length} onClick={revisar}>
            Serena revisar ({limiteRevisao && Number(limiteRevisao) > 0 ? `${Math.min(Number(limiteRevisao), g.revisar.length)} de ` : ""}
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
          <span className="text-xs text-foreground/50">4.</span>
          <button type="button" className={btn} disabled={pendente || !g.recomendadas.length} onClick={aprovar}>
            Aprovar recomendações ({g.recomendadas.length})
          </button>
          <span className="text-xs text-foreground/50">5.</span>
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <EnviarSimplesLoteButton competencia={competencia} empresas={g.transmitir} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground/50">6.</span>
          <button type="button" className={btn} disabled={pendente || !g.gerarDas.length} onClick={gerarDas}>
            Gerar e salvar DAS ({g.gerarDas.length})
          </button>
          <span className="text-xs text-foreground/50">7.</span>
          <button type="button" className={btn} disabled={pendente || !g.zip.length} onClick={baixarZip}>
            Baixar ZIP para o eContador ({g.zip.length})
          </button>
          {zipBaixado && (
            <button type="button" className={btnP} disabled={pendente} onClick={marcarEntregue}>
              Marcar {zipBaixado.length} como entregues
            </button>
          )}
          <span className="text-xs text-foreground/50">8.</span>
          <button type="button" className={btn} disabled={pendente || !g.guia.length} onClick={() => prepararMensagens("GUIA")}>
            Mensagem &quot;guia disponível&quot; ({g.guia.length})
          </button>
          <span className="text-xs text-foreground/50">9.</span>
          <button type="button" className={btn} disabled={pendente || !g.verificar.length} onClick={verificarPagamentos}>
            Verificar pagamentos ({g.verificar.length})
          </button>
          <span className="text-xs text-foreground/50">10.</span>
          <button type="button" className={btn} disabled={pendente || !g.cobrar.length} onClick={() => prepararMensagens("COBRANCA")}>
            Cobrança no Digisac ({g.cobrar.length})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="text-xs font-medium text-foreground/60">ISS do Rio fora do DAS (ex.: 1287 retenção como tomadora):</span>
          <button type="button" className={btn} disabled={pendente || !g.rio.length} onClick={conferirGuiasRio}>
            Conferir guias na Nota Carioca ({g.rio.length})
          </button>
          <button type="button" className={btn} disabled={pendente || !g.guiasPendentes.length} onClick={emitirGuiasRio}>
            Emitir guias pendentes ({g.guiasPendentes.reduce((t, l) => t + l.guiasIss.pendentes.length, 0)})
          </button>
          <span className="text-[11px] text-foreground/50">As guias emitidas entram no ZIP do eContador (passo 7).</span>
        </div>
        {(progresso || msg) && (
          <div className={cn("text-sm", msg?.erro ? "text-danger" : "text-foreground/70")}>{progresso ?? msg?.erro ?? msg?.ok}</div>
        )}
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["acao", "Precisa de ação"],
            ["serena", "Com a Serena"],
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

      {/* Esteira por empresa */}
      <Card className="divide-y divide-border">
        {visiveis.length === 0 && <div className="p-6 text-center text-sm text-foreground/60">Nada aqui.</div>}
        {visiveis.map((l) => (
          <div key={l.id} className="flex min-w-0 flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
            <div className="w-full shrink-0 lg:w-56">
              <div className="truncate text-sm font-medium" title={l.nome}>
                {l.nome}
              </div>
              <div className="text-[11px] text-foreground/50">
                {l.municipio} · Anexo {l.anexo}
                {l.fatorR != null ? ` · FR ${(l.fatorR * 100).toFixed(1)}%` : ""}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-start overflow-x-auto">
              {l.etapas.map((e, i) => (
                <div key={e.chave} className="flex min-w-[88px] flex-1 items-start">
                  <button
                    type="button"
                    disabled={pendente}
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
                  l.situacao === "acao" ? "bg-amber-50 text-amber-900" : l.situacao === "concluida" ? "bg-emerald-50 text-emerald-900" : "bg-violet-50 text-violet-900",
                )}
              >
                <span className="inline-flex items-center gap-1 align-middle font-semibold">
                  <SerenaAvatar tamanho={16} selo={false} /> Serena:
                </span>{" "}
                {l.recado}
                {l.serena?.ia_acoes && l.serena.ia_acoes.length > 0 && l.serena.ia_assinatura === l.assinatura && !l.aprovada && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {l.serena.ia_acoes.map((a, i) => (
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
                      {m.nivel !== "BLOQUEADO" && (
                        <button type="button" disabled={pendente} onClick={() => aceitarMotivo(l, m)} className="shrink-0 rounded border border-border px-1 font-medium text-brand hover:bg-surface-muted">
                          aceitar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {l.motivosAceitos.length > 0 && (
                <div className="mt-1 text-[10px] text-foreground/50">
                  Aceito pela equipe: {l.motivosAceitos.map((m) => `${m.codigo}${m.justificativa ? ` (${m.justificativa})` : ""}`).join("; ")}
                </div>
              )}
              <div className="mt-1 flex gap-3 text-[11px]">
                <Link href={`/admin/fechamento/simples?competencia=${competencia}`} className="text-brand underline">
                  Central do Simples
                </Link>
                {l.serena?.tarefa_id && (
                  <Link href={`/admin/empresas/${l.id}/tarefas`} className="text-brand underline">
                    tarefa da equipe
                  </Link>
                )}
                {!l.temGrupoDigisac && <span className="text-foreground/50">sem grupo no Digisac</span>}
              </div>
              {l.guiasIss.pendentes.length > 0 && (
                <div className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] text-rose-900">
                  Guia ISS Rio pendente (fora do DAS): {l.guiasIss.pendentes.length} mês(es) ·{" "}
                  {brl(l.guiasIss.pendentes.reduce((t, p) => t + (p.valor ?? 0), 0))}
                  {l.guiasIss.pendentes.some((p) => p.receita === "1287") ? " · 1287 retenção como tomadora" : ""} (
                  {l.guiasIss.pendentes.map((p) => p.competencia.slice(5) + "/" + p.competencia.slice(2, 4)).join(", ")})
                  <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                    {l.guiasIss.pendentes.map((p) => (
                      <button
                        key={p.competencia}
                        type="button"
                        disabled={pendente}
                        onClick={() => emitirGuias([{ l, p }])}
                        className="rounded border border-rose-300 bg-white px-1.5 py-px text-[10px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                        title={`Emitir a guia de ${p.competencia.slice(5)}/${p.competencia.slice(0, 4)} na Nota Carioca`}
                      >
                        emitir {p.competencia.slice(5)}/{p.competencia.slice(2, 4)}
                      </button>
                    ))}
                  </span>
                </div>
              )}
              {l.guiasIss.emitidasAEntregar.length > 0 && (
                <div className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-900">
                  {l.guiasIss.emitidasAEntregar.length} guia(s) ISS Rio emitida(s) — vão no ZIP do eContador.
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>

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
