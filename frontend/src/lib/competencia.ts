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

const MAX_COMPETENCIAS_INTERVALO = 60; // trava de segurança (5 anos) contra intervalo absurdo

// Todas as competências "YYYY-MM" entre `inicio` e `fim` (inclusive nos
// dois extremos), mais antiga primeiro — usado pra limitar a grade de
// controle de extrato ao período real de uma conta (não sempre os últimos
// N meses fixos). Se o intervalo passar de 5 anos, mantém só os mais
// recentes (proteção contra data de início muito distante por engano).
export function competenciasNoIntervalo(inicio: string, fim: string): string[] {
  const [anoIni, mesIni] = inicio.split("-").map(Number);
  const [anoFim, mesFim] = fim.split("-").map(Number);
  const out: string[] = [];
  let ano = anoIni;
  let mes = mesIni;
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    out.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out.length > MAX_COMPETENCIAS_INTERVALO ? out.slice(-MAX_COMPETENCIAS_INTERVALO) : out;
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
