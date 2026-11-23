import "server-only";

// Alertas de Tarefas por e-mail (docs/tarefas.md §10.3): um e-mail por
// responsável com o que vence hoje, nos próximos 3 dias, atrasadas e risco
// de multa (só se houver algo), e um resumo do risco da carteira para quem
// administra (permissão configuracoes.editar).

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { nomeEmpresa } from "@/lib/tarefas";
import { ddmm, rotuloCompetencia, situacaoTarefa, somarDias, type Situacao, type StatusTarefa } from "@/lib/tarefas-comum";

type Db = SupabaseClient;

type Aberta = {
  id: string;
  competencia: string;
  responsavel_id: string | null;
  status: StatusTarefa;
  prazo_meta: string | null;
  prazo_legal: string | null;
  aguardando_cliente: boolean;
  tarefa_modelos: { nome: string } | null;
  companies: { legal_name: string; trade_name: string | null; codigo_cliente: string | null } | null;
};

export type EmailAlerta = { para: string; nome: string; assunto: string; html: string; texto: string; itens: number };

const GRUPOS: { sit: Situacao | "PROXIMOS"; titulo: string; cor: string }[] = [
  { sit: "RISCO", titulo: "Risco de multa (passou do prazo legal)", cor: "#7f1d1d" },
  { sit: "ATRASADA", titulo: "Atrasadas (passou da meta SOMA)", cor: "#b91c1c" },
  { sit: "HOJE", titulo: "Meta hoje", cor: "#b45309" },
  { sit: "PROXIMOS", titulo: "Próximos 3 dias", cor: "#92400e" },
];

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function grupoDe(t: Aberta, hoje: string): (typeof GRUPOS)[number]["sit"] | null {
  const s = situacaoTarefa(t, hoje);
  if (s === "RISCO" || s === "ATRASADA" || s === "HOJE") return s;
  const alvo = t.prazo_meta ?? t.prazo_legal;
  if (s === "SEMANA" && alvo && alvo <= somarDias(hoje, 3)) return "PROXIMOS";
  return null;
}

function montar(nome: string, tarefas: Aberta[], hoje: string, site: string, titulo: string) {
  const porGrupo = new Map<string, Aberta[]>();
  for (const t of tarefas) {
    const g = grupoDe(t, hoje);
    if (!g) continue;
    const arr = porGrupo.get(g) ?? [];
    arr.push(t);
    porGrupo.set(g, arr);
  }
  const total = [...porGrupo.values()].reduce((n, a) => n + a.length, 0);
  const secoesHtml: string[] = [];
  const secoesTexto: string[] = [];
  for (const g of GRUPOS) {
    const lista = (porGrupo.get(g.sit) ?? []).sort((a, b) => (a.prazo_meta ?? "").localeCompare(b.prazo_meta ?? ""));
    if (!lista.length) continue;
    const mostrar = lista.slice(0, 40);
    secoesHtml.push(
      `<h3 style="margin:18px 0 6px;color:${g.cor};font-size:15px">${esc(g.titulo)} — ${lista.length}</h3>` +
        `<table style="border-collapse:collapse;width:100%;font-size:13px">` +
        mostrar
          .map(
            (t) =>
              `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(t.tarefa_modelos?.nome ?? "—")}</td>` +
              `<td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(t.companies ? nomeEmpresa(t.companies) : "—")}</td>` +
              `<td style="padding:3px 6px;border-bottom:1px solid #eee;white-space:nowrap">${rotuloCompetencia(t.competencia)}</td>` +
              `<td style="padding:3px 6px;border-bottom:1px solid #eee;white-space:nowrap">meta ${ddmm(t.prazo_meta)} · legal ${ddmm(t.prazo_legal)}</td></tr>`,
          )
          .join("") +
        `</table>` +
        (lista.length > mostrar.length ? `<p style="font-size:12px;color:#666">… e mais ${lista.length - mostrar.length}.</p>` : ""),
    );
    secoesTexto.push(
      `${g.titulo} — ${lista.length}\n` +
        mostrar.map((t) => `- ${t.tarefa_modelos?.nome ?? "—"} · ${t.companies ? nomeEmpresa(t.companies) : "—"} · meta ${ddmm(t.prazo_meta)}`).join("\n"),
    );
  }
  const link = `${site}/admin/tarefas`;
  return {
    total,
    html:
      `<div style="font-family:Arial,sans-serif;color:#111;max-width:760px">` +
      `<p>Olá, ${esc(nome)}.</p><p>${esc(titulo)}</p>${secoesHtml.join("")}` +
      (site
        ? `<p style="margin-top:20px"><a href="${link}" style="background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Abrir Tarefas</a></p>`
        : "") +
      `<p style="font-size:11px;color:#888">E-mail automático do SOMA Gestão.</p></div>`,
    texto: `Olá, ${nome}.\n${titulo}\n\n${secoesTexto.join("\n\n")}${site ? `\n\nAbrir: ${link}` : ""}`,
  };
}

