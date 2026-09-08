import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import {
  CONTATO_TIPOS,
  CONTATO_TIPO_LABELS_PLURAL,
  type FinContato,
} from "@/lib/financeiro";
import { ContatoForm } from "./ContatoForm";
import { ToggleContatoButton } from "./ToggleContatoButton";

export const metadata = { title: "Financeiro — Contatos" };

export default async function FinanceiroContatosPage(
  props: PageProps<"/financeiro/empresas/[companyId]/contatos">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: contatosData }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name")
      .eq("id", companyId)
      .single(),
    supabase
      .from("fin_contatos")
      .select("id, company_id, tipo, nome, cpf_cnpj, email, telefone, observacoes, customer_id, ativo")
      .eq("company_id", companyId)
      .order("nome", { ascending: true }),
  ]);

  if (!company) notFound();
  const contatos = (contatosData ?? []) as unknown as FinContato[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Contatos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Clientes, fornecedores, funcionários e sócios do financeiro. O mesmo CPF/CNPJ pode
          aparecer em mais de um tipo — o contador que também é fornecedor, o sócio que também
          é funcionário.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Novo contato</h2>
        <ContatoForm companyId={companyId} />
      </Card>

      {CONTATO_TIPOS.map((tipo) => {
        const doTipo = contatos.filter((c) => c.tipo === tipo);
        if (doTipo.length === 0) return null;
        return (
          <Card key={tipo}>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                {CONTATO_TIPO_LABELS_PLURAL[tipo]}{" "}
                <span className="font-normal text-foreground/50">({doTipo.length})</span>
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {doTipo.map((contato) => (
                <li
                  key={contato.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {contato.nome}
                      {!contato.ativo && (
                        <span className="ml-2 text-xs font-normal text-foreground/40">
                          inativo
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-foreground/50">
                      {[contato.cpf_cnpj, contato.email, contato.telefone]
                        .filter(Boolean)
                        .join(" · ") || "sem dados de contato"}
                    </p>
                  </div>
                  <ToggleContatoButton
                    companyId={companyId}
                    contatoId={contato.id}
                    ativo={contato.ativo}
                  />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      {contatos.length === 0 && (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nenhum contato cadastrado ainda.
        </Card>
      )}
    </div>
  );
}
