import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PlacesManager } from "@/components/clients/places-manager";
import { getPlaces } from "@/lib/places";

export const metadata: Metadata = { title: "Lieux des animaux" };

/**
 * Lieux des animaux (phase 8.9) : haras, élevages, pensions… où vivent des
 * animaux de plusieurs propriétaires. Un lieu se saisit une fois ; ses
 * animaux s'y rattachent depuis leur fiche (« Où vit-il ? »).
 */
export default async function PlacesPage() {
  const places = await getPlaces();
  return (
    <>
      <PageHeader title="Lieux des animaux" description="Haras, élevages, pensions : les lieux où vivent des animaux, quels que soient leurs propriétaires." />
      <PlacesManager places={places} />
    </>
  );
}
