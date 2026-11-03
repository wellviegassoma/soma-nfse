import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { proximaCompetencia } from "@/lib/competencia";

// Login + leitura da grade (e, com ?notas=1, paginar a lista de notas da
// guia) num Chromium de verdade — o Nota Carioca é lento.
export const maxDuration = 300;

export type ReceitaGuia = { codigo: string; descricao: string; base: number | null; principal: number | null };
export type LinhaGuia = {
  competencia: string;
  valor: number | null;
  valor_texto: string;
  origem: string;
  documento: string;
  receitas?: ReceitaGuia[];
  notas?: { numero: string; chave: string; data_emissao: string; valor: number | null }[];
  notas_erro?: string;
};
export type DiferencaNotas = {
  soNaSoma: { numero: string; valor: number; competencia: string; dataEmissao: string | null }[];
  soNoNotaCarioca: { numero: string; valor: number | null; dataEmissao: string; somaTemCancelada: boolean }[];
  valorDiferente: { numero: string; soma: number; notaCarioca: number | null }[];
};
export type ConferenciaIss = {
  linhas: LinhaGuia[];
  pendentes_anteriores: { competencia: string; valor_texto: string; origem: string }[];
  diferencaNotas?: DiferencaNotas;
};

type NotaSoma = { numero: string; valor: number; cancelada: boolean; competencia: string; dataEmissao: string | null };

// Chave NFS-e Nacional: município(7) + amb(1) + tpInsc(1) + CNPJ(14) +
// nNFSe(13) + AAMM(4) + código(9) + DV(1).
function numeroDaChave(chave: string): string {
  return String(Number(chave.slice(23, 36)));
}

// Notas de saída da SOMA na competência, por chave — mesma unificação de
// buscarFaturamentoMensal (dps emitidas aqui + notas_distribuidas do ADN).
async function notasSomaDoMes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  competencia: string,
): Promise<Map<string, NotaSoma>> {
  const inicio = `${competencia}-01`;
  const fim = `${proximaCompetencia(competencia)}-01`;
  const [distribuidas, dps] = await Promise.all([
    buscarTudoPaginado<{
      chave_acesso: string | null;
      numero: string | null;
      valor_servico: number | null;
      cancelada: boolean;
      competencia: string | null;
      data_emissao: string | null;
    }>((from, to) =>
      supabase
        .from("notas_distribuidas")
        .select("chave_acesso, numero, valor_servico, cancelada, competencia, data_emissao")
        .eq("company_id", companyId)
        .eq("direcao", "saida")
        .gte("competencia", inicio)
        .lt("competencia", fim)
        .order("id")
        .range(from, to),
    ),
    buscarTudoPaginado<{
      valor: number;
      status: string;
      data_competencia: string;
      nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
    }>((from, to) =>
      supabase
        .from("dps")
        .select("valor, status, data_competencia, nfse(status, access_key)")
        .eq("company_id", companyId)
        .eq("status", "ACCEPTED")
        .gte("data_competencia", inicio)
        .lt("data_competencia", fim)
        .order("id")
        .range(from, to),
    ),
  ]);

  const porChave = new Map<string, NotaSoma>();
  for (const d of distribuidas) {
    if (!d.chave_acesso) continue;
    porChave.set(d.chave_acesso, {
      numero: d.numero ?? numeroDaChave(d.chave_acesso),
      valor: Number(d.valor_servico ?? 0),
      cancelada: d.cancelada,
      competencia: (d.competencia ?? "").slice(0, 10),
      dataEmissao: d.data_emissao,
    });
  }
  for (const n of dps) {
    const nfse = Array.isArray(n.nfse) ? n.nfse[0] : n.nfse;
    const chave = nfse?.access_key;
    if (!chave || porChave.has(chave)) continue;
    porChave.set(chave, {
      numero: numeroDaChave(chave),
      valor: Number(n.valor),
      cancelada: nfse.status === "CANCELADA",
      competencia: n.data_competencia.slice(0, 10),
      dataEmissao: null,
    });
  }
  return porChave;
}

function compararNotas(soma: Map<string, NotaSoma>, notasCarioca: NonNullable<LinhaGuia["notas"]>): DiferencaNotas {
  const carioca = new Map(notasCarioca.map((n) => [n.chave, n]));
  const diferenca: DiferencaNotas = { soNaSoma: [], soNoNotaCarioca: [], valorDiferente: [] };
  for (const [chave, n] of soma) {
    if (n.cancelada) continue;
    const nc = carioca.get(chave);
    if (!nc) {
      diferenca.soNaSoma.push({ numero: n.numero, valor: n.valor, competencia: n.competencia, dataEmissao: n.dataEmissao });
    } else if (nc.valor == null || Math.abs(nc.valor - n.valor) > 0.005) {
      diferenca.valorDiferente.push({ numero: n.numero, soma: n.valor, notaCarioca: nc.valor });
    }
  }
  for (const [chave, nc] of carioca) {
    const s = soma.get(chave);
    if (!s || s.cancelada) {
      diferenca.soNoNotaCarioca.push({
        numero: nc.numero,
        valor: nc.valor,
        dataEmissao: nc.data_emissao,
        somaTemCancelada: !!s?.cancelada,
      });
    }
  }
  return diferenca;
}

// Só leitura: nunca emite guia (isso continua em impostos/guia-iss).
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;

  const { companyId } = await props.params;
  const searchParams = new URL(request.url).searchParams;
  const competencia = searchParams.get("competencia") ?? "";
  const listarNotas = searchParams.get("notas") === "1";
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, certificates(encrypted_file, encrypted_password, expires_at)")
    .eq("id", companyId)
    .single();
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const certificado = Array.isArray(company.certificates) ? company.certificates[0] : company.certificates;
  if (!certificado) return NextResponse.json({ error: "Sem certificado digital cadastrado." }, { status: 400 });
  if (new Date(certificado.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Certificado digital vencido." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.NOTA_CARIOCA_SERVICE_URL}/conferencia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NOTA_CARIOCA_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        certificado: {
          pfx_base64: decryptSecret(fromBytea(certificado.encrypted_file)).toString("base64"),
          senha: decryptSecret(fromBytea(certificado.encrypted_password)).toString("utf8"),
        },
        competencia,
        // Ordem do CNPJ ≠ 0001 = filial (mesma regra de impostos/guia-iss).
        filial: company.cnpj ? company.cnpj.replace(/\D/g, "").slice(8, 12) !== "0001" : null,
        listar_notas: listarNotas,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o Nota Carioca agora." }, { status: 502 });
  }
  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    const mensagem =
      (corpo && typeof corpo.detail === "string" && corpo.detail) ||
      `Serviço do Nota Carioca respondeu HTTP ${response.status}.`;
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const resultado = (await response.json()) as ConferenciaIss;
  if (listarNotas) {
    const notasCarioca = resultado.linhas.flatMap((l) => l.notas ?? []);
    resultado.diferencaNotas = compararNotas(await notasSomaDoMes(supabase, companyId, competencia), notasCarioca);
  }
  return NextResponse.json(resultado);
}
