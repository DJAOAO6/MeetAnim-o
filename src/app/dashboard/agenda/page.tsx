import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda/agenda-view";
import { getClientPickerOptions } from "@/lib/clients";
import { getAvailability } from "@/lib/business-profile-actions";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const [clients, availability] = await Promise.all([getClientPickerOptions(), getAvailability()]);
  return <AgendaView clients={clients} availability={availability} />;
}
