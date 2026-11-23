// Gráficos do relatório do cliente em SVG puro (renderizados no servidor,
// nítidos na impressão/PDF). Cores da marca SOMA.
export const AZUL = "#1E3A5F";
export const AZUL_CLARO = "#5B7FA6";
export const DOURADO = "#C9A227";
export const CINZA = "#E5E9F0";
export const VERDE = "#2E7D4F";
export const VERMELHO = "#B3261E";

const paleta = [AZUL, DOURADO, AZUL_CLARO, "#8A6D1B", "#2F5D8C", "#D9C27A", "#7A93B3", "#A08A4C", "#94A3B8"];

export function abreviar(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Barras de patrimônio líquido por ano + linha de renda total. */
export function GraficoEvolucao({
  serie,
}: {
  serie: { anoCalendario: number; patrimonio: number; rendaTotal: number }[];
}) {
  const L = 640, A = 230, ml = 16, mr = 16, mt = 28, mb = 34;
  const max = Math.max(1, ...serie.map((s) => Math.max(s.patrimonio, s.rendaTotal)));
  const n = serie.length;
  const slot = (L - ml - mr) / n;
  const bw = Math.min(70, slot * 0.5);
  const y = (v: number) => mt + (A - mt - mb) * (1 - Math.max(0, v) / max);
  const cx = (i: number) => ml + slot * i + slot / 2;
  const pontos = serie.map((s, i) => `${cx(i)},${y(s.rendaTotal)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Evolução do patrimônio e da renda">
      <line x1={ml} x2={L - mr} y1={A - mb} y2={A - mb} stroke={CINZA} />
      {serie.map((s, i) => (
        <g key={s.anoCalendario}>
          <rect x={cx(i) - bw / 2} y={y(s.patrimonio)} width={bw} height={A - mb - y(s.patrimonio)} rx={4} fill={i === n - 1 ? AZUL : AZUL_CLARO} />
          <text x={cx(i)} y={y(s.patrimonio) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={AZUL}>
            {abreviar(s.patrimonio)}
          </text>
          <text x={cx(i)} y={A - mb + 18} textAnchor="middle" fontSize={11} fill="#475569">
            {s.anoCalendario}
          </text>
        </g>
      ))}
      {n > 1 && <polyline points={pontos} fill="none" stroke={DOURADO} strokeWidth={2.5} />}
      {serie.map((s, i) => (
        <g key={`p${i}`}>
          <circle cx={cx(i)} cy={y(s.rendaTotal)} r={4} fill="#fff" stroke={DOURADO} strokeWidth={2.5} />
          <text x={cx(i) + bw / 2 + 6} y={y(s.rendaTotal) + 4} fontSize={10.5} fontWeight={600} fill="#8A6D1B">
            {abreviar(s.rendaTotal)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Rosca da composição do patrimônio com legenda. */
export function GraficoComposicao({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  const total = itens.reduce((s, i) => s + Math.max(0, i.valor), 0);
  const R = 70, r = 44, c = 90;
  const positivos = itens.filter((i) => i.valor > 0);
  const inicios = positivos.map((_, k) => positivos.slice(0, k).reduce((s, x) => s + x.valor, 0));
  const arcos = positivos
    .map((i, k) => {
      const frac = total ? i.valor / total : 0;
      const a0 = -Math.PI / 2 + (total ? inicios[k] / total : 0) * Math.PI * 2;
      const a1 = a0 + frac * Math.PI * 2;
      const grande = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad: number, raio: number) => `${c + raio * Math.cos(rad)} ${c + raio * Math.sin(rad)}`;
      const d =
        frac >= 0.9999
          ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} M ${p(0, r)} A ${r} ${r} 0 1 0 ${p(Math.PI, r)} A ${r} ${r} 0 1 0 ${p(0, r)} Z`
          : `M ${p(a0, R)} A ${R} ${R} 0 ${grande} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${grande} 0 ${p(a0, r)} Z`;
      return { d, cor: paleta[k % paleta.length], ...i, frac };
    });
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 180 180" className="h-40 w-40 shrink-0" role="img" aria-label="Composição do patrimônio">
        {arcos.map((a) => (
          <path key={a.rotulo} d={a.d} fill={a.cor} fillRule="evenodd" />
        ))}
        {total === 0 && <circle cx={c} cy={c} r={R} fill={CINZA} />}
      </svg>
      <ul className="flex-1 space-y-1.5 text-[12px]">
        {arcos.map((a) => (
          <li key={a.rotulo} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.cor }} />
            <span className="flex-1 text-slate-700">{a.rotulo}</span>
            <span className="tabular-nums text-slate-500">{(a.frac * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Ponte" do patrimônio no ano: início → renda disponível → gastos → fim. */
export function PontePatrimonial({
  inicio,
  renda,
  gastos,
  fim,
}: {
  inicio: number;
  renda: number;
  gastos: number;
  fim: number;
}) {
  const passos = [
    { rotulo: "Patrimônio em 31/12 do ano anterior", valor: inicio, base: 0, cor: AZUL_CLARO },
    { rotulo: "+ Renda do ano, já descontado o imposto", valor: renda, base: inicio, cor: VERDE },
    { rotulo: gastos >= 0 ? "− Gastos e consumo estimados" : "+ Acréscimo sem renda que o explique", valor: -gastos, base: inicio + renda, cor: gastos >= 0 ? "#94A3B8" : VERMELHO },
    { rotulo: "Patrimônio em 31/12", valor: fim, base: 0, cor: AZUL },
  ];
  const topo = Math.max(1, ...passos.map((p) => Math.max(p.base, p.base + p.valor)));
  const L = 640, linha = 34;
  const x = (v: number) => 230 + (L - 330) * (Math.max(0, v) / topo);
  return (
    <svg viewBox={`0 0 ${L} ${passos.length * linha + 6}`} className="w-full" role="img" aria-label="Conciliação do patrimônio no ano">
      {passos.map((p, i) => {
        const a = Math.min(p.base, p.base + p.valor), b = Math.max(p.base, p.base + p.valor);
        return (
          <g key={p.rotulo} transform={`translate(0 ${i * linha + 4})`}>
            <text x={0} y={18} fontSize={11.5} fill="#334155">
              {p.rotulo}
            </text>
            <rect x={x(a)} y={4} width={Math.max(2, x(b) - x(a))} height={20} rx={3} fill={p.cor} />
            <text x={x(b) + 6} y={18} fontSize={11.5} fontWeight={600} fill="#0f172a">
              {Math.abs(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barra horizontal simples (participação). */
export function Barra({ pct, cor = AZUL }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: CINZA }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: cor }} />
    </div>
  );
}
