import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AccountSettings } from "@/components/account/account-settings";
import { getAccountOverview } from "@/lib/auth/account-actions";

export const metadata: Metadata = { title: "Mon compte" };

/** « Mon compte » (audit 2026-10, FONC-03) : mot de passe, double authentification, appareils connectés. */
export default async function AccountPage() {
  const overview = await getAccountOverview();
  return (
    <>
      <PageHeader title="Mon compte" description={`Vos accès à 1002 Pattes (${overview.email}).`} />
      <AccountSettings overview={overview} />
    </>
  );
}
