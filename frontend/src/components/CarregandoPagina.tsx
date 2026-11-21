// Esqueleto mostrado na hora do clique enquanto a página do painel carrega
// (usado pelos loading.tsx do /admin). Sem isso, a tela antiga ficava
// parada até a nova estar pronta e parecia que o clique não tinha pegado.
export function CarregandoPagina() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-col gap-2">
        <div className="h-6 w-64 animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-foreground/10" />
        ))}
      </div>
    </div>
  );
}
