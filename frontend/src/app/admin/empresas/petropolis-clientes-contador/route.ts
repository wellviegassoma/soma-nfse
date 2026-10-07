import { NextResponse } from "next/server";
import { requireSomaStaff } from "@/lib/auth";

export const maxDuration = 90;

// Só leitura — lista (CMC, nome) dos clientes do login único do escritório no
// ISS de Petrópolis, pra cruzar com o cadastro e preencher companies.petropolis_cmc.
export async function GET() {
  await requireSomaStaff();
  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/clientes-contador`, {
      method: "POST",
      headers: { "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o ISS de Petrópolis agora." }, { status: 502 });
  }
  const corpo = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: corpo?.detail ?? "Falha ao listar os clientes." }, { status: 502 });
  }
  return NextResponse.json(corpo);
}
