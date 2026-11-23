import { ImportarDeclaracoes } from "./ImportarDeclaracoes";

export const metadata = { title: "IRPF — Importar declarações" };

export default function ImportarPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Importar declarações (.DEC)</h1>
        <p className="text-sm text-foreground/60">
          Cria os contribuintes e as declarações a partir dos arquivos gravados pelo programa do IRPF. Os arquivos ficam
          guardados na declaração.
        </p>
      </div>
      <ImportarDeclaracoes />
    </div>
  );
}
