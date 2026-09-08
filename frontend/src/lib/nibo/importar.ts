import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { paginarTudo } from "@/lib/supabase-paginacao";
import { nibo, NiboError } from "./client";
import {
  mapearAgendamento,
  mapearCategoria,
  mapearConta,
  mapearContato,
  type AgendamentoMapeado,
} from "./mapeamento";

/**
 * Migração de uma empresa do Nibo para o SOMA Gestão.
 *
 * Duas garantias que definem o desenho:
 *
 * 1. `dryRun` é o padrão. A primeira execução só LÊ o Nibo e devolve o
 *    relatório do que faria. Migração é irreversível na prática (desfazer
 *    exige apagar dado real do cliente), então ver antes é obrigatório.
 * 2. É IDEMPOTENTE por `nibo_id`. Rodar duas vezes não duplica: cada registro
 *    guarda o id de origem e o segundo passe reconhece o que já veio. Sem
 *    isso, uma queda no meio deixaria a empresa com metade dobrada.
 */

export type Relatorio = {
  dryRun: boolean;
  companyId: string;
  contas: { lidas: number; criadas: number; existentes: number };
  categorias: { lidas: number; criadas: number; existentes: number; incertas: string[] };
  centrosCusto: { lidos: number; criados: number; existentes: number };
  contatos: { lidos: number; criados: number; existentes: number };
  agendamentos: {
    lidos: number;
    criados: number;
    existentes: number;
    ignorados: { niboId: string; motivo: string }[];
  };
  avisos: string[];
  erro?: string;
};

function vazio(companyId: string, dryRun: boolean): Relatorio {
  return {
    dryRun,
    companyId,
    contas: { lidas: 0, criadas: 0, existentes: 0 },
    categorias: { lidas: 0, criadas: 0, existentes: 0, incertas: [] },
    centrosCusto: { lidos: 0, criados: 0, existentes: 0 },
    contatos: { lidos: 0, criados: 0, existentes: 0 },
    agendamentos: { lidos: 0, criados: 0, existentes: 0, ignorados: [] },
    avisos: [],
  };
}

