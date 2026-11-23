import { requireSomaStaff } from "@/lib/auth";
import { TarefasNav } from "./TarefasNav";

export default async function TarefasLayout({ children }: { children: React.ReactNode }) {
  await requireSomaStaff();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tarefas</h1>
          <p className="text-sm text-foreground/60">
            Rotina do mês da equipe. Atrasada = passou da meta SOMA · Risco de multa = passou do prazo legal.
          </p>
        </div>
        <TarefasNav />
      </div>
      {children}
    </div>
  );
}
