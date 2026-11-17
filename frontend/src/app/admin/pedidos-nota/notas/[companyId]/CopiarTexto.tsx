"use client";

import { useState } from "react";

export function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          setCopiado(false);
        }
      }}
      className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-foreground/70 hover:bg-surface-muted"
    >
      {copiado ? "Copiado!" : "Copiar"}
    </button>
  );
}
