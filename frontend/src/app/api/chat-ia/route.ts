import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { chatTools } from "@/lib/ai/tools";

export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é o assistente interno da SOMA Contabilidade, usado só por staff da SOMA pra consultar informações do próprio sistema (fiscal, legalização, extratos, societário, certificados).

Regras:
- Responda SEMPRE com base no retorno das ferramentas. Nunca invente número, data ou nome de empresa.
- Se nenhuma ferramenta cobrir a pergunta, diga isso claramente em vez de arriscar um chute.
- Se a pergunta citar uma empresa pelo nome, use buscarEmpresa primeiro pra achar o companyId antes de usar as outras ferramentas.
- Pra analisar um documento já anexado no sistema, use listarDocumentosDaEmpresa pra achar o documentoId certo, depois lerConteudoDocumento.
- Seja direto e objetivo — é uma ferramenta de trabalho do dia a dia, não uma conversa social.`;

export async function POST(request: Request) {
  await requireSomaStaff();
  const user = await requireUser();

  const body = (await request.json()) as { messages: UIMessage[]; conversaId: string };
  const { messages, conversaId } = body;

  const supabase = await createClient();
  const { data: conversa } = await supabase
    .from("chat_ia_conversas")
    .select("id")
    .eq("id", conversaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conversa) {
    return new Response("Conversa não encontrada.", { status: 404 });
  }

  const ultimaMensagem = messages[messages.length - 1];
  const textoUltimaMensagem = ultimaMensagem?.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  if (ultimaMensagem?.role === "user" && textoUltimaMensagem) {
    await supabase.from("chat_ia_mensagens").insert({
      conversa_id: conversaId,
      role: "user",
      content: textoUltimaMensagem,
    });
  }

  const result = streamText({
    model: anthropic("claude-sonnet-5"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: chatTools,
    stopWhen: stepCountIs(8),
    onFinish: async ({ text, toolCalls }) => {
      await supabase.from("chat_ia_mensagens").insert({
        conversa_id: conversaId,
        role: "assistant",
        content: text,
        tool_calls: toolCalls.length > 0 ? toolCalls : null,
      });
      await supabase
        .from("chat_ia_conversas")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversaId);
      await logAudit({
        action: "CHAT_IA_CONSULTA",
        entity: "chat_ia_conversa",
        entityId: conversaId,
        newValue: { pergunta: textoUltimaMensagem, ferramentas: toolCalls.map((t) => t.toolName) },
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
