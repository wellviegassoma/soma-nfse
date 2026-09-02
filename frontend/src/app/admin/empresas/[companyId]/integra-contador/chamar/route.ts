import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

// Proxy fino pro endpoint genérico do backend (POST /contribuintes/{cnpj}/chamar)
// — chama qualquer serviço já catalogado em catalogo.py sem precisar de
// endpoint dedicado. Útil pra confirmar formato de resposta/versão de um
// serviço novo (Passo 0) antes de construir a UI dedicada — mesmo espírito
// do `GET /catalogo` do backend. Staff-only, mesma auth de todo o resto.
export async function POST(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const { companyId } = await props.params;

  const corpo = await request.json().catch(() => null);
  const idSistema = typeof corpo?.id_sistema === "string" ? corpo.id_sistema : null;
  const idServico = typeof corpo?.id_servico === "string" ? corpo.id_servico : null;
  const dados = corpo?.dados && typeof corpo.dados === "object" ? corpo.dados : {};
  if (!idSistema || !idServico) {
    return NextResponse.json({ error: "id_sistema e id_servico são obrigatórios." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/chamar`, {
      method: "POST",
      headers: {
        "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id_sistema: idSistema, id_servico: idServico, dados }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível falar com o Integra Contador agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "A Serpro recusou a chamada." }, { status: 502 });
  }
  return NextResponse.json({ resposta: body.resposta });
}
