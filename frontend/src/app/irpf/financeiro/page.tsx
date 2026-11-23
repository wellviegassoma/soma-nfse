import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe } from "@/lib/tarefas";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { exercicioAtual, type HonorarioStatus, type StatusDeclaracao } from "@/lib/irpf/comum";
import { FinanceiroIrpf, type LinhaFinanceiro } from "./FinanceiroIrpf";

export const metadata = { title: "IRPF — Financeiro" };

type Row = {
  id: string;
  contribuinte_id: string;
  status: StatusDeclaracao;
  responsavel_id: string | null;
  honorario_valor: number | null;
  honorario_status: HonorarioStatus;
  honorario_vencimento: string | null;
  honorario_pago_em: string | null;
  honorario_forma: string | null;
  irpf_contribuintes: { nome: string; cpf: string } | null;
};

export default async function FinanceiroPage(props: PageProps<"/irpf/financeiro">) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data: exs } = await supabase.from("irpf_declaracoes").select("exercicio").order("exercicio", { ascending: false }).limit(1000);
  const exercicios = [...new Set([exercicioAtual(), ...(exs ?? []).map((e) => e.exercicio as number)])].sort((a, b) => b - a);
  const exercicio = Number(typeof sp.ex === "string" ? sp.ex : "") || ((exs ?? [])[0]?.exercicio as number | undefined) || exercicioAtual();

  const [rows, anteriores, equipe] = await Promise.all([
    buscarTudoPaginado<Row>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select(
          "id, contribuinte_id, status, responsavel_id, honorario_valor, honorario_status, honorario_vencimento, honorario_pago_em, honorario_forma, irpf_contribuintes(nome, cpf)",
        )
        .eq("exercicio", exercicio)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    ),
    buscarTudoPaginado<{ contribuinte_id: string; honorario_valor: number | null }>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select("contribuinte_id, honorario_valor")
        .eq("exercicio", exercicio - 1)
        .order("id")
        .range(from, to),
    ),
    listarEquipe(),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));
  const anterior = new Map(anteriores.map((a) => [a.contribuinte_id, a.honorario_valor === null ? null : Number(a.honorario_valor)]));

  const linhas: LinhaFinanceiro[] = rows
    .filter((r) => r.status !== "NAO_FARA")
    .map((r) => ({
      id: r.id,
      nome: r.irpf_contribuintes?.nome ?? "—",
      cpf: r.irpf_contribuintes?.cpf ?? "",
      responsavelId: r.responsavel_id,
      responsavel: r.responsavel_id ? nomeEquipe.get(r.responsavel_id) ?? "—" : "Sem responsável",
      etapa: r.status,
      valor: r.honorario_valor === null ? null : Number(r.honorario_valor),
      situacao: r.honorario_status,
      vencimento: r.honorario_vencimento,
      pagoEm: r.honorario_pago_em,
      forma: r.honorario_forma,
      anterior: anterior.get(r.contribuinte_id) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Financeiro {exercicio}</h1>
          <p className="text-sm text-foreground/60">Honorários das declarações do exercício: quanto há para receber, por responsável.</p>
        </div>
        <form className="flex items-center gap-2">
          <Select name="ex" defaultValue={String(exercicio)} className="h-10 w-32">
            {exercicios.map((e) => (
              <option key={e} value={e}>
                Exercício {e}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Ver
          </Button>
        </form>
      </div>
      <FinanceiroIrpf exercicio={exercicio} linhas={linhas} />
    </div>
  );
}
