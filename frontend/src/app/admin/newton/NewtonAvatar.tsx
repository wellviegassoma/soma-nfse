// Rosto do Newton (analista de IA do Lucro Presumido). Enquanto a imagem não
// chega, um monograma; com public/newton.webp, troca pela foto (mesmo selo da
// Serena, que deixa claro que é a IA).

const TEM_FOTO = true;

export function NewtonAvatar({ tamanho = 40, selo = true, className = "" }: { tamanho?: number; selo?: boolean; className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: tamanho, height: tamanho }}>
      {TEM_FOTO ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/newton.webp" alt="Newton" width={tamanho} height={tamanho} className="h-full w-full rounded-full object-cover" draggable={false} />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-indigo-700 font-semibold text-white"
          style={{ fontSize: Math.max(9, tamanho * 0.42) }}
          aria-label="Newton"
        >
          N
        </span>
      )}
      {selo && (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-white text-sky-700 shadow ring-1 ring-sky-200"
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
