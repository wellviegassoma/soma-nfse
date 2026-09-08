import { formatarBRL, formatarDataBr } from "@/lib/financeiro";
import type { PontoFluxoDiario } from "@/lib/financeiro-relatorios";

// Sem lib de gráfico no projeto — SVG à mão, no mesmo espírito dos parsers de
// OFX/CSV escritos na mão: é um path de linha, não vale puxar uma dependência
// (e o bundle) por isso. Sem interatividade em JS: os pontos têm <title>
// nativo, que já dá tooltip on-hover sem "use client".

const LARGURA = 700;
const ALTURA = 220;
const MARGEM = { topo: 16, baixo: 28, esquerda: 8, direita: 8 };

function escalaX(i: number, n: number): number {
  if (n <= 1) return MARGEM.esquerda;
  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  return MARGEM.esquerda + (i / (n - 1)) * larguraUtil;
}

export function FluxoCaixaChart({ pontos }: { pontos: PontoFluxoDiario[] }) {
  if (pontos.length === 0) return null;

  const valores = pontos.map((p) => p.saldoFinal);
  const min = Math.min(0, ...valores);
  const max = Math.max(0, ...valores);
  // Faixa mínima artificial pra uma linha reta (saldo parado) não colar no
  // topo ou no fundo do gráfico.
  const amplitude = Math.max(max - min, Math.abs(max || 1) * 0.1, 1);
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;

  function escalaY(v: number): number {
    return MARGEM.topo + alturaUtil - ((v - min) / amplitude) * alturaUtil;
  }

  const yZero = escalaY(0);
  const coords = pontos.map((p, i) => [escalaX(i, pontos.length), escalaY(p.saldoFinal)] as const);

  const linha = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${linha} L${coords[coords.length - 1][0].toFixed(1)},${yZero.toFixed(1)} L${coords[0][0].toFixed(1)},${yZero.toFixed(1)} Z`;

  const negativo = min < 0;
  const primeiroNegativo = pontos.find((p) => p.saldoFinal < 0);

  // Marcadores de data: início, meio e fim — o suficiente pra situar o
  // gráfico sem virar régua de 30 números.
  const indicesRotulo = [0, Math.floor((pontos.length - 1) / 2), pontos.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full"
        role="img"
        aria-label={`Fluxo de caixa projetado dos próximos ${pontos.length} dias`}
      >
        <defs>
          <linearGradient id="fluxoGradiente" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Linha do zero — só aparece quando o saldo cruza pra negativo, senão é ruído */}
        {negativo && (
          <line
            x1={MARGEM.esquerda}
            x2={LARGURA - MARGEM.direita}
            y1={yZero}
            y2={yZero}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeDasharray="4 4"
            className="text-foreground"
          />
        )}

        <path d={area} className="text-brand" fill="url(#fluxoGradiente)" />
        <path
          d={linha}
          fill="none"
          className={negativo ? "text-danger" : "text-brand"}
          stroke="currentColor"
          strokeWidth="2"
        />

        {/* Ponto de hoje, sempre visível */}
        <circle cx={coords[0][0]} cy={coords[0][1]} r="3.5" className="text-brand" fill="currentColor" />
        {pontos.map((p, i) => {
          // Uma string pronta, não vários fragmentos de JSX interpolados: dentro
          // de <title> (tratado como texto puro pelo parser HTML, igual
          // <textarea>/<option>), múltiplos filhos de texto colapsam espaço em
          // branco de um jeito no HTML que o servidor manda e de outro no DOM
          // real do navegador — deu erro de hidratação até isso ser corrigido.
          const dica =
            `${formatarDataBr(p.data)}: saldo ${formatarBRL(p.saldoFinal)}` +
            (p.entradas > 0 ? ` · entrou ${formatarBRL(p.entradas)}` : "") +
            (p.saidas > 0 ? ` · saiu ${formatarBRL(p.saidas)}` : "");
          return (
            <circle
              key={p.data}
              cx={coords[i][0]}
              cy={coords[i][1]}
              r="8"
              fill="transparent"
              className="cursor-default"
            >
              <title>{dica}</title>
            </circle>
          );
        })}

        {indicesRotulo.map((i) => (
          <text
            key={i}
            x={coords[i][0]}
            y={ALTURA - 8}
            textAnchor={i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle"}
            className="fill-foreground/45 text-[11px]"
          >
            {formatarDataBr(pontos[i].data)}
          </text>
        ))}
      </svg>

      {primeiroNegativo && (
        <p className="mt-2 text-xs font-medium text-danger">
          O saldo projetado fica negativo em {formatarDataBr(primeiroNegativo.data)}:{" "}
          {formatarBRL(primeiroNegativo.saldoFinal)}.
        </p>
      )}
    </div>
  );
}
