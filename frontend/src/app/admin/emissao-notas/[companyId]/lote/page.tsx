import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoteEmissao } from "./LoteEmissao";

export const metadata = { title: "Emitir em lote — Painel SOMA" };

export default async function LoteEmissaoPage(props: PageProps<"/admin/emissao-notas/[companyId]/lote">) {
  const { companyId } = await props.params;
  await requirePermissao("notas.emitir", companyId);

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, trade_name, codigo_cliente")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) notFound();

  const basePath = `/admin/emissao-notas/${companyId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">
          Emitir em lote — {company.codigo_cliente && `#${company.codigo_cliente} `}
          {company.trade_name || company.legal_name}
        </h1>
        <Link href={basePath} className="text-sm text-foreground/60 hover:underline">
          ← Voltar para emissão de uma nota
        </Link>
      </div>
      <LoteEmissao companyId={companyId} basePath={basePath} />
    </div>
  );
}
