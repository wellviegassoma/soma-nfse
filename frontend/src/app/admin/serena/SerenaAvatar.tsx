// Rosto da Serena (analista de IA do Simples). Foto gerada por IA (pessoa
// fictícia), em public/serena.webp — com um selo de brilho que deixa claro
// que é a IA.

export function SerenaAvatar({ tamanho = 40, selo = true, className = "" }: { tamanho?: number; selo?: boolean; className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: tamanho, height: tamanho }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/serena.webp" alt="Serena" width={tamanho} height={tamanho} className="h-full w-full rounded-full object-cover" draggable={false} />
      {selo && (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-white text-violet-600 shadow ring-1 ring-violet-200"
          style={{ width: Math.max(12, tamanho * 0.38), height: Math.max(12, tamanho * 0.38) }}
          title="Assistente de IA"
        >
          <svg viewBox="0 0 24 24" style={{ width: "68%", height: "68%" }} fill="currentColor" aria-hidden>
            <path d="M12 2.5l1.9 4.6 4.6 1.9-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.9L12 2.5z" />
            <path d="M18.5 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
          </svg>
        </span>
      )}
    </span>
  );
}
