// "YYYY-MM" de hoje no fuso de Brasília — não usa Date/toISOString puro
// pra não pegar o dia/mês errado perto da virada da meia-noite em UTC
// (mesma pegadinha documentada em notas/page.tsx:formatDateOnly).
export function mesCorrenteBrasilia(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  return `${ano}-${mes}`;
}

// "YYYY-MM" do mês seguinte a `competencia` ("YYYY-MM").
export function proximaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}`;
}

// "YYYY-MM" da competência informada e das (n - 1) anteriores, mais
// recente primeiro — inclui o próprio mês corrente (diferente de
// competenciasRbt12, que exclui o mês de apuração de propósito). Usado
// pra grades mês-a-mês onde o mês atual também precisa aparecer, como o
// controle de entrega de extrato.
export function ultimasCompetencias(competenciaAlvo: string, n: number): string[] {
  const [ano, mes] = competenciaAlvo.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// "YYYY-MM-DD" de hoje no fuso de Brasília — mesmo motivo do
// mesCorrenteBrasilia acima; `new Date().toISOString()` usa UTC e pode
// já mostrar o dia/mês seguinte pra quem está no Brasil à noite.
export function hojeBrasilia(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  const dia = partes.find((p) => p.type === "day")?.value;
  return `${ano}-${mes}-${dia}`;
}
