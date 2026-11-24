import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { ferramentasNewton } from "@/lib/newton-chat";
import { CONHECIMENTO_PRESUMIDO, MANUAL_NEWTON } from "@/lib/newton-conhecimento";

export const maxDuration = 300;

function sistema(competencia: string) {
  return `Você é o Newton, analista fiscal de IA da SOMA Contabilidade (Petrópolis), responsável pela carteira do Lucro Presumido de Petrópolis e do Rio. Você conversa com a equipe (sócio, Paulo, Douglas) pela aba lateral da tela do Newton.

Competência do fechamento atual: ${competencia} (use essa, salvo se pedirem outra).

Como agir:
- Responda sempre com base nas ferramentas — nunca invente número, empresa ou situação.
- Para analisar notas (descrição, código do serviço, tomador, retenções, ISS retido), use a ferramenta notasDaEmpresa — você consegue ler nota a nota.
- Ações seguras (conferirPrefeitura, auditarComIa) você executa quando pedirem, e diz o resultado.
- Você NÃO encerra o MIT, NÃO transmite a DCTFWeb, NÃO gera DARF e NÃO manda mensagem a cliente: oriente a usar os botões do "Fluxo do mês" NESTA MESMA tela do Newton (/admin/newton).
- Para o que não tem ferramenta (alterar cadastro), explique o que fazer e a tela exata. A equiparação nota a nota se revisa no botão "revisar equiparação" da empresa nesta tela.
- Links de tela de empresa: use SEMPRE o caminho com o id real que vem da ferramenta detalheEmpresa (campo telas/id). Nunca escreva "{id}"; se ainda não tem o id, chame detalheEmpresa antes.
- Português do Brasil, direto e curto; listas quando ajudar. Valores em R$.

${CONHECIMENTO_PRESUMIDO}

${MANUAL_NEWTON}`;
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
    await supabase.from("serena_mensagens").insert({ user_id: user.id, role: "user", content: textoUsuario.slice(0, 8000), analista: "NEWTON" });
  }

  const competencia = mesAnteriorBrasilia();
  const result = streamText({
    model: anthropic(process.env.NEWTON_CHAT_MODELO || process.env.SERENA_CHAT_MODELO || "claude-sonnet-5-5"),
    system: sistema(competencia),
    messages: await convertToModelMessages(messages.slice(-16)),
    tools: ferramentasNewton(supabase, competencia),
    stopWhen: stepCountIs(8),
    onFinish: async ({ text, steps }) => {
      const resultados = steps.flatMap((s) => s.toolResults ?? []) as { toolName: string }[];
      await supabase.from("serena_mensagens").insert({
        user_id: user.id,
        role: "assistant",
        content: text,
        ferramentas: resultados.length ? resultados.map((r) => r.toolName) : null,
        analista: "NEWTON",
      });
      await logAudit({ action: "NEWTON_CHAT", entity: "serena_mensagens", newValue: { pergunta: textoUsuario?.slice(0, 500), ferramentas: resultados.map((r) => r.toolName) } });
    },
  });

  return result.toUIMessageStreamResponse();
}
