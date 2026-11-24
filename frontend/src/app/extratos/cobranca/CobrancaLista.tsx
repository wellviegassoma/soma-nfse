"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES } from "@/lib/formatters";
import { listaMeses } from "@/lib/extratos-cobranca-mensagem";
import { enviarCobrancasExtratos, type ResultadoEnvio } from "@/lib/actions/extratos-cobranca";
import type { EmpresaCobranca } from "@/lib/extratos-cobranca";

function quando(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function hojeSP(iso: string) {
  const f = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return f(new Date(iso)) === f(new Date());
}

export function CobrancaLista({
  empresas,
  competencia,
  incluirAnteriores,
  podeEnviar,
}: {
  empresas: EmpresaCobranca[];
  competencia: string;
  incluirAnteriores: boolean;
  podeEnviar: boolean;
}) {
  const comGrupo = empresas.filter((e) => e.grupos.length > 0);
  const semGrupo = empresas.filter((e) => e.grupos.length === 0);

  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () => new Set(comGrupo.filter((e) => !(e.ultimaCobranca && hojeSP(e.ultimaCobranca.em))).map((e) => e.id)),
  );
  const [grupoEscolhido, setGrupoEscolhido] = useState<Record<string, string>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoEnvio>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const qtd = selecionadas.size;
  const todasMarcadas = comGrupo.length > 0 && comGrupo.every((e) => selecionadas.has(e.id));

  const alternar = (id: string) =>
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);

  function enviar() {
    const envios = [...selecionadas]
      .map((id) => porId.get(id))
      .filter((e): e is EmpresaCobranca => !!e && e.grupos.length > 0)
      .map((e) => ({
        companyId: e.id,
        contactId: grupoEscolhido[e.id] ?? e.grupos[0].contactId,
        texto: textos[e.id] ?? e.texto,
      }));
    if (!envios.length) return;
    const jaHoje = envios.filter((x) => {
      const u = porId.get(x.companyId)?.ultimaCobranca;
      return u && hojeSP(u.em);
    }).length;
    const aviso = jaHoje ? `\n\n${jaHoje} delas já foi cobrada hoje e será cobrada de novo.` : "";
    if (!window.confirm(`Enviar a cobrança de extratos para ${envios.length} empresa(s) pelo WhatsApp?${aviso}`)) return;
    setErro(null);
    startTransition(async () => {
      const r = await enviarCobrancasExtratos({ competencia, incluirAnteriores, forcar: jaHoje > 0, envios });
      if (r.error) {
        setErro(r.error);
        return;
      }
      const mapa: Record<string, ResultadoEnvio> = {};
      for (const x of r.resultados ?? []) mapa[x.companyId] = x;
      setResultados(mapa);
      setSelecionadas(new Set());
    });
  }

  const enviadas = Object.values(resultados).filter((r) => r.ok).length;
  const falhas = Object.values(resultados).filter((r) => !r.ok).length;

  const linha = (e: EmpresaCobranca, podeMarcar: boolean) => {
    const res = resultados[e.id];
    const texto = textos[e.id] ?? e.texto;
    return (
      <div key={e.id} className="px-5 py-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            disabled={!podeMarcar || !podeEnviar || enviando}
            checked={podeMarcar && selecionadas.has(e.id)}
            onChange={() => alternar(e.id)}
            aria-label={`Selecionar ${e.nome}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/extratos/empresas/${e.id}`} className="truncate text-sm font-medium text-foreground hover:underline">
                {e.codigo && <span className="mr-1 text-foreground/40">#{e.codigo}</span>}
                {e.nome}
              </Link>
              {e.semConta ? (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_PILL_CLASSES.neutral)}>
                  Sem conta cadastrada
                </span>
              ) : (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_PILL_CLASSES.warning)}>
                  {e.itens.length} conta(s) pendente(s)
                </span>
              )}
              {e.ultimaCobranca && (
                <span className="text-xs text-foreground/50">
                  Cobrada em {quando(e.ultimaCobranca.em)}
                  {e.ultimaCobranca.por ? ` por ${e.ultimaCobranca.por}` : ""}
                </span>
              )}
              {res && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_PILL_CLASSES[res.ok ? "success" : "danger"],
                  )}
                >
                  {res.ok ? "Enviada" : "Não enviada"}
                  {res.motivo ? ` — ${res.motivo}` : ""}
                </span>
              )}
            </div>
            {!e.semConta && (
              <ul className="mt-1 space-y-0.5 text-xs text-foreground/60">
                {e.itens.map((i) => (
                  <li key={i.contaId}>
                    {i.banco}
                    {i.conta.trim() === "-" && i.agencia.trim() === "-"
                      ? " (agência e conta não cadastradas)"
                      : ` — ag. ${i.agencia} / conta ${i.conta}`}
                    : {listaMeses(i.meses)}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              {e.grupos.length > 1 ? (
                <select
                  className="rounded border border-border bg-surface px-1.5 py-0.5"
                  value={grupoEscolhido[e.id] ?? e.grupos[0].contactId}
                  onChange={(ev) => setGrupoEscolhido((g) => ({ ...g, [e.id]: ev.target.value }))}
                >
                  {e.grupos.map((g) => (
                    <option key={g.contactId} value={g.contactId}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              ) : e.grupos.length === 1 ? (
                <span className="text-foreground/50">WhatsApp: {e.grupos[0].nome}</span>
              ) : null}
              <button type="button" className="text-brand underline" onClick={() => setAberta(aberta === e.id ? null : e.id)}>
                {aberta === e.id ? "Fechar mensagem" : "Ver mensagem"}
              </button>
            </div>
            {aberta === e.id && (
              <div className="mt-2">
                <textarea
                  className="h-56 w-full rounded-lg border border-border bg-surface p-3 font-mono text-xs text-foreground"
                  value={texto}
                  readOnly={!podeMarcar || !podeEnviar}
                  onChange={(ev) => setTextos((t) => ({ ...t, [e.id]: ev.target.value }))}
                />
                {textos[e.id] !== undefined && textos[e.id] !== e.texto && (
                  <button
                    type="button"
                    className="text-xs text-foreground/60 underline"
                    onClick={() =>
                      setTextos((t) => {
                        const n = { ...t };
                        delete n[e.id];
                        return n;
                      })
                    }
                  >
                    Voltar ao texto padrão
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (empresas.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-foreground/50">
        Nenhum extrato pendente para esse filtro.
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
            <input
              type="checkbox"
              disabled={!podeEnviar || enviando || comGrupo.length === 0}
              checked={todasMarcadas}
              onChange={() => setSelecionadas(todasMarcadas ? new Set() : new Set(comGrupo.map((e) => e.id)))}
            />
            Com grupo do WhatsApp ({comGrupo.length})
          </label>
          {podeEnviar && (
            <Button onClick={enviar} disabled={qtd === 0} loading={enviando}>
              Cobrar selecionadas ({qtd})
            </Button>
          )}
        </div>
        {(enviadas > 0 || falhas > 0 || erro) && (
          <div className="border-b border-border bg-surface-muted px-5 py-2 text-sm">
            {erro ? (
              <span className="text-danger">{erro}</span>
            ) : (
              <span>
                {enviadas} enviada(s){falhas ? `, ${falhas} não enviada(s) — veja o motivo em cada empresa` : ""}.
              </span>
            )}
          </div>
        )}
        {comGrupo.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">Nenhuma empresa pendente com grupo vinculado.</div>
        ) : (
          <div className="divide-y divide-border">{comGrupo.map((e) => linha(e, true))}</div>
        )}
      </Card>

      {semGrupo.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <div className="text-sm font-semibold text-foreground/70">Sem grupo do WhatsApp ({semGrupo.length})</div>
            <p className="text-xs text-foreground/50">
              Vincule o grupo em Dados fiscais → Grupos do WhatsApp para poder cobrar por aqui. A mensagem pode ser
              copiada abaixo.
            </p>
          </div>
          <div className="divide-y divide-border">{semGrupo.map((e) => linha(e, false))}</div>
        </Card>
      )}
    </>
  );
}
