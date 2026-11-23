import Link from "next/link";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { coberturaPetropolis, type LinhaCobertura, type SituacaoCobertura } from "@/lib/sei-cobertura";
import { MOTIVO_DISPENSA_LABELS, type MotivoDispensa } from "@/lib/sei-labels";
import { dispensarClienteSei, desfazerDispensaSei } from "@/lib/actions/sei";
import { dataBr, dataHoraBr } from "../situacao";

export const metadata = { title: "Clientes sem processo no SEI — Legalização" };

const VISOES: { chave: string; label: string; filtro: (l: LinhaCobertura) => boolean }[] = [
  { chave: "sem", label: "Sem processo", filtro: (l) => l.situacao === "SEM_PROCESSO" },
  { chave: "dispensados", label: "Dispensados", filtro: (l) => l.situacao === "DISPENSADO" || l.situacao === "DISPENSADO_LEGALIZACAO" },
  { chave: "com", label: "Com processo", filtro: (l) => l.situacao === "COM_PROCESSO" },
  { chave: "todos", label: "Todos", filtro: () => true },
];

export default async function CoberturaSeiPage(props: PageProps<"/legalizacao/sei/cobertura">) {
  await requirePermissao("legalizacao.ver");
  const podeEditar = await temPermissao("legalizacao.editar");
  const sp = await props.searchParams;
  const ver = typeof sp.ver === "string" && VISOES.some((v) => v.chave === sp.ver) ? sp.ver : "sem";

  const supabase = await createClient();
  const linhas = await coberturaPetropolis(supabase);
  const visao = VISOES.find((v) => v.chave === ver)!;
  const lista = linhas.filter(visao.filtro);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/legalizacao/sei" className="text-sm text-foreground/60 hover:text-foreground">
          ← Processos do SEI
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Clientes de Petrópolis × SEI</h1>
        <p className="text-sm text-foreground/60">
          Todo cliente ativo com município Petrópolis deve ter processo no SEI. Quem não tem e não precisa (ponto de
          referência, sem atendimento no local…) fica dispensado aqui, conferido por alguém. A meta é zero em “Sem
          processo”.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VISOES.map((v) => {
          const n = linhas.filter(v.filtro).length;
          return (
            <Link key={v.chave} href={`/legalizacao/sei/cobertura?ver=${v.chave}`}>
              <Card className={`p-4 transition-colors ${ver === v.chave ? "border-brand ring-2 ring-brand/20" : "hover:bg-surface-muted"}`}>
                <div className={`text-2xl font-semibold ${v.chave === "sem" && n > 0 ? "text-danger" : "text-foreground"}`}>{n}</div>
                <div className="text-xs text-foreground/50">{v.label}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      {ver === "sem" && (
        <p className="text-sm text-foreground/60">
          Antes de dispensar, confira se o processo não existe com outro nome: os processos sem cliente ficam em{" "}
          <Link href="/legalizacao/sei?filtro=sem_cliente" className="text-brand hover:underline">
            Processos do SEI › Sem cliente
          </Link>{" "}
          e podem ser vinculados lá.
        </p>
      )}

      <Card className="divide-y divide-border p-0">
        {lista.map((l) => (
          <div key={l.id} className="flex flex-col gap-3 px-4 py-3 text-sm lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Link href={`/legalizacao/empresas/${l.id}`} className="font-medium text-brand hover:underline">
                {l.codigo_cliente && <span className="mr-1 text-foreground/40">#{l.codigo_cliente}</span>}
                {l.trade_name || l.legal_name}
              </Link>
              <div className="text-xs text-foreground/50">
                {l.person_type === "PF" ? "Pessoa física" : "Pessoa jurídica"}
                {l.cnae && ` · CNAE ${l.cnae}`}
                {" · "}
                {l.licencaVisaVencimento
                  ? `licença da Vigilância cadastrada (vence ${dataBr(l.licencaVisaVencimento)})`
                  : "sem licença da Vigilância cadastrada"}
              </div>
              <Situacao l={l} />
            </div>
            {podeEditar && <Acoes l={l} />}
          </div>
        ))}
        {lista.length === 0 && (
          <div className="px-4 py-10 text-center text-foreground/50">
            {ver === "sem" ? "Nenhum cliente de Petrópolis sem processo. 🎉" : "Nada aqui."}
          </div>
        )}
      </Card>
    </div>
  );
}

function Situacao({ l }: { l: LinhaCobertura }) {
  const textos: Record<SituacaoCobertura, string> = {
    COM_PROCESSO: `${l.processos} processo(s) no SEI`,
    SEM_PROCESSO: "sem processo no SEI",
    DISPENSADO: "dispensado",
    DISPENSADO_LEGALIZACAO: "dispensado pela Legalização (Vigilância Sanitária marcada como “não se aplica”)",
  };
  const cor =
    l.situacao === "SEM_PROCESSO" ? "text-danger" : l.situacao === "COM_PROCESSO" ? "text-success" : "text-foreground/60";
  return (
    <div className={`mt-1 text-xs ${cor}`}>
      {textos[l.situacao]}
      {l.dispensa && (
        <>
          {": "}
          {MOTIVO_DISPENSA_LABELS[l.dispensa.motivo]}
          {l.dispensa.observacao && ` — ${l.dispensa.observacao}`}
          <span className="text-foreground/40">
            {" "}
            ({l.dispensa.por ?? "alguém"}, {dataHoraBr(l.dispensa.created_at)})
          </span>
        </>
      )}
    </div>
  );
}

function Acoes({ l }: { l: LinhaCobertura }) {
  if (l.situacao === "DISPENSADO") {
    return (
      <form action={desfazerDispensaSei} className="shrink-0">
        <input type="hidden" name="companyId" value={l.id} />
        <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">
          Desfazer dispensa
        </Button>
      </form>
    );
  }
  if (l.situacao === "DISPENSADO_LEGALIZACAO") {
    return (
      <Link href={`/legalizacao/empresas/${l.id}/gerenciar`} className="shrink-0 text-xs text-foreground/60 hover:underline">
        Ver em Alvarás e licenças
      </Link>
    );
  }
  if (l.situacao !== "SEM_PROCESSO") return null;
  return (
    <form action={dispensarClienteSei} className="flex shrink-0 flex-wrap items-center gap-2">
      <input type="hidden" name="companyId" value={l.id} />
      <Select name="motivo" required defaultValue="" className="h-9 w-56 text-xs">
        <option value="" disabled>
          Motivo…
        </option>
        {(Object.keys(MOTIVO_DISPENSA_LABELS) as MotivoDispensa[]).map((m) => (
          <option key={m} value={m}>
            {MOTIVO_DISPENSA_LABELS[m]}
          </option>
        ))}
      </Select>
      <Input name="observacao" placeholder="Observação" maxLength={500} className="h-9 w-48 text-xs" />
      <Button type="submit" variant="secondary" className="h-9 text-xs">
        Não precisa de processo
      </Button>
    </form>
  );
}
