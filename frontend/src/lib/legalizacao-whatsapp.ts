import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Grupos do WhatsApp (Digisac) vinculados à empresa — os mesmos da tela
// Dados fiscais → "Grupos do WhatsApp". A tabela é de Atendimento (RLS
// fecha pra quem é só de Legalização), então a leitura é pelo client admin,
// sempre depois de a action/página conferir a permissão de legalização.
export async function gruposWhatsappDaEmpresa(
  companyId: string,
): Promise<{ contactId: string; nome: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pedido_nota_vinculos")
    .select("origem_contact_id, grupo_nome, created_at")
    .eq("origem", "DIGISAC")
    .eq("company_id", companyId)
    .order("created_at");
  return (data ?? []).map((v) => ({
    contactId: v.origem_contact_id as string,
    nome: (v.grupo_nome as string | null) || "Contato do WhatsApp",
  }));
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");

export function mensagemGuia(p: {
  tipo: string;
  empresa: string;
  valor: number | null;
  vencimento: string | null;
}): string {
  const detalhes = [p.valor != null ? `no valor de ${brl(p.valor)}` : null, p.vencimento ? `com vencimento em ${br(p.vencimento)}` : null]
    .filter(Boolean)
    .join(", ");
  return [
    "Olá! Tudo bem?",
    "",
    `Segue a guia de renovação (*${p.tipo}*) da ${p.empresa}${detalhes ? `, ${detalhes}` : ""}.`,
    "",
    "Assim que efetuar o pagamento, por gentileza, nos envie o comprovante por aqui para darmos andamento ao processo.",
    "",
    "Ficamos à disposição!",
  ].join("\n");
}

export function mensagemDocumentos(p: { tipo: string; empresa: string; pendentes: string[] }): string {
  return [
    "Olá! Tudo bem?",
    "",
    `Para darmos andamento à renovação (*${p.tipo}*) da ${p.empresa}, precisamos dos seguintes documentos:`,
    "",
    ...(p.pendentes.length > 0 ? p.pendentes.map((i) => `• ${i}`) : ["• "]),
    "",
    "Pode nos enviar por aqui? Qualquer dúvida, estamos à disposição!",
  ].join("\n");
}