export async function importarEmpresaDoNibo(params: {
  companyId: string;
  apitoken: string;
  dryRun?: boolean;
}): Promise<Relatorio> {
  const { companyId, apitoken } = params;
  const dryRun = params.dryRun !== false;
  const rel = vazio(companyId, dryRun);
  // Service role de propósito: a migração roda fora de sessão de usuário.
  const db = createAdminClient();

  try {
    const [contas, categorias, centros, contatos, agendamentos] = await Promise.all([
      nibo.contas(apitoken),
      nibo.categorias(apitoken),
      nibo.centrosCusto(apitoken),
      nibo.contatos(apitoken),
      nibo.agendamentos(apitoken),
    ]);

    rel.contas.lidas = contas.length;
    rel.categorias.lidas = categorias.length;
    rel.centrosCusto.lidos = centros.length;
    rel.contatos.lidos = contatos.length;
    rel.agendamentos.lidos = agendamentos.length;

    // -----------------------------------------------------------------------
    // Categorias
    // -----------------------------------------------------------------------
    const catsMapeadas = categorias.map(mapearCategoria);
    rel.categorias.incertas = catsMapeadas
      .filter((c) => c.grupoIncerto)
      .map((c) => `${c.nome} (grupo no Nibo: ${c.grupoOriginal ?? "vazio"})`);

    // Sem paginar, o PostgREST corta em 1000 linhas sem avisar — a checagem
    // de idempotência abaixo passaria a duplicar em silêncio a partir da
    // milésima categoria/contato/agendamento já existente. Achado real: o
    // histórico da SOMA importado da planilha já passa disso em agendamentos.
    const catsExistentes = await paginarTudo<{ id: string; nome: string; nibo_id: string | null }>(
      (from, to) =>
        db
          .from("fin_categorias")
          .select("id, nome, nibo_id")
          .eq("company_id", companyId)
          .range(from, to),
    );
    const catPorNibo = new Map(
      catsExistentes.filter((c) => c.nibo_id).map((c) => [c.nibo_id as string, c.id]),
    );
    // Empresa que já tem o plano padrão semeado: casa por nome pra não criar
    // "Aluguel" duas vezes só porque uma veio do seed e outra do Nibo.
    const catPorNome = new Map(catsExistentes.map((c) => [c.nome.trim().toLowerCase(), c.id]));

    for (const c of catsMapeadas) {
      if (catPorNibo.has(c.niboId)) {
        rel.categorias.existentes++;
        continue;
      }
      const idPorNome = catPorNome.get(c.nome.toLowerCase());
      if (idPorNome) {
        rel.categorias.existentes++;
        if (!dryRun) {
          await db.from("fin_categorias").update({ nibo_id: c.niboId }).eq("id", idPorNome);
        }
        catPorNibo.set(c.niboId, idPorNome);
        continue;
      }
      rel.categorias.criadas++;
      if (!dryRun) {
        const { data } = await db
          .from("fin_categorias")
          .insert({
            company_id: companyId,
            grupo: c.grupo,
            nome: c.nome,
            natureza: c.natureza,
            nibo_id: c.niboId,
            ordem: 5000,
          })
          .select("id")
          .single();
        if (data) catPorNibo.set(c.niboId, data.id);
      }
    }

    // -----------------------------------------------------------------------
    // Centros de custo
    // -----------------------------------------------------------------------
    const centrosExistentes = await paginarTudo<{ id: string; nome: string; nibo_id: string | null }>(
      (from, to) =>
        db
          .from("fin_centros_custo")
          .select("id, nome, nibo_id")
          .eq("company_id", companyId)
          .range(from, to),
    );
    const centroPorNibo = new Map(
      centrosExistentes.filter((c) => c.nibo_id).map((c) => [c.nibo_id as string, c.id]),
    );

    for (const c of centros) {
      const niboId = c.costCenterId ?? c.id;
      const nome = (c.description ?? c.name ?? "").trim();
      if (!niboId || !nome) continue;
      if (centroPorNibo.has(niboId)) {
        rel.centrosCusto.existentes++;
        continue;
      }
      rel.centrosCusto.criados++;
      if (!dryRun) {
        const { data } = await db
          .from("fin_centros_custo")
          .insert({ company_id: companyId, nome, nibo_id: niboId })
          .select("id")
          .single();
        if (data) centroPorNibo.set(niboId, data.id);
      }
    }

    // -----------------------------------------------------------------------
    // Contas bancárias (extrato_contas_bancarias é o cadastro canônico)
    // -----------------------------------------------------------------------
    const contasExistentes = await paginarTudo<{ id: string; nibo_id: string | null }>(
      (from, to) =>
        db
          .from("extrato_contas_bancarias")
          .select("id, nibo_id")
          .eq("company_id", companyId)
          .range(from, to),
    );
    const contaPorNibo = new Map(
      contasExistentes.filter((c) => c.nibo_id).map((c) => [c.nibo_id as string, c.id]),
    );

    for (const bruta of contas) {
      const c = mapearConta(bruta);
      if (contaPorNibo.has(c.niboId)) {
        rel.contas.existentes++;
        continue;
      }
      rel.contas.criadas++;
      if (!dryRun) {
        const { data } = await db
          .from("extrato_contas_bancarias")
          .insert({
            company_id: companyId,
            banco: c.banco,
            agencia: c.agencia,
            conta: c.conta,
            tipo: c.tipo,
            saldo_inicial: c.saldoInicial,
            data_saldo_inicial: c.dataSaldoInicial,
            ativo: c.ativo,
            nibo_id: c.niboId,
          })
          .select("id")
          .single();
        if (data) contaPorNibo.set(c.niboId, data.id);
      }
    }

    // -----------------------------------------------------------------------
    // Contatos
    // -----------------------------------------------------------------------
    const contatosExistentes = await paginarTudo<{ id: string; nibo_id: string | null }>(
      (from, to) =>
        db
          .from("fin_contatos")
          .select("id, nibo_id")
          .eq("company_id", companyId)
          .range(from, to),
    );
    const contatoPorNibo = new Map(
      contatosExistentes.filter((c) => c.nibo_id).map((c) => [c.nibo_id as string, c.id]),
    );

    for (const bruto of contatos) {
      const c = mapearContato(bruto);
      if (contatoPorNibo.has(c.niboId)) {
        rel.contatos.existentes++;
        continue;
      }
      rel.contatos.criados++;
      if (!dryRun) {
        const { data } = await db
          .from("fin_contatos")
          .insert({
            company_id: companyId,
            tipo: c.tipo,
            nome: c.nome,
            cpf_cnpj: c.cpfCnpj,
            email: c.email,
            nibo_id: c.niboId,
          })
          .select("id")
          .single();
        if (data) contatoPorNibo.set(c.niboId, data.id);
      }
    }

    // -----------------------------------------------------------------------
    // Agendamentos (com rateio)
    //
    // O histórico de PAGAMENTOS não é importado nesta versão: sem a conta
    // bancária de cada baixa o saldo sairia errado, e o extrato reimportado
    // pela conciliação reconstrói o caixa com mais fidelidade. Agendamento já
    // liquidado no Nibo entra como LIQUIDADO sem lançamento — ver aviso.
    // -----------------------------------------------------------------------
    // O ponto mais crítico dos cinco: a SOMA já tem 7.136 agendamentos
    // (histórico real importado da planilha do Nibo) — bem acima dos 1000
    // que o PostgREST devolveria sem paginar. Sem esta correção, rodar esta
    // migração via API para a SOMA hoje duplicaria silenciosamente milhares
    // de agendamentos que já existem.
    const agsExistentes = await paginarTudo<{ nibo_id: string }>((from, to) =>
      db
        .from("fin_agendamentos")
        .select("nibo_id")
        .eq("company_id", companyId)
        .not("nibo_id", "is", null)
        .range(from, to),
    );
    const agsJaImportados = new Set(agsExistentes.map((a) => a.nibo_id));

    let liquidadosSemLancamento = 0;

    for (const bruto of agendamentos) {
      const a: AgendamentoMapeado = mapearAgendamento(bruto);

      if (agsJaImportados.has(a.niboId)) {
        rel.agendamentos.existentes++;
        continue;
      }
      if (a.problema) {
        rel.agendamentos.ignorados.push({ niboId: a.niboId, motivo: a.problema });
        continue;
      }

      const categoriasResolvidas = a.categorias
        .map((c) => ({ id: catPorNibo.get(c.niboId), valor: c.valor }))
        .filter((c): c is { id: string; valor: number } => Boolean(c.id));

      if (categoriasResolvidas.length === 0) {
        rel.agendamentos.ignorados.push({
          niboId: a.niboId,
          motivo: "categoria do Nibo não encontrada no destino",
        });
        continue;
      }

      if (a.jaPago > 0) liquidadosSemLancamento++;
      rel.agendamentos.criados++;
      if (dryRun) continue;

      const { data: criado } = await db
        .from("fin_agendamentos")
        .insert({
          company_id: companyId,
          tipo: a.tipo,
          contato_id: a.contatoNiboId ? contatoPorNibo.get(a.contatoNiboId) ?? null : null,
          vencimento: a.vencimento,
          previsto_para: a.previstoPara,
          descricao: a.descricao,
          valor_bruto: a.valorBruto,
          nibo_id: a.niboId,
        })
        .select("id")
        .single();
      if (!criado) {
        rel.agendamentos.criados--;
        rel.agendamentos.ignorados.push({ niboId: a.niboId, motivo: "falha ao gravar" });
        continue;
      }

      await db.from("fin_agendamento_categorias").insert(
        categoriasResolvidas.map((c) => ({
          agendamento_id: criado.id,
          categoria_id: c.id,
          valor: c.valor,
        })),
      );

      const centrosResolvidos = a.centrosCusto
        .map((c) => ({
          id: centroPorNibo.get(c.niboId),
          percentual: c.percentual,
          valor: c.valor,
        }))
        .filter((c): c is { id: string; percentual: number | null; valor: number } =>
          Boolean(c.id),
        );
      if (centrosResolvidos.length > 0) {
        await db.from("fin_agendamento_centros_custo").insert(
          centrosResolvidos.map((c) => ({
            agendamento_id: criado.id,
            centro_custo_id: c.id,
            percentual: c.percentual,
            valor: c.valor,
          })),
        );
      }
    }

    if (liquidadosSemLancamento > 0) {
      rel.avisos.push(
        `${liquidadosSemLancamento} agendamento(s) já tinham baixa no Nibo e vieram como EM ABERTO: o histórico de pagamentos não é migrado, porque sem a conta bancária de cada baixa o saldo sairia errado. Reimporte o extrato pela Conciliação para reconstruir o caixa.`,
      );
    }
    if (rel.categorias.incertas.length > 0) {
      rel.avisos.push(
        `${rel.categorias.incertas.length} categoria(s) caíram em "Custos e despesas operacionais" por não dar pra deduzir o grupo. Confira antes de usar o Painel.`,
      );
    }

    return rel;
  } catch (e) {
    rel.erro =
      e instanceof NiboError
        ? e.message
        : `Falha inesperada: ${e instanceof Error ? e.message : String(e)}`;
    return rel;
  }
}