/** Monta (não envia) os e-mails do dia. */
export async function montarAlertas(db: Db, hoje: string): Promise<EmailAlerta[]> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const abertas = await buscarTudoPaginado<Aberta>((from, to) =>
    db
      .from("tarefas")
      .select("id, competencia, responsavel_id, status, prazo_meta, prazo_legal, aguardando_cliente, tarefa_modelos(nome), companies(legal_name, trade_name, codigo_cliente)")
      .in("status", ["A_FAZER", "EM_ANDAMENTO"])
      .lte("prazo_meta", somarDias(hoje, 3))
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: Aberta[] | null; error: { message: string } | null }>,
  );
  if (!abertas.length) return [];

  const { data: gestoresRaw } = await db
    .from("usuario_permissoes")
    .select("user_id")
    .is("company_id", null)
    .eq("permissao", "configuracoes.editar");
  const gestores = new Set((gestoresRaw ?? []).map((g) => g.user_id as string));
  const ids = [...new Set([...abertas.map((t) => t.responsavel_id).filter(Boolean), ...gestores])] as string[];
  const { data: perfis } = await db.from("profiles").select("id, full_name, email, ativo").in("id", ids);
  const perfil = new Map((perfis ?? []).filter((p) => p.ativo !== false && p.email).map((p) => [p.id as string, p]));

  const emails: EmailAlerta[] = [];
  const porResp = new Map<string, Aberta[]>();
  for (const t of abertas) {
    if (!t.responsavel_id) continue;
    const arr = porResp.get(t.responsavel_id) ?? [];
    arr.push(t);
    porResp.set(t.responsavel_id, arr);
  }
  for (const [uid, lista] of porResp) {
    const p = perfil.get(uid);
    if (!p) continue;
    const nome = (p.full_name as string) || (p.email as string);
    const m = montar(nome.split(" ")[0], lista, hoje, site, "Suas tarefas que pedem atenção hoje:");
    if (!m.total) continue;
    emails.push({ para: p.email as string, nome, assunto: `Tarefas: ${m.total} pedem atenção hoje`, html: m.html, texto: m.texto, itens: m.total });
  }

  // Gestor: risco de multa e atrasadas da carteira inteira (inclui sem responsável).
  const criticas = abertas.filter((t) => {
    const s = situacaoTarefa(t, hoje);
    return s === "RISCO" || s === "ATRASADA";
  });
  if (criticas.length) {
    for (const uid of gestores) {
      const p = perfil.get(uid);
      if (!p) continue;
      const nome = (p.full_name as string) || (p.email as string);
      const m = montar(nome.split(" ")[0], criticas, hoje, site, "Resumo da carteira — atrasadas e risco de multa de toda a equipe:");
      emails.push({ para: p.email as string, nome, assunto: `Carteira: ${criticas.length} tarefas atrasadas ou em risco`, html: m.html, texto: m.texto, itens: m.total });
    }
  }
  return emails;
}
