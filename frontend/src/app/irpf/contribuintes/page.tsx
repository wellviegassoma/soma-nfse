import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe } from "@/lib/tarefas";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { NovoContribuinte } from "./NovoContribuinte";
import { formatarCpf } from "@/lib/formatters";
import { dataBr } from "@/lib/irpf/comum";

export const metadata = { title: "IRPF — Contribuintes" };

type Linha = {
  id: string;
  nome: string;
  cpf: string;
  nascimento: string | null;
  ativo: boolean;
  responsavel_id: string | null;
  irpf_declaracoes: { exercicio: number }[] | null;
};

export default async function ContribuintesPage(props: PageProps<"/irpf/contribuintes">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const inativos = sp.inativos === "1";
  const qDigitos = q.replace(/\D/g, "");
  const supabase = await createClient();
  const [linhas, equipe] = await Promise.all([
    buscarTudoPaginado<Linha>((from, to) =>
      supabase
        .from("irpf_contribuintes")
        .select("id, nome, cpf, nascimento, ativo, responsavel_id, irpf_declaracoes(exercicio)")
        .order("nome")
        .range(from, to) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
    ),
    listarEquipe(),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));
  const filtradas = linhas.filter(
    (l) => (inativos || l.ativo) && (!q || l.nome.toLowerCase().includes(q) || (qDigitos.length >= 3 && l.cpf.includes(qDigitos))),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contribuintes</h1>
          <p className="text-sm text-foreground/60">
            Base própria do IRPF, separada das empresas. {linhas.filter((l) => l.ativo).length} ativo(s).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/irpf/planilha/contribuintes"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Exportar Excel
          </a>
          <NovoContribuinte />
        </div>
      </div>

      <Card className="overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <Input name="q" defaultValue={q} placeholder="Buscar por nome ou CPF..." className="h-10 w-64" />
          <label className="flex items-center gap-1.5 text-sm text-foreground/60">
            <input type="checkbox" name="inativos" value="1" defaultChecked={inativos} className="accent-brand" />
            mostrar inativos
          </label>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <div className="divide-y divide-border">
          {filtradas.map((l) => {
            const anos = (l.irpf_declaracoes ?? []).map((d) => d.exercicio).sort();
            return (
              <Link
                key={l.id}
                href={`/irpf/contribuintes/${l.id}`}
                className="flex items-center justify-between gap-4 px-5 py-2.5 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {l.nome}
                    {!l.ativo && <span className="ml-2 text-xs font-normal text-foreground/40">inativo</span>}
                  </div>
                  <div className="text-xs text-foreground/45">
                    CPF {formatarCpf(l.cpf)}
                    {l.nascimento && <> · nasc. {dataBr(l.nascimento)}</>} ·{" "}
                    {l.responsavel_id ? `Responsável pela declaração: ${nomeEquipe.get(l.responsavel_id) ?? "—"}` : "sem responsável"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {anos.map((a) => (
                    <span key={a} className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-foreground/60">
                      {a}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
          {filtradas.length === 0 && (
            <div className="p-8 text-center text-sm text-foreground/50">
              Nenhum contribuinte.{" "}
              <Link href="/irpf/importar" className="text-brand underline">
                Importe os .DEC
              </Link>{" "}
              para cadastrar automaticamente.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
