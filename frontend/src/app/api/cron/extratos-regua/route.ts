import { NextResponse } from "next/server";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { executarRegua } from "@/lib/extratos-regua";

export const maxDuration = 300;

/**
 * Dias úteis às 9h (Brasília): régua automática de cobrança de extratos.
 * Só envia com a régua ligada (Extratos → Cobrança). `?previa=1` lista quem
 * receberia, sem enviar; `&hoje=YYYY-MM-DD` simula outro dia na prévia.
 */
export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const previa = sp.get("previa") === "1";
  const hoje = previa && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("hoje") ?? "") ? sp.get("hoje")! : undefined;
  return NextResponse.json(await executarRegua({ previa, hoje }));
}
