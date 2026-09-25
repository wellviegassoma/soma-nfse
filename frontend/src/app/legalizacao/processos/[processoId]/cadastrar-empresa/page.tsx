import { notFound } from "next/navigation";
import { requirePermissao, isSomaStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { CadastrarEmpresaForm } from "./CadastrarEmpresaForm";

export const metadata = { title: "Cadastrar empresa — Legalização" };

export default async function CadastrarEmpresaPage(
  props: PageProps<"/legalizacao/processos/[processoId]/cadastrar-empresa">,
) {
  const { processoId } = await props.params;
  await requirePermissao("legalizacao.editar");
  const podeCadastrar = await isSomaStaff();

  const supabase = await createClient();
  const { data: processo } = await supabase
    .from("legalizacao_processos")
    .select("id, nome, cnpj, company_id")
    .eq("id", processoId)
    .maybeSingle();
  if (!processo) notFound();

  let empresaExistente = null;
  if (processo.cnpj) {
    const { data } = await supabase
      .from("companies")
      .select("id, legal_name, trade_name")
      .eq("cnpj", processo.cnpj)
      .maybeSingle();
    empresaExistente = data;
  }

  const { data: empresas } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj")
    .eq("ativa", true)
    .order("legal_name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Cadastrar empresa — {processo.nome}</h1>

      {!podeCadastrar ? (
        <Alert tone="danger">
          Você não tem permissão para cadastrar empresas — peça a um administrador (é preciso acesso a
          Empresas).
        </Alert>
      ) : processo.company_id ? (
        <Alert tone="warning">Esse processo já tem uma empresa vinculada.</Alert>
      ) : empresaExistente ? (
        <Alert tone="warning">
          Já existe uma empresa cadastrada com o CNPJ desse processo:{" "}
          <strong>{empresaExistente.trade_name || empresaExistente.legal_name}</strong> — provavelmente já
          virou cliente pelo módulo Comercial. Vincule-a abaixo em vez de criar outra.
        </Alert>
      ) : (
        <p className="text-sm text-foreground/60">
          Confira e complete os dados antes de confirmar — isso cria a empresa de verdade no sistema.
        </p>
      )}

      {podeCadastrar && !processo.company_id && (
        <Card className="max-w-lg p-6 sm:p-8">
          <CadastrarEmpresaForm
            processo={processo}
            empresaExistente={empresaExistente}
            empresas={empresas ?? []}
          />
        </Card>
      )}
    </div>
  );
}
