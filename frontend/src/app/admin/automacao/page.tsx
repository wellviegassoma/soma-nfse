import Link from "next/link";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Automação — Painel SOMA" };

// Aba própria, separada de Fechamento — orquestra várias centrais em
// sequência (ao contrário de Fechamento, que é uma central por vez).
// Espaço já pensado pra outras rotinas entrarem aqui no futuro.
export default function AutomacaoIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Automação</h1>
        <p className="text-sm text-foreground/60">
          Rotinas que orquestram várias centrais em sequência, disparadas sob demanda — pelo
          painel ou por comando direto (chat/curl).
        </p>
      </div>

      <Link href="/admin/automacao/rotina-fechamento">
        <Card className="p-6 transition-colors hover:bg-surface-muted">
          <div className="text-sm font-semibold text-foreground">Rotina de Fechamento</div>
          <p className="mt-1 text-xs text-foreground/60">
            As 6 etapas do fechamento mensal: buscar notas, ISS Rio de Janeiro, ISS Petrópolis e
            quem já pode fechar o Simples Nacional antes do resto.
          </p>
        </Card>
      </Link>
    </div>
  );
}
