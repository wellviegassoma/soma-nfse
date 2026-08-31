import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { ModelosPicker } from "@/components/precificacao-modelos/ModelosPicker";
import { buscarModelosAtivos } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Modelos de precificação" };

export default async function PrecificacaoModelosPage(
  props: PageProps<"/empresas/[companyId]/precificacao/modelos">,
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/empresas/${companyId}/precificacao`;

  const modelos = await buscarModelosAtivos(supabase);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-foreground/60">
        Comece com um catálogo pronto, mantido pela equipe SOMA, e ajuste depois do jeito que
        precisar — importar não apaga nada do que já estiver cadastrado.
      </p>
      <ModelosPicker companyId={companyId} basePath={basePath} modelos={modelos} />
    </div>
  );
}
