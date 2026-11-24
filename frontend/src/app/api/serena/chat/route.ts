import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { ferramentasSerena } from "@/lib/serena-chat";
import { CONHECIMENTO_SIMPLES, MANUAL_SOMA } from "@/lib/serena-conhecimento";

export const maxDuration = 300;

function sistema(competencia: string) {
  return `Você é a Serena, analista fiscal de IA da SOMA Contabilidade (Petrópolis), responsável pela carteira do Simples Nacional de Petrópolis e do Rio. Você conversa com a equipe (sócio, Paulo, Douglas) pela aba lateral da tela da Serena.

Competência do fechamento atual: ${competencia} (use essa, salvo se pedirem outra).

Como agir:
- Responda sempre com base nas ferramentas — nunca invente número, empresa ou situação.
- Ações seguras (conferirPrefeitura, auditarComIa) você executa quando pedirem, e diz o resultado.
- Qualquer coisa que muda dado é PROPOSTA: para classificar serviços sem atividade do Simples, chame servicosSemAtividade e depois proporClassificacao — o sistema mostra um cartão e a pessoa confirma. Nunca diga que aplicou: diga que preparou e está aguardando a confirmação no cartão.
- Você NÃO transmite PGDAS, NÃO gera DAS, NÃO emite guia de ISS e NÃO manda mensagem a cliente: oriente a usar os botões do "Fluxo do mês" NESTA MESMA tela da Serena (/admin/serena), onde a conversa está aberta — não na Central do Simples. Guias de ISS do Rio: linha "ISS do Rio fora do DAS", botões 'Conferir guias na Nota Carioca' e 'Emitir guias pendentes'.
- Para o que não tem ferramenta (alterar cadastro, folha, CMC), explique o que fazer e a tela exata do manual.
- Links de tela de empresa: use SEMPRE o caminho com o id real que vem da ferramenta detalheEmpresa (campo telas/id). Nunca escreva "{id}"; se ainda não tem o id, chame detalheEmpresa antes.
- Português do Brasil, direto e curto; listas quando ajudar. Valores em R$.

${CONHECIMENTO_SIMPLES}

${MANUAL_SOMA}`;
}

export async function POST(request: Request) {
  await requireSomaStaff();
  const user = await requireUser();
  const { messages } = (await request.json()) as { messages: UIMessage[] };
  const supabase = await createClient();

  const ultima = messages[messages.length - 1];
  const textoUsuario = ultima?.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
  if (ultima?.role === "user" && textoUsuario) {
    await supabase.from("serena_mensagens").insert({ user_id: user.id, role: "user", content: textoUsuario.slice(0, 8000) });
  }

  const competencia = mesAnteriorBrasilia();
  const result = streamText({
    model: anthropic(process.env.SERENA_CHAT_MODELO || "claude-sonnet-5-5"),
    system: sistema(competencia),
    // Só as últimas trocas vão para o modelo (o histórico completo fica no banco).
    messages: await convertToModelMessages(messages.slice(-16)),
    tools: ferramentasSerena(supabase, user.id, competencia),
    stopWhen: stepCountIs(8),
    onFinish: async ({ text, steps }) => {
      const resultados = steps.flatMap((s) => s.toolResults ?? []) as { toolName: string; output?: unknown }[];
      const propostas = resultados
        .map((r) => (r.output && typeof r.output === "object" && "propostaId" in r.output ? String((r.output as { propostaId: string }).propostaId) : null))
        .filter(Boolean) as string[];
      await supabase.from("serena_mensagens").insert({
        user_id: user.id,
        role: "assistant",
        content: text,
        proposta_ids: propostas.length ? propostas : null,
        ferramentas: resultados.length ? resultados.map((r) => r.toolName) : null,
      });
      await logAudit({
        action: "SERENA_CHAT",
        entity: "serena_mensagens",
        newValue: { pergunta: textoUsuario?.slice(0, 500), ferramentas: resultados.map((r) => r.toolName) },
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
