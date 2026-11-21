import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { descreverRegra, type RegraVencimento } from "@/lib/legalizacao-licencas";
import { RegraForm } from "./RegraForm";
import { ApagarRegraButton } from "./ApagarRegraButton";

export const metadata = { title: "Regras de vencimento — Legalização" };

export default async function RegrasVencimentoPage() {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();

  const [{ data: tipos }, { data: regras }] = await Promise.all([
    supabase.from("legalizacao_tipos_documento").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("legalizacao_regras_vencimento").select("*"),
  ]);

  const nomeTipo = new Map((tipos ?? []).map((t) => [t.id, t.nome]));
  const lista = ((regras ?? []) as RegraVencimento[]).sort(
    (a, b) =>
      (nomeTipo.get(a.tipo_id) ?? "").localeCompare(nomeTipo.get(b.tipo_id) ?? "") ||
      (a.municipality_name ?? "").localeCompare(b.municipality_name ?? ""),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Regras de vencimento</h1>
        <p className="text-sm text-foreground/60">
          Como cada licença vence em cada município. Ao anexar uma licença, o vencimento é sugerido pela regra
          do município da empresa; se não houver, pela regra padrão do tipo; se nem isso, é informado à mão.
        </p>
      </div>

      <Card className="p-6">
        <RegraForm tipos={tipos ?? []} />
      </Card>

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhuma regra cadastrada ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted/50 text-left text-xs text-foreground/50">
              <tr>
                <th className="px-5 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Município</th>
                <th className="px-3 py-2.5 font-medium">Regra</th>
                <th className="px-3 py-2.5 font-medium">Antecedência</th>
                <th className="px-3 py-2.5 font-medium">Observação</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.map((r) => {
                const tipo = nomeTipo.get(r.tipo_id) ?? "Tipo inativo";
                const municipio = r.municipality_name
                  ? `${r.municipality_name}${r.state ? `/${r.state}` : ""}`
                  : "Padrão (demais municípios)";
                return (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{tipo}</td>
                    <td className="px-3 py-3 text-foreground/80">{municipio}</td>
                    <td className="px-3 py-3 text-foreground/80">{descreverRegra(r)}</td>
                    <td className="px-3 py-3 text-foreground/80">{r.antecedencia_dias} dias</td>
                    <td className="px-3 py-3 text-foreground/60">{r.observacao ?? ""}</td>
                    <td className="px-5 py-3 text-right">
                      <ApagarRegraButton regraId={r.id} descricao={`${tipo} — ${municipio}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
