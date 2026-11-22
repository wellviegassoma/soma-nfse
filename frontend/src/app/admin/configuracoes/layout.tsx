import { ConfiguracoesNav } from "./ConfiguracoesNav";

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <ConfiguracoesNav />
      {children}
    </div>
  );
}
