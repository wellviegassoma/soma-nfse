"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { STATUS_PILL_CLASSES, type StatusTone } from "@/lib/formatters";
import {
  ETAPAS,
  ETAPA_LABEL,
  SITUACAO_LABEL,
  type Etapa,
  type Situacao,
} from "@/lib/certificado-acompanhamento";
import { atualizarAcompanhamentoCertificado } from "@/lib/actions/certificado-acompanhamento";

export type LinhaCertificado = {
  id: string;
  nome: string;
  razaoSocial: string;
  situacao: Situacao;
  expiresAt: string | null;
  dias: number | null;
  etapa: Etapa;
  // false = etapa calculada (ciclo novo ou renovado), nada marcado ainda
  // pra esse certificado.
  doCicloAtual: boolean;
  observacao: string | null;
  proximoContato: string | null; // AAAA-MM-DD
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

type FiltroEtapa = "ABERTAS" | "CONTATO_VENCIDO" | "TODAS" | Etapa;

const ETAPA_TONE: Record<Etapa, StatusTone> = {
  PENDENTE: "danger",
  AGUARDANDO_CLIENTE: "warning",
  AGUARDANDO_PAGAMENTO: "warning",
  RESOLVIDO: "success",
  NAO_SE_APLICA: "neutral",
};

const SITUACAO_TONE: Record<Situacao, StatusTone> = {
  SEM: "neutral",
  VENCIDO: "danger",
  VENCENDO: "warning",
  VALIDO: "success",
};

const ORDEM_SITUACAO: Record<Situacao, number> = { VENCIDO: 0, VENCENDO: 1, SEM: 2, VALIDO: 3 };

const ABERTAS: Etapa[] = ["PENDENTE", "AGUARDANDO_CLIENTE", "AGUARDANDO_PAGAMENTO"];

function contatoVencido(l: LinhaCertificado, hoje: string) {
  return ABERTAS.includes(l.etapa) && l.doCicloAtual && !!l.proximoContato && l.proximoContato < hoje;
}

function dataBr(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// "2026-11-05" → "05/11/2026" sem passar por Date (evita virar o dia em UTC).
function diaBr(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function Pill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

function textoSituacao(l: LinhaCertificado) {
  if (l.situacao === "SEM") return "Sem certificado";
  if (l.situacao === "VENCIDO") return `Vencido há ${Math.abs(l.dias!)} dia(s)`;
  if (l.situacao === "VENCENDO") return `Vence em ${l.dias} dia(s)`;
  return `Válido até ${dataBr(l.expiresAt!)}`;
}

function EditorLinha({ linha, onFechar }: { linha: LinhaCertificado; onFechar: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [etapa, setEtapa] = useState<Etapa>(linha.doCicloAtual ? linha.etapa : "AGUARDANDO_CLIENTE");
  const [proximo, setProximo] = useState(linha.doCicloAtual ? (linha.proximoContato ?? "") : "");
  const [obs, setObs] = useState(linha.doCicloAtual ? (linha.observacao ?? "") : "");
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await atualizarAcompanhamentoCertificado({
        companyIds: [linha.id],
        status: etapa,
        observacao: obs,
        proximoContato: proximo,
      });
      if ("error" in r) return setErro(r.error);
      onFechar();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 bg-surface-muted/60 px-4 py-4 sm:flex-row sm:items-end">
      <label className="flex flex-col gap-1 text-xs text-foreground/60 sm:w-52">
        Etapa
        <Select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)} className="h-10 text-sm">
          {ETAPAS.map((e) => (
            <option key={e} value={e}>
              {ETAPA_LABEL[e]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground/60 sm:w-44">
        Próximo contato
        <Input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} className="h-10 text-sm" />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-foreground/60">
        Observação
        <Input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder={etapa === "NAO_SE_APLICA" ? "Por que não vamos fazer?" : "Ex.: avisado pelo eContador em 28/10"}
          className="h-10 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} loading={pending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
      </div>
      {erro && <p className="text-sm text-danger sm:basis-full">{erro}</p>}
    </div>
  );
}

export function CertificadosAcompanhamento({
  linhas,
  hoje,
  totalEmpresas,
  totalValidos,
}: {
  linhas: LinhaCertificado[];
  hoje: string; // AAAA-MM-DD, Brasília
  totalEmpresas: number;
  totalValidos: number;
}) {
  const router = useRouter();
  const [filtroEtapa, setFiltroEtapa] = useState<FiltroEtapa>("ABERTAS");
  const [filtroSituacao, setFiltroSituacao] = useState<Situacao | "TODAS">("TODAS");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [etapaLote, setEtapaLote] = useState<Etapa>("AGUARDANDO_CLIENTE");
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [pendingLote, startLote] = useTransition();

  const contagem = useMemo(() => {
    const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e, 0])) as Record<Etapa, number>;
    for (const l of linhas) porEtapa[l.etapa]++;
    return { porEtapa, contatoVencido: linhas.filter((l) => contatoVencido(l, hoje)).length };
  }, [linhas, hoje]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas
      .filter((l) => {
        if (filtroEtapa === "ABERTAS" && !ABERTAS.includes(l.etapa)) return false;
        if (filtroEtapa === "CONTATO_VENCIDO" && !contatoVencido(l, hoje)) return false;
        if (ETAPAS.includes(filtroEtapa as Etapa) && l.etapa !== filtroEtapa) return false;
        if (filtroSituacao !== "TODAS" && l.situacao !== filtroSituacao) return false;
        if (q && !`${l.nome} ${l.razaoSocial}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa) ||
          ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] ||
          (a.dias ?? 0) - (b.dias ?? 0) ||
          a.nome.localeCompare(b.nome),
      );
  }, [linhas, filtroEtapa, filtroSituacao, busca, hoje]);

  const selecionadosVisiveis = visiveis.filter((l) => selecionados.has(l.id));
  const todosMarcados = visiveis.length > 0 && selecionadosVisiveis.length === visiveis.length;

  function alternar(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function aplicarLote() {
    setErroLote(null);
    startLote(async () => {
      const r = await atualizarAcompanhamentoCertificado({
        companyIds: selecionadosVisiveis.map((l) => l.id),
        status: etapaLote,
      });
      if ("error" in r) return setErroLote(r.error);
      setSelecionados(new Set());
      router.refresh();
    });
  }

  const cards: { filtro: FiltroEtapa; label: string; valor: number; tone: string }[] = [
    { filtro: "PENDENTE", label: "Pendentes (nada feito)", valor: contagem.porEtapa.PENDENTE, tone: "text-danger" },
    { filtro: "AGUARDANDO_CLIENTE", label: "Aguardando cliente", valor: contagem.porEtapa.AGUARDANDO_CLIENTE, tone: "text-warning" },
    { filtro: "AGUARDANDO_PAGAMENTO", label: "Aguardando pagamento", valor: contagem.porEtapa.AGUARDANDO_PAGAMENTO, tone: "text-warning" },
    { filtro: "CONTATO_VENCIDO", label: "Contato atrasado", valor: contagem.contatoVencido, tone: "text-danger" },
    { filtro: "RESOLVIDO", label: "Resolvidos", valor: contagem.porEtapa.RESOLVIDO, tone: "text-success" },
    { filtro: "NAO_SE_APLICA", label: "Não se aplica", valor: contagem.porEtapa.NAO_SE_APLICA, tone: "text-foreground/60" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <button
            key={c.filtro}
            type="button"
            onClick={() => setFiltroEtapa(filtroEtapa === c.filtro ? "ABERTAS" : c.filtro)}
            className="text-left"
          >
            <Card
              className={`h-full p-4 transition-colors hover:bg-surface-muted ${
                filtroEtapa === c.filtro ? "ring-2 ring-brand" : ""
              }`}
            >
              <div className="text-xs text-foreground/50">{c.label}</div>
              <div className={`mt-1 text-lg font-semibold ${c.tone}`}>{c.valor}</div>
            </Card>
          </button>
        ))}
      </div>
      <p className="text-xs text-foreground/50">
        {totalEmpresas} empresas ativas · {totalValidos} com certificado válido por mais de 45 dias (fora da lista,
        a não ser que tenham sido resolvidas por aqui).
      </p>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            <Select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value as FiltroEtapa)}
              className="h-9 w-auto text-sm"
              aria-label="Filtrar por etapa"
            >
              <option value="ABERTAS">Em aberto (pendente + aguardando)</option>
              <option value="CONTATO_VENCIDO">Contato atrasado</option>
              {ETAPAS.map((e) => (
                <option key={e} value={e}>
                  {ETAPA_LABEL[e]}
                </option>
              ))}
              <option value="TODAS">Todas as etapas</option>
            </Select>
            <Select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value as Situacao | "TODAS")}
              className="h-9 w-auto text-sm"
              aria-label="Filtrar por situação do certificado"
            >
              <option value="TODAS">Qualquer situação</option>
              {(["VENCIDO", "VENCENDO", "SEM", "VALIDO"] as Situacao[]).map((s) => (
                <option key={s} value={s}>
                  {SITUACAO_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="h-9 text-sm lg:ml-auto lg:w-64"
          />
        </div>

        {selecionadosVisiveis.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand/5 px-4 py-2 text-sm">
            <span className="font-medium">{selecionadosVisiveis.length} selecionada(s) — mudar etapa para</span>
            <Select
              value={etapaLote}
              onChange={(e) => setEtapaLote(e.target.value as Etapa)}
              className="h-9 w-auto text-sm"
              aria-label="Etapa para as selecionadas"
            >
              {ETAPAS.map((e) => (
                <option key={e} value={e}>
                  {ETAPA_LABEL[e]}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={aplicarLote} loading={pendingLote} className="h-9">
              Aplicar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelecionados(new Set())} className="h-9">
              Limpar seleção
            </Button>
            {erroLote && <span className="text-danger">{erroLote}</span>}
          </div>
        )}

        {visiveis.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">Nenhuma empresa nesse filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-foreground/50">
                <tr className="border-b border-border">
                  <th className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={() =>
                        setSelecionados((s) => {
                          const n = new Set(s);
                          for (const l of visiveis) {
                            if (todosMarcados) n.delete(l.id);
                            else n.add(l.id);
                          }
                          return n;
                        })
                      }
                      aria-label="Selecionar todas as visíveis"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 font-medium">Certificado</th>
                  <th className="px-2 py-2 font-medium">Etapa</th>
                  <th className="px-2 py-2 font-medium">Próximo contato</th>
                  <th className="px-2 py-2 font-medium">Observação</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <Linha
                    key={l.id}
                    linha={l}
                    marcada={selecionados.has(l.id)}
                    onMarcar={() => alternar(l.id)}
                    atrasado={contatoVencido(l, hoje)}
                    editando={editando === l.id}
                    onEditar={() => setEditando(editando === l.id ? null : l.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Linha({
  linha: l,
  marcada,
  onMarcar,
  atrasado,
  editando,
  onEditar,
}: {
  linha: LinhaCertificado;
  marcada: boolean;
  onMarcar: () => void;
  atrasado: boolean;
  editando: boolean;
  onEditar: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border align-top last:border-0">
        <td className="px-4 py-3">
          <input type="checkbox" checked={marcada} onChange={onMarcar} aria-label={`Selecionar ${l.nome}`} />
        </td>
        <td className="max-w-72 px-2 py-3">
          <Link href={`/admin/empresas/${l.id}/certificado`} className="font-medium text-foreground hover:underline">
            {l.nome}
          </Link>
          {!l.nome.endsWith(l.razaoSocial) &&<div className="truncate text-xs text-foreground/50">{l.razaoSocial}</div>}
        </td>
        <td className="px-2 py-3">
          <Pill tone={SITUACAO_TONE[l.situacao]}>{textoSituacao(l)}</Pill>
        </td>
        <td className="px-2 py-3">
          <Pill tone={ETAPA_TONE[l.etapa]}>{ETAPA_LABEL[l.etapa]}</Pill>
          {l.doCicloAtual && l.atualizadoEm ? (
            <div className="mt-1 text-xs text-foreground/50">
              {l.atualizadoPor ? `${l.atualizadoPor.split(" ")[0]} · ` : ""}
              {dataBr(l.atualizadoEm)}
            </div>
          ) : l.etapa === "RESOLVIDO" ? (
            <div className="mt-1 text-xs text-foreground/50">certificado novo cadastrado</div>
          ) : l.atualizadoEm ? (
            <div className="mt-1 text-xs text-foreground/50">venceu de novo — novo ciclo</div>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-2 py-3">
          {l.doCicloAtual && l.proximoContato ? (
            <span className={atrasado ? "font-medium text-danger" : "text-foreground/70"}>
              {diaBr(l.proximoContato)}
              {atrasado && " (atrasado)"}
            </span>
          ) : (
            <span className="text-foreground/30">—</span>
          )}
        </td>
        <td className="max-w-80 px-2 py-3 text-foreground/70">
          {l.doCicloAtual && l.observacao ? (
            <span className="line-clamp-2" title={l.observacao}>
              {l.observacao}
            </span>
          ) : (
            <span className="text-foreground/30">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <Button type="button" variant="secondary" onClick={onEditar} className="h-8 px-3 text-xs">
            {editando ? "Fechar" : "Atualizar"}
          </Button>
        </td>
      </tr>
      {editando && (
        <tr className="border-b border-border">
          <td colSpan={7} className="p-0">
            <EditorLinha linha={l} onFechar={onEditar} />
          </td>
        </tr>
      )}
    </>
  );
}
