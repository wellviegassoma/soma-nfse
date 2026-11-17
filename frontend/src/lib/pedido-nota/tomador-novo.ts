import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarDadosTomadorAction } from "@/lib/actions/tomadores";

// Cadastro do tomador direto pelo painel de pedidos de nota: o cliente
// costuma mandar nome + CPF do paciente (ou CNPJ da empresa) na mensagem;
// com o documento válido, o tomador é cadastrado na hora de aprovar, sem
// passar pela tela de tomadores. CNPJ: completa com os dados da Receita
// (mesma busca da tela de tomadores). CPF: completa com o cadastro do mesmo
// CPF em outra empresa da SOMA, se houver.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(cnpj[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

/** Problema com os dados do tomador novo, ou null se dá para cadastrar. */
export function problemaTomadorNovo(nome: string | null, documento: string | null): string | null {
  const doc = (documento ?? "").replace(/\D/g, "");
  if (!doc) return "Falta o CPF/CNPJ do tomador.";
  if (doc.length === 11 && !cpfValido(doc)) return "CPF do tomador inválido: confira os dígitos.";
  if (doc.length === 14 && !cnpjValido(doc)) return "CNPJ do tomador inválido: confira os dígitos.";
  if (doc.length !== 11 && doc.length !== 14) return "CPF/CNPJ do tomador precisa ter 11 ou 14 dígitos.";
  if (doc.length === 11 && (nome ?? "").trim().length < 3) return "Falta o nome do tomador.";
  return null;
}

/**
 * Cadastra (ou reaproveita, se o documento já existir na empresa) o tomador
 * e devolve o id. `supabase` é o cliente do usuário logado (RLS de staff).
 */
export async function cadastrarTomadorNovo(
  supabase: Supa,
  companyId: string,
  nome: string | null,
  documento: string,
): Promise<{ customerId: string } | { error: string }> {
  const doc = documento.replace(/\D/g, "");
  const problema = problemaTomadorNovo(nome, doc);
  if (problema) return { error: problema };

  const { data: existente } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("cpf_cnpj", doc)
    .maybeSingle();
  if (existente?.id) return { customerId: existente.id as string };

  const busca = await buscarDadosTomadorAction(companyId, doc).catch(() => ({ error: "busca indisponível" }));
  const d = "data" in busca ? busca.data : {};
  const nomeFinal = (doc.length === 14 ? d.nome || nome : nome || d.nome)?.trim();
  if (!nomeFinal) return { error: "Falta o nome do tomador." };

  const { data: criado, error } = await supabase
    .from("customers")
    .insert({
      company_id: companyId,
      type: doc.length === 14 ? "PJ" : "PF",
      name: nomeFinal,
      cpf_cnpj: doc,
      email: d.email || null,
      phone: d.telefone ? d.telefone.replace(/\D/g, "") || null : null,
      municipal_registration: d.inscricaoMunicipal || null,
      zip_code: d.cep || null,
      address: d.endereco || null,
      number: d.numero || null,
      complement: d.complemento || null,
      district: d.bairro || null,
      city: d.cidade || null,
      state: d.uf || null,
    })
    .select("id")
    .single();
  if (error || !criado) {
    return { error: error?.code === "23505" ? "Já existe um tomador com esse CPF/CNPJ." : "Não foi possível cadastrar o tomador." };
  }
  return { customerId: criado.id as string };
}
