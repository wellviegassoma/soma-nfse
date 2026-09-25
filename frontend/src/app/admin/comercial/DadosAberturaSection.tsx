"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export const TEXTO_DOCUMENTOS_ABERTURA = `Preciso dos seguintes documentos:

Dos sócios
- Identidade e CPF (ou CRO/CRM/CREFITO, se tiver)
- Comprovante de residência
- Certidão de casamento ou nascimento
- E-mail

Do imóvel
- Inscrição do IPTU do imóvel onde é o endereço da empresa
- Certificado do Corpo de Bombeiros (se for sala, loja etc.)

Nome da empresa
- 3 opções de nome (vamos verificar a disponibilidade)
  Exemplo: Exemplo Medicina LTDA`;

type Defaults = {
  cartorioJucerja?: string | null;
  capitalSocial?: number | null;
  divisaoCapital?: string | null;
  administrador?: string | null;
  cotaTipo?: string | null;
  cnaes?: string | null;
  opcoesNome?: string | null;
};

// Só aparece quando Tipo do caso = Abertura de CNPJ novo — a empresa ainda
// não existe, então esses dados (pro contrato social) e a lista de
// documentos não têm outro lugar melhor pra viver enquanto o prospect não
// vira cliente ativo de verdade.
export function DadosAberturaSection({ defaults = {} }: { defaults?: Defaults }) {
  const [copiado, setCopiado] = useState(false);

  async function copiarTexto() {
    try {
      await navigator.clipboard.writeText(TEXTO_DOCUMENTOS_ABERTURA);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — sem drama, o
      // texto continua ali pra selecionar e copiar manualmente.
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-muted/40 p-4">
      <h3 className="text-sm font-semibold text-foreground/70">Dados para o contrato social</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cartório ou JUCERJA" htmlFor="aberturaCartorioJucerja" hint="Opcional">
          <Input id="aberturaCartorioJucerja" name="aberturaCartorioJucerja" defaultValue={defaults.cartorioJucerja ?? ""} />
        </Field>
        <Field label="Capital social" htmlFor="aberturaCapitalSocial" hint="Opcional">
          <Input
            id="aberturaCapitalSocial"
            name="aberturaCapitalSocial"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={defaults.capitalSocial ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Divisão do capital" htmlFor="aberturaDivisaoCapital" hint="Opcional — ex.: 50% / 50%">
          <Input id="aberturaDivisaoCapital" name="aberturaDivisaoCapital" defaultValue={defaults.divisaoCapital ?? ""} />
        </Field>
        <Field label="Cota" htmlFor="aberturaCotaTipo" hint="Opcional">
          <Select id="aberturaCotaTipo" name="aberturaCotaTipo" defaultValue={defaults.cotaTipo ?? ""}>
            <option value="">Não definido</option>
            <option value="PROPORCIONAL">Proporcional</option>
            <option value="DESPROPORCIONAL">Desproporcional</option>
          </Select>
        </Field>
      </div>

      <Field label="Administrador" htmlFor="aberturaAdministrador" hint="Opcional — quem vai administrar a empresa">
        <Input id="aberturaAdministrador" name="aberturaAdministrador" defaultValue={defaults.administrador ?? ""} />
      </Field>

      <Field label="CNAEs" htmlFor="aberturaCnaes" hint="Opcional — quais atividades a empresa vai exercer">
        <Input id="aberturaCnaes" name="aberturaCnaes" defaultValue={defaults.cnaes ?? ""} />
      </Field>

      <Field label="Opções de nome da empresa" htmlFor="aberturaOpcoesNome" hint="Opcional — pelo menos 3 opções, pra verificar disponibilidade">
        <textarea
          id="aberturaOpcoesNome"
          name="aberturaOpcoesNome"
          rows={3}
          defaultValue={defaults.opcoesNome ?? ""}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </Field>

      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-foreground/70">Documentos necessários (pra pedir ao cliente)</h4>
          <Button type="button" variant="ghost" size="md" className="h-7 px-2 text-xs" onClick={copiarTexto}>
            {copiado ? "Copiado!" : "Copiar"}
          </Button>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-xs text-foreground/70">{TEXTO_DOCUMENTOS_ABERTURA}</pre>
      </div>
    </div>
  );
}
