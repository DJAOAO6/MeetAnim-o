import "server-only";

import { strToU8, zipSync, type Zippable } from "fflate";
import type { ScopedPrismaClient } from "@/lib/db";
import { toCsv } from "@/lib/csv-export";

/**
 * Les données d'un client, à lui remettre sur sa demande (droit d'accès et
 * portabilité, RGPD art. 15 et 20 ; audit 2026-10, RGPD-07). Jusqu'ici,
 * seul l'export d'un espace entier existait, réservé à la plateforme.
 *
 * Un ZIP produit à la demande, jamais conservé :
 * - client.json : la fiche, ses animaux (avec leurs consultations et leur
 *   lieu), ses rendez-vous, ses relances, ses comptes rendus (sans le PDF) ;
 * - animaux.csv, rendez-vous.csv : lisibles dans un tableur ;
 * - comptes-rendus/ : les comptes rendus finalisés, en PDF.
 *
 * Lu par le client cloisonné de l'appelant : un identifiant d'un autre
 * cabinet ne mène à rien.
 */
export async function buildClientExport(db: ScopedPrismaClient, clientId: string): Promise<{ fileName: string; zip: Uint8Array } | null> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, firstName: true, lastName: true, phone: true, email: true, address: true, postalCode: true, city: true,
      status: true, archivedAt: true, createdAt: true, updatedAt: true,
      animals: {
        select: {
          id: true, name: true, species: true, breed: true, age: true, birthDate: true, weight: true, sex: true,
          history: true, conditions: true, treatments: true, notes: true, createdAt: true,
          place: { select: { name: true, kind: true, address: true, postalCode: true, city: true, notes: true } },
          consultations: { select: { date: true, service: true, mode: true, price: true, summary: true, status: true }, orderBy: { date: "asc" } },
        },
        orderBy: { name: "asc" },
      },
      appointments: {
        select: { date: true, start: true, duration: true, animalName: true, serviceName: true, mode: true, location: true, price: true, status: true, notes: true, createdAt: true },
        orderBy: { date: "asc" },
      },
      reminders: { select: { lastConsultation: true, delay: true, dueDate: true, status: true, note: true, animal: { select: { name: true } } } },
      studioDocuments: { select: { id: true, title: true, status: true, finalizedAt: true, createdAt: true, pdfBase64: true } },
    },
  });
  if (!client) return null;

  const { studioDocuments, ...rest } = client;
  const files: Zippable = {
    "client.json": strToU8(JSON.stringify({
      ...rest,
      comptesRendus: studioDocuments.map(({ pdfBase64, ...document }) => ({ ...document, pdf: pdfBase64 ? `comptes-rendus/${pdfName(document)}` : null })),
    }, null, 2)),
    "animaux.csv": strToU8(toCsv(
      ["Nom", "Espèce", "Race", "Âge", "Date de naissance", "Poids", "Sexe", "Antécédents", "Pathologies", "Traitements", "Notes"],
      client.animals.map((animal) => [animal.name, animal.species, animal.breed, animal.age, animal.birthDate?.toISOString().slice(0, 10) ?? "", animal.weight, animal.sex, animal.history, animal.conditions, animal.treatments, animal.notes]),
    )),
    "rendez-vous.csv": strToU8(toCsv(
      ["Date", "Heure", "Durée (min)", "Animal", "Prestation", "Lieu", "Adresse", "Tarif", "Statut", "Notes"],
      client.appointments.map((appointment) => [appointment.date.toISOString().slice(0, 10), appointment.start, appointment.duration, appointment.animalName, appointment.serviceName, appointment.mode === "DOMICILE" ? "À domicile" : "Au cabinet", appointment.location, appointment.price, appointment.status, appointment.notes]),
    )),
  };
  for (const document of studioDocuments) {
    const base64 = document.pdfBase64?.replace(/^data:[^,]*,/, "");
    if (base64) files[`comptes-rendus/${pdfName(document)}`] = new Uint8Array(Buffer.from(base64, "base64"));
  }

  return { fileName: `donnees-${safeFileName(`${client.firstName}-${client.lastName}`)}.zip`, zip: zipSync(files, { level: 6 }) };
}

function pdfName(document: { id: string; title: string }): string {
  return `${safeFileName(document.title)}-${document.id}.pdf`;
}

function safeFileName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "client";
}
