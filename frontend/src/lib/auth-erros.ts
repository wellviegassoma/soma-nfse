// Traduz os erros do Supabase Auth ao enviar convite / link de senha para
// uma mensagem que diga o que aconteceu de fato (antes tudo virava
// "Não foi possível reenviar o convite").

type ErroAuth = { code?: string; status?: number; message?: string } | null | undefined;

export function ehContaExistente(erro: ErroAuth): boolean {
  if (!erro) return false;
  return erro.code === "email_exists" || /already been registered/i.test(erro.message ?? "");
}

export function traduzirErroEnvio(erro: ErroAuth): string {
  const code = erro?.code ?? "";
  const msg = erro?.message ?? "";

  const segundos = msg.match(/after (\d+) seconds?/i)?.[1];
  if (segundos) {
    return `Já foi enviado um e-mail para esse endereço há pouco. Aguarde ${segundos} segundos e tente de novo.`;
  }
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(msg)) {
    return "Limite de e-mails por hora do sistema atingido. Tente de novo mais tarde.";
  }
  if (code === "over_request_rate_limit" || erro?.status === 429) {
    return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  }
  if (ehContaExistente(erro)) {
    return "Esse e-mail já tem conta no sistema.";
  }
  if (code === "email_address_invalid" || code === "validation_failed") {
    return "O e-mail informado é inválido ou foi recusado.";
  }
  if (/error sending/i.test(msg) || code === "unexpected_failure") {
    return "O servidor de e-mail (SMTP) recusou o envio. Confira a configuração de SMTP no Supabase.";
  }
  return msg ? `Não foi possível enviar o e-mail: ${msg}` : "Não foi possível enviar o e-mail.";
}
