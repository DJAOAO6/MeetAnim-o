import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda/agenda-view";
import { getClientPickerOptions } from "@/lib/clients";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const clients = await getClientPickerOptions();
  return <AgendaView clients={clients} />;
}
