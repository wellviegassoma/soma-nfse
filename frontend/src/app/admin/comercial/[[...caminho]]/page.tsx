import { redirect } from "next/navigation";

// O Comercial saiu do /admin em 18/11/2026 e virou /comercial. Links e
// favoritos antigos continuam funcionando.
export default async function ComercialAntigoRedirect(props: PageProps<"/admin/comercial/[[...caminho]]">) {
  const { caminho } = await props.params;
  redirect(`/comercial${caminho?.length ? `/${caminho.join("/")}` : ""}`);
}
