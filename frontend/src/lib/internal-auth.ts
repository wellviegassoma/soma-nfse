import crypto from "node:crypto";

// Comparação em tempo constante — evita timing attack pra adivinhar o
// segredo, e falha fechado (nunca autoriza) se CRON_SECRET não estiver
// configurado. Achado real: sem essa checagem, `CRON_SECRET` ausente virava
// a string literal "undefined" na comparação (`Bearer ${undefined}`), e
// mandar o header `Authorization: Bearer undefined` passava despercebido.
//
// Usado tanto pelos crons agendados (Vercel Cron) quanto pelas rotas da
// Rotina de Fechamento chamadas sob demanda (por um humano no chat, sem
// sessão de staff no navegador) — o mesmo segredo compartilhado serve pros
// dois casos, o que importa é que só quem tem `CRON_SECRET` consegue chamar.
export function autorizarChamadaInterna(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || !authHeader) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${esperado}`);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
