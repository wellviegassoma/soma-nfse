import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { importarEmpresaDoNibo } from "@/lib/nibo/importar";

/**
 * Migração de uma empresa do Nibo. Operação de mão única, rodada uma vez por
 * empresa, então é rota chamada por curl — não tem tela.
 *
 * O token do Nibo vem no header `x-nibo-token` e NUNCA é gravado: não vai pro
 * banco, não vai pro repositório, não entra em log nem em mensagem de erro. O
 * operador o mantém numa variável de ambiente da própria máquina e ele morre
 * junto com a requisição.
 *
 * Autorização por CRON_SECRET, o mesmo segredo já usado pelos crons — com a
 * mesma comparação em tempo constante que falha fechado se ele não existir.
 */

function autorizado(authHeader: string | null): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado || !authHeader) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${esperado}`);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apitoken = request.headers.get("x-nibo-token");
  if (!apitoken) {
    return NextResponse.json(
      { error: "Informe o token do Nibo no header x-nibo-token." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "Informe ?companyId=..." }, { status: 400 });
  }

  // dryRun só é desligado com "?dryRun=false" explícito. Qualquer outra coisa
  // (ausente, vazio, digitado errado) mantém a simulação — o padrão seguro
  // tem de ser o que acontece quando alguém erra o parâmetro.
  const dryRun = url.searchParams.get("dryRun") !== "false";

  const relatorio = await importarEmpresaDoNibo({ companyId, apitoken, dryRun });

  return NextResponse.json(relatorio, { status: relatorio.erro ? 502 : 200 });
}
