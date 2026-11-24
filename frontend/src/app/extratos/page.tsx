import Link from "next/link";
import { requireUser, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BuscaRapidaEmpresa } from "@/components/BuscaRapidaEmpresa";
import { mesAnteriorBrasilia, proximaCompetencia } from "@/lib/competencia";
import { carregarPainel } from "@/lib/extratos-painel";
import { nomeCompetencia } from "@/lib/extratos-cobranca-mensagem";
import { cn } from "@/lib/cn";
import { DropExtratos } from "./DropExtratos";
import { PainelEtapas } from "./PainelEtapas";

export const metadata = { title: "Extratos — Painel" };
export const maxDuration = 120; // leitura dos extratos pela IA no upload em lote

function anterior(c: string) {
  const [a, m] = c.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export default async function ExtratosPage(props: PageProps<"/extratos">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const competencia =
    typeof sp.competencia === "string" && /^\d{4}-\d{2}$/.test(sp.competencia) ? sp.competencia : mesAnteriorBrasilia();

  const [{ empresas, responsaveis, fila }, podeEditar, todas] = await Promise.all([
    carregarPainel(competencia),
    temPermissao("extratos.editar"),
    createClient().then((db) =>
      db.from("companies").select("id, legal_name, trade_name, codigo_cliente").order("legal_name").then((r) => r.data ?? []),
    ),
  ]);

  // Carteira: ?resp=<id> | todos | sem. Padrão: a de quem entrou, se tiver.
  const respParam = typeof sp.resp === "string" ? sp.resp : null;
  const resp = respParam ?? (responsaveis.some((r) => r.id === user.id) ? user.id : "todos");
  const visiveis =
    resp === "todos" ? empresas : resp === "sem" ? empresas.filter((e) => !e.responsavelId) : empresas.filter((e) => e.responsavelId === resp);
  const semResp = empresas.filter((e) => !e.responsavelId).length;

  const url = (o: { competencia?: string; resp?: string }) => {
    const q = new URLSearchParams({ competencia: o.competencia ?? competencia, resp: o.resp ?? resp });
    return `/extratos?${q}`;
  };

  const recebidas = visiveis.filter((e) => ["CONFERIR", "PRONTO", "CONCILIADO"].includes(e.etapa)).length;
  const pct = visiveis.length ? Math.round((recebidas / visiveis.length) * 100) : 0;
  const comAviso = visiveis.filter((e) => e.avisos > 0).length;
  const aguardando = visiveis.filter((e) => e.etapa === "AGUARDANDO").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Extratos</h1>
          <div className="mt-1 flex items-center gap-1 text-sm">
            <Link href={url({ competencia: anterior(competencia) })} className="rounded px-2 py-0.5 text-foreground/60 hover:bg-surface-muted" aria-label="Mês anterior">
              ‹
            </Link>
            <span className="font-medium capitalize text-foreground">{nomeCompetencia(competencia)}</span>
            <Link href={url({ competencia: proximaCompetencia(competencia) })} className="rounded px-2 py-0.5 text-foreground/60 hover:bg-surface-muted" aria-label="Próximo mês">
              ›
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {fila > 0 && (
            <Link href="/extratos/fila" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning hover:bg-warning/15">
              Fila de confirmação ({fila})
            </Link>
          )}
          <Link
            href={`/extratos/cobranca?competencia=${competencia}${resp !== "todos" && resp !== "sem" ? `&responsavel=${resp}` : "&responsavel=todos"}`}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            Cobrar pendentes pelo WhatsApp
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {responsaveis.map((r) => {
          const p = r.total ? Math.round((r.recebidas / r.total) * 100) : 0;
          return (
            <Link
              key={r.id}
              href={url({ resp: r.id })}
              className={cn(
                "flex min-w-40 flex-col gap-1 rounded-xl border px-3 py-2 text-sm transition-colors",
                resp === r.id ? "border-brand bg-brand/5" : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              <span className="flex justify-between gap-3 font-medium text-foreground">
                {r.nome}
                {r.id === user.id && <span className="text-xs font-normal text-foreground/50">você</span>}
              </span>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <span className="block h-full rounded-full bg-success" style={{ width: `${p}%` }} />
              </span>
              <span className="text-xs text-foreground/55">
                {r.recebidas}/{r.total} empresas com tudo recebido
              </span>
            </Link>
          );
        })}
        <Link
          href={url({ resp: "todos" })}
          className={cn("self-stretch rounded-xl border px-3 py-2 text-sm", resp === "todos" ? "border-brand bg-brand/5" : "border-border bg-surface hover:bg-surface-muted")}
        >
          Todas
          <span className="block text-xs text-foreground/55">{empresas.length} empresas</span>
        </Link>
        {semResp > 0 && (
          <Link
            href={url({ resp: "sem" })}
            className={cn("self-stretch rounded-xl border px-3 py-2 text-sm", resp === "sem" ? "border-brand bg-brand/5" : "border-border bg-surface hover:bg-surface-muted")}
          >
            Sem responsável
            <span className="block text-xs text-foreground/55">{semResp} empresas</span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Tudo recebido" valor={`${pct}%`} detalhe={`${recebidas} de ${visiveis.length} empresas`} tom="success" />
        <Kpi rotulo="Aguardando cliente" valor={String(aguardando)} detalhe="nenhum extrato do mês" tom="warning" />
        <Kpi rotulo="Com alerta da IA" valor={String(comAviso)} detalhe="saldo, período ou titular" tom={comAviso ? "danger" : "neutral"} />
        <Kpi rotulo="Fila de confirmação" valor={String(fila)} detalhe="arquivos sem conta/mês" tom={fila ? "warning" : "neutral"} />
      </div>

      {podeEditar && (
        <DropExtratos
          titulo="Solte aqui os extratos de qualquer empresa"
          subtitulo="PDF, OFX ou foto — a IA identifica empresa, conta e mês, confere saldos e marca como recebido"
          compacto
        />
      )}

      <PainelEtapas empresas={visiveis} competencia={competencia} />

      <div className="max-w-md">
        <BuscaRapidaEmpresa empresas={todas} basePath="/extratos/empresas" placeholder="Abrir outra empresa..." />
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe: string; tom: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-foreground/55">{rotulo}</div>
      <div
        className={cn(
          "text-2xl font-semibold",
          tom === "success" && "text-success",
          tom === "warning" && "text-warning",
          tom === "danger" && "text-danger",
          tom === "neutral" && "text-foreground",
        )}
      >
        {valor}
      </div>
      <div className="text-xs text-foreground/50">{detalhe}</div>
    </div>
  );
}
