import "server-only";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { prisma } from "@/lib/db";
import { ORGANIZATION_TABLES } from "@/lib/deletion-plan";
import { toCsv } from "@/lib/csv-export";

/**
 * Export complet d'un espace (décision D10) : à remettre au professionnel
 * avant l'effacement (portabilité, restitution en fin de sous-traitance).
 *
 * Un ZIP produit au fil de l'eau et envoyé tel quel : jamais écrit sur disque
 * ni en base, jamais conservé.
 * - donnees/<Table>.json : chaque table de l'espace, ligne à ligne ;
 * - comptes.json, espace.json, agendas.json : les comptes (sans empreinte de
 *   mot de passe ni jeton), l'espace, les agendas connectés (sans jeton) ;
 * - clients.csv, animaux.csv, rendez-vous.csv : lisibles dans un tableur ;
 * - documents/ : les comptes rendus du Studio, en PDF.
 */

type Rows = Array<Record<string, unknown>>;
type Reader = { findMany(args: { where: { organizationId: string } }): Promise<Rows> };

function readers(): Record<(typeof ORGANIZATION_TABLES)[number], Reader> {
  return {
    AppointmentCalendarEvent: prisma.appointmentCalendarEvent as unknown as Reader,
    TourStop: prisma.tourStop as unknown as Reader,
    TourRun: prisma.tourRun as unknown as Reader,
    Reminder: prisma.reminder as unknown as Reader,
    Consultation: prisma.consultation as unknown as Reader,
    AnimalDocument: prisma.animalDocument as unknown as Reader,
    StudioDocument: prisma.studioDocument as unknown as Reader,
    StudioDocumentTemplate: prisma.studioDocumentTemplate as unknown as Reader,
    Appointment: prisma.appointment as unknown as Reader,
    Animal: prisma.animal as unknown as Reader,
    AnimalPlace: prisma.animalPlace as unknown as Reader,
    Client: prisma.client as unknown as Reader,
    ClientImport: prisma.clientImport as unknown as Reader,
    BlockedSlot: prisma.blockedSlot as unknown as Reader,
    City: prisma.city as unknown as Reader,
    Tour: prisma.tour as unknown as Reader,
    Zone: prisma.zone as unknown as Reader,
    Service: prisma.service as unknown as Reader,
    SavedPlace: prisma.savedPlace as unknown as Reader,
    MapView: prisma.mapView as unknown as Reader,
    BusinessProfile: prisma.businessProfile as unknown as Reader,
  };
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2));
}

function safeFileName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
}

/** Nom de l'espace, pour nommer le fichier téléchargé. null s'il n'existe pas. */
export async function exportFileNameFor(organizationId: string): Promise<string | null> {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  if (!organization) return null;
  return `export-${safeFileName(organization.name)}-${new Date().toISOString().slice(0, 10)}.zip`;
}

export function organizationExportStream(organizationId: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const add = (path: string, data: Uint8Array, alreadyCompressed = false) => {
        const file = alreadyCompressed ? new ZipPassThrough(path) : new ZipDeflate(path, { level: 6 });
        zip.add(file);
        file.push(data, true);
      };

      try {
        const where = { organizationId };
        const tables = readers();
        const data: Partial<Record<keyof typeof tables, Rows>> = {};
        for (const table of ORGANIZATION_TABLES) {
          data[table] = await tables[table].findMany({ where });
          add(`donnees/${table}.json`, json(data[table]));
        }

        const [organization, users] = await Promise.all([
          prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, createdAt: true, onboardedAt: true, modules: true } }),
          prisma.user.findMany({ where, select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true, active: true, createdAt: true, lastLoginAt: true } }),
        ]);
        const calendars = await prisma.calendarConnection.findMany({
          where: { userId: { in: users.map((user) => user.id) } },
          select: { id: true, userId: true, provider: true, accountEmail: true, calendarId: true, calendarName: true, createdAt: true },
        });
        add("espace.json", json(organization));
        add("comptes.json", json(users));
        add("agendas.json", json(calendars));

        const clients = (data.Client ?? []) as Array<{ id: string; firstName: string; lastName: string; phone: string; email: string; address: string; postalCode: string | null; city: string }>;
        add("clients.csv", strToU8(toCsv(
          ["Prénom", "Nom", "Téléphone", "Email", "Adresse", "Code postal", "Ville"],
          clients.map((client) => [client.firstName, client.lastName, client.phone, client.email, client.address, client.postalCode, client.city]),
        )));
        const clientName = new Map(clients.map((client) => [client.id, `${client.firstName} ${client.lastName}`.trim()]));
        const animals = (data.Animal ?? []) as Array<{ name: string; species: string; breed: string; clientId: string }>;
        add("animaux.csv", strToU8(toCsv(
          ["Nom", "Espèce", "Race", "Propriétaire"],
          animals.map((animal) => [animal.name, animal.species, animal.breed, clientName.get(animal.clientId) ?? ""]),
        )));
        const appointments = (data.Appointment ?? []) as Array<{ date: Date; start: string; duration: number; clientName: string; animalName: string; serviceName: string; mode: string; status: string; location: string }>;
        add("rendez-vous.csv", strToU8(toCsv(
          ["Date", "Heure", "Durée (min)", "Client", "Animal", "Prestation", "Mode", "Statut", "Lieu"],
          appointments.map((item) => [item.date.toISOString().slice(0, 10), item.start, item.duration, item.clientName, item.animalName, item.serviceName, item.mode, item.status, item.location]),
        )));

        const documents = (data.StudioDocument ?? []) as Array<{ id: string; title: string; pdfBase64: string | null }>;
        for (const document of documents) {
          const base64 = document.pdfBase64?.replace(/^data:[^,]*,/, "");
          if (!base64) continue;
          add(`documents/${safeFileName(document.title)}-${document.id}.pdf`, new Uint8Array(Buffer.from(base64, "base64")), true);
        }

        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
