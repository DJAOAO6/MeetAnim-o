import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker/locale/fr";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, type VisitMode, type ReminderDelay, type ReminderStatus } from "../src/generated/prisma/client";
import { NORMANDY_CITIES as CITIES } from "../src/data/normandy-cities";

function bcryptHash(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
};

function parseFrenchDate(value: string): Date {
  const match = value.match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i);
  if (!match) return new Date(value);
  const [, day, monthName, year] = match;
  const month = FRENCH_MONTHS[monthName.toLowerCase()] ?? 0;
  return new Date(Number(year), month, Number(day));
}

const BREEDS: Record<string, string[]> = {
  Chien: ["Golden Retriever", "Labrador", "Border Collie", "Berger Australien", "Bouledogue français", "Cocker anglais", "Jack Russell", "Berger blanc suisse", "Beagle", "Cavalier King Charles"],
  Chat: ["Européen", "Maine Coon", "Siamois", "Sacré de Birmanie", "British Shorthair", "Bengal"],
  Cheval: ["Selle Français", "Trotteur Français", "Pur-sang", "Connemara", "Frison", "Poney Fjord"],
  NAC: ["Lapin nain", "Cochon d’Inde", "Furet", "Perroquet", "Chinchilla"],
};

const AVATARS: Record<string, string[]> = {
  Chien: ["🐕", "🐕‍🦺", "🐶"],
  Chat: ["🐈", "🐈‍⬛"],
  Cheval: ["🐎"],
  NAC: ["🐰", "🐹", "🦜", "🐹"],
};

const AVATAR_BACKGROUNDS = [
  "from-[#dcefeb] to-[#f4faf8]",
  "from-[#fff0d1] to-[#fffaf0]",
  "from-[#e7edf4] to-[#f7f9fc]",
  "from-[#eee8f8] to-[#faf8fd]",
  "from-[#e5f4f0] to-[#f5fbf9]",
];

const SERVICES_BY_SPECIES: Record<string, string> = {
  Chien: "Ostéopathie canine",
  Chat: "Ostéopathie féline",
  Cheval: "Ostéopathie équine",
  NAC: "Consultation NAC",
};

const SPECIES_WEIGHTS: Array<{ species: string; weight: number }> = [
  { species: "Chien", weight: 54 },
  { species: "Chat", weight: 22 },
  { species: "Cheval", weight: 18 },
  { species: "NAC", weight: 6 },
];

function pickSpecies(): string {
  const total = SPECIES_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of SPECIES_WEIGHTS) {
    if (roll < item.weight) return item.species;
    roll -= item.weight;
  }
  return "Chien";
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function weightFor(species: string): string {
  if (species === "Chien") return `${faker.number.int({ min: 5, max: 40 })} kg`;
  if (species === "Chat") return `${faker.number.float({ min: 3, max: 7, fractionDigits: 1 }).toString().replace(".", ",")} kg`;
  if (species === "Cheval") return `${faker.number.int({ min: 420, max: 620 })} kg`;
  return `${faker.number.float({ min: 0.5, max: 3, fractionDigits: 1 }).toString().replace(".", ",")} kg`;
}

function ageFor(): string {
  return `${faker.number.int({ min: 1, max: 14 })} ans`;
}

function sexFor(species: string): string {
  const female = faker.datatype.boolean();
  if (species === "Cheval") return female ? "Jument" : "Hongre";
  return female ? pick(["Femelle", "Femelle stérilisée"]) : pick(["Mâle", "Mâle castré"]);
}

const CURATED_CLIENTS = [
  {
    id: "marie-dupont", firstName: "Marie", lastName: "Dupont", phone: "06 12 34 56 78", email: "marie.dupont@example.fr",
    city: "Rouen", address: "18 rue des Carmes, 76000 Rouen",
    animals: [
      { name: "Luna", species: "Chien", breed: "Golden Retriever", age: "5 ans", weight: "28 kg", sex: "Femelle stérilisée", avatar: "🐕", avatarBackground: AVATAR_BACKGROUNDS[0], history: "Entorse légère de la patte arrière droite en 2024.", conditions: "Raideurs lombaires après les longues promenades.", treatments: "Complément articulaire quotidien, aucun traitement médicamenteux.", notes: "Très sociable. Préfère être manipulée au sol et se détend rapidement.", reminderLabel: "À relancer dans 6 mois", reminderDate: "28 février 2027" },
      { name: "Oscar", species: "Chat", breed: "Européen", age: "8 ans", weight: "5,2 kg", sex: "Mâle castré", avatar: "🐈", avatarBackground: AVATAR_BACKGROUNDS[1], history: "Chute sans fracture en 2023.", conditions: "Sensibilité de la zone cervicale.", treatments: "Aucun traitement en cours.", notes: "Manipulation progressive recommandée.", reminderLabel: "À relancer dans 12 mois", reminderDate: "15 mai 2027" },
    ],
  },
  {
    id: "thomas-martin", firstName: "Thomas", lastName: "Martin", phone: "06 28 41 73 09", email: "thomas.martin@example.fr",
    city: "Le Havre", address: "16 rue de Paris, 76600 Le Havre",
    animals: [
      { name: "Oslo", species: "Chien", breed: "Berger blanc suisse", age: "6 ans", weight: "34 kg", sex: "Mâle", avatar: "🐕‍🦺", avatarBackground: AVATAR_BACKGROUNDS[2], history: "Entorse légère de la patte avant gauche en 2023.", conditions: "Raideurs après les longues sorties.", treatments: "Étirements doux après l’activité.", notes: "Chien calme et coopératif pendant les manipulations.", reminderLabel: "À relancer dans 6 mois", reminderDate: "18 février 2027" },
    ],
  },
  {
    id: "julie-robert", firstName: "Julie", lastName: "Robert", phone: "07 56 22 18 40", email: "julie.robert@example.fr",
    city: "Mont-Saint-Aignan", address: "32 avenue du Mont aux Malades, 76130 Mont-Saint-Aignan",
    animals: [
      { name: "Spirit", species: "Cheval", breed: "Selle Français", age: "9 ans", weight: "540 kg", sex: "Hongre", avatar: "🐎", avatarBackground: AVATAR_BACKGROUNDS[2], history: "Tendinite légère en 2022, aujourd’hui résolue.", conditions: "Tensions régulières au niveau du garrot.", treatments: "Programme d’étirements après le travail.", notes: "Cheval calme, suivi sportif trimestriel.", reminderLabel: "À relancer dans 6 mois", reminderDate: "22 février 2027" },
      { name: "Nala", species: "Chien", breed: "Berger Australien", age: "4 ans", weight: "21 kg", sex: "Femelle", avatar: "🐕‍🦺", avatarBackground: AVATAR_BACKGROUNDS[3], history: "Aucun antécédent majeur.", conditions: "Tensions musculaires après les séances d’agility.", treatments: "Repos actif pendant 48 heures après consultation.", notes: "Très dynamique.", reminderLabel: "À relancer dans 6 mois", reminderDate: "18 février 2027" },
      { name: "Milo", species: "Chat", breed: "Maine Coon", age: "6 ans", weight: "7,8 kg", sex: "Mâle castré", avatar: "🐈‍⬛", avatarBackground: AVATAR_BACKGROUNDS[4], history: "Aucun antécédent notable.", conditions: "Raideur légère des hanches.", treatments: "Surveillance du poids.", notes: "Consultation à domicile recommandée.", reminderLabel: "À relancer dans 12 mois", reminderDate: "4 avril 2027" },
    ],
  },
  {
    id: "camille-leroy", firstName: "Camille", lastName: "Leroy", phone: "06 91 07 43 25", email: "camille.leroy@example.fr",
    city: "Harfleur", address: "7 rue de la République, 76700 Harfleur",
    animals: [
      { name: "Néo", species: "Chat", breed: "Européen", age: "5 ans", weight: "5,6 kg", sex: "Mâle castré", avatar: "🐈", avatarBackground: AVATAR_BACKGROUNDS[4], history: "Aucun antécédent majeur.", conditions: "Sensibilité lombaire légère.", treatments: "Aucun traitement en cours.", notes: "Consultation à domicile recommandée pour limiter le stress.", reminderLabel: "À relancer dans 6 mois", reminderDate: "10 février 2027" },
      { name: "Ruby", species: "Chien", breed: "Cocker anglais", age: "7 ans", weight: "14 kg", sex: "Femelle stérilisée", avatar: "🐶", avatarBackground: AVATAR_BACKGROUNDS[1], history: "Opération du ligament croisé en 2024.", conditions: "Faiblesse résiduelle du postérieur gauche.", treatments: "Exercices de proprioception trois fois par semaine.", notes: "Prévoir des pauses fréquentes pendant la séance.", reminderLabel: "À relancer dans 3 mois", reminderDate: "9 novembre 2026" },
    ],
  },
];

async function seedUsers() {
  const adminEmail = process.env.AUTH_EMAIL;
  const adminHashBase64 = process.env.AUTH_PASSWORD_HASH_BASE64;

  if (adminEmail && adminHashBase64) {
    const passwordHash = Buffer.from(adminHashBase64, "base64").toString("utf8");
    await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: {
        email: adminEmail.toLowerCase(),
        passwordHash,
        firstName: "Pauline",
        lastName: "Faucillon",
        role: "ADMIN",
      },
    });
  }

  const testAccounts: Array<{ email: string; firstName: string; lastName: string; role: "PRACTITIONER" | "SECRETARY"; password: string }> = [
    { email: "praticien-test@pf-osteo-animale.fr", firstName: "Camille", lastName: "Test", role: "PRACTITIONER", password: "Praticien-Test-2026!" },
    { email: "secretariat-test@pf-osteo-animale.fr", firstName: "Nadia", lastName: "Test", role: "SECRETARY", password: "Secretariat-Test-2026!" },
  ];

  for (const account of testAccounts) {
    const passwordHash = await bcryptHash(account.password);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: { email: account.email, firstName: account.firstName, lastName: account.lastName, role: account.role, passwordHash },
    });
  }

  console.log("Comptes de test — praticien : praticien-test@pf-osteo-animale.fr / Praticien-Test-2026!");
  console.log("Comptes de test — secrétariat : secretariat-test@pf-osteo-animale.fr / Secretariat-Test-2026!");
}

async function resetDatabase() {
  await prisma.$transaction([
    prisma.tour.deleteMany(),
    prisma.city.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.reminder.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.animalDocument.deleteMany(),
    prisma.consultation.deleteMany(),
    prisma.animal.deleteMany(),
    prisma.client.deleteMany(),
    prisma.service.deleteMany(),
  ]);
}

async function seedZonesAndCities() {
  const zoneNames = [...new Set(CITIES.map((city) => city.zone))];
  const zoneByName = new Map<string, string>();

  for (const name of zoneNames) {
    const zone = await prisma.zone.create({ data: { name } });
    zoneByName.set(name, zone.id);
  }

  for (const city of CITIES) {
    await prisma.city.create({
      data: { name: city.name, postalCode: city.postalCode, zoneId: zoneByName.get(city.zone)! },
    });
  }

  return zoneByName;
}

async function seedServices() {
  await prisma.service.createMany({
    data: [
      { name: "Ostéopathie canine", description: "Bilan et manipulations ostéopathiques pour chiens.", duration: 60, animals: ["Chien"], cabinetPrice: 60, homePrice: 70, travelFeesEnabled: true, travelFeeMode: "FIXED", fixedTravelFee: 10, suggestedReminder: "6 mois", active: true },
      { name: "Ostéopathie féline", description: "Bilan et manipulations ostéopathiques pour chats.", duration: 60, animals: ["Chat"], cabinetPrice: 55, homePrice: 65, travelFeesEnabled: true, travelFeeMode: "FIXED", fixedTravelFee: 10, suggestedReminder: "6 mois", active: true },
      { name: "Ostéopathie équine", description: "Suivi ostéopathique pour chevaux, en écurie.", duration: 90, animals: ["Cheval"], cabinetEnabled: false, cabinetPrice: 0, homePrice: 95, travelFeesEnabled: true, travelFeeMode: "KILOMETRIC", kilometricRate: 0.5, suggestedReminder: "6 mois", active: true },
      { name: "Massage canin", description: "Massage de détente et de récupération musculaire.", duration: 45, animals: ["Chien"], cabinetPrice: 50, homePrice: 60, suggestedReminder: "3 mois", active: true },
      { name: "Consultation NAC", description: "Bilan de mobilité pour nouveaux animaux de compagnie.", duration: 45, animals: ["NAC"], cabinetPrice: 50, homePrice: 60, suggestedReminder: "12 mois", active: true },
      { name: "Suivi locomoteur", description: "Contrôle de suivi après une blessure ou une opération.", duration: 45, animals: ["Chien", "Chat"], cabinetPrice: 55, homePrice: 70, suggestedReminder: "3 mois", active: true },
    ],
  });
}

function buildConsultations(animalId: string, species: string, count: number) {
  const service = SERVICES_BY_SPECIES[species] ?? "Ostéopathie canine";
  const summaries = [
    "Bilan de mobilité et détente des tensions principales.",
    "Suivi préventif, mobilité globale satisfaisante.",
    "Travail doux de la zone thoraco-lombaire.",
    "Contrôle post-effort et conseils d’exercices.",
    "Bilan locomoteur complet, amélioration notée en fin de séance.",
  ];
  const consultations = [];
  for (let i = 0; i < count; i += 1) {
    const date = faker.date.past({ years: 1.5 });
    const mode: VisitMode = faker.datatype.boolean() ? "DOMICILE" : "CABINET";
    consultations.push({
      animalId,
      date,
      service,
      mode,
      price: faker.number.int({ min: 45, max: 95 }),
      summary: pick(summaries),
      status: "TERMINE" as const,
    });
  }
  return consultations;
}

async function seedClient(input: { id: string; firstName: string; lastName: string; phone: string; email: string; city: string; address: string }, animalsInput: Array<{
  name: string; species: string; breed: string; age: string; weight: string; sex: string; avatar: string; avatarBackground: string;
  history: string; conditions: string; treatments: string; notes: string; reminderLabel: string; reminderDate: string;
}>) {
  const client = await prisma.client.create({
    data: {
      id: input.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      address: input.address,
      status: "ACTIF",
    },
  });

  for (const animalInput of animalsInput) {
    const animal = await prisma.animal.create({
      data: {
        clientId: client.id,
        name: animalInput.name,
        species: animalInput.species,
        breed: animalInput.breed,
        age: animalInput.age,
        weight: animalInput.weight,
        sex: animalInput.sex,
        avatar: animalInput.avatar,
        avatarBackground: animalInput.avatarBackground,
        history: animalInput.history,
        conditions: animalInput.conditions,
        treatments: animalInput.treatments,
        notes: animalInput.notes,
        reminderLabel: animalInput.reminderLabel,
        reminderDate: parseFrenchDate(animalInput.reminderDate),
      },
    });

    const consultations = buildConsultations(animal.id, animalInput.species, faker.number.int({ min: 1, max: 3 }));
    await prisma.consultation.createMany({ data: consultations });

    const delayOptions: ReminderDelay[] = ["THREE_MONTHS", "SIX_MONTHS", "TWELVE_MONTHS"];
    const statusOptions: ReminderStatus[] = ["DUE", "SENT", "BOOKED", "IGNORED", "UPCOMING"];
    await prisma.reminder.create({
      data: {
        clientId: client.id,
        animalId: animal.id,
        lastConsultation: faker.date.recent({ days: 200 }),
        delay: pick(delayOptions),
        dueDate: parseFrenchDate(animalInput.reminderDate),
        status: pick(statusOptions),
      },
    });
  }

  return client;
}

async function seedCuratedClients() {
  for (const client of CURATED_CLIENTS) {
    await seedClient(client, client.animals);
  }
}

async function seedFakeClients(count: number) {
  for (let i = 0; i < count; i += 1) {
    const city = pick(CITIES);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const id = `${slugify(firstName)}-${slugify(lastName)}-${faker.string.alphanumeric(4).toLowerCase()}`;

    const animalCount = faker.number.int({ min: 1, max: 3 });
    const animals = Array.from({ length: animalCount }).map(() => {
      const species = pickSpecies();
      const reminderMonths = pick([3, 6, 12]);
      const reminderDate = faker.date.soon({ days: reminderMonths * 30 });
      return {
        name: faker.person.firstName().split(" ")[0],
        species,
        breed: pick(BREEDS[species]),
        age: ageFor(),
        weight: weightFor(species),
        sex: sexFor(species),
        avatar: pick(AVATARS[species]),
        avatarBackground: pick(AVATAR_BACKGROUNDS),
        history: faker.helpers.arrayElement([
          "Aucun antécédent notable.",
          "Suivi ponctuel après une chute sans gravité.",
          "Entorse légère résolue l’an dernier.",
          "Opération mineure, aucune séquelle connue.",
        ]),
        conditions: faker.helpers.arrayElement([
          "Raideurs occasionnelles après l’effort.",
          "Sensibilité légère de la zone lombaire.",
          "Tensions au niveau du bassin.",
          "Aucune gêne particulière signalée.",
        ]),
        treatments: faker.helpers.arrayElement([
          "Aucun traitement en cours.",
          "Complément articulaire quotidien.",
          "Étirements doux recommandés après l’activité.",
          "Surveillance du poids.",
        ]),
        notes: faker.lorem.sentence(),
        reminderLabel: `À relancer dans ${reminderMonths} mois`,
        reminderDate: reminderDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      };
    });

    await seedClient(
      {
        id,
        firstName,
        lastName,
        phone: faker.phone.number({ style: "national" }),
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        city: city.name,
        address: `${faker.location.streetAddress()}, ${city.postalCode} ${city.name}`,
      },
      animals,
    );
  }
}

/**
 * Le nombre de rendez-vous et les heures de consultation ne sont plus des
 * champs à peupler ici (AUDIT_COMPLET.md P2-25) : calculés à la lecture
 * depuis les vrais Appointment domicile de la zone de la tournée
 * (seedAgendaAppointments ci-dessous crée ces rendez-vous réels, avec de
 * vraies coordonnées géographiques). estimatedKm reste une estimation
 * saisie à la main, faute de coordonnées géocodées pour le cabinet lui-même.
 */
async function seedToursAndAppointments(zoneByName: Map<string, string>) {
  const tourDefinitions = [
    { name: "Tournée Le Havre", zone: "Zone Le Havre", day: "Lundi", startTime: "09:00", endTime: "18:00", estimatedKm: 42 },
    { name: "Tournée Rouen Nord", zone: "Zone Rouen Nord", day: "Mardi", startTime: "09:00", endTime: "17:00", estimatedKm: 28 },
    { name: "Tournée Dieppe", zone: "Zone Dieppe", day: "Vendredi", startTime: "10:00", endTime: "16:00", estimatedKm: 64 },
  ];

  for (const definition of tourDefinitions) {
    await prisma.tour.create({
      data: {
        name: definition.name,
        recurrence: "Toutes les semaines",
        day: definition.day,
        dateLabel: `${definition.day} prochain`,
        startTime: definition.startTime,
        endTime: definition.endTime,
        zoneId: zoneByName.get(definition.zone)!,
        status: "ACTIVE",
        estimatedKm: definition.estimatedKm,
      },
    });
  }
}

async function seedAgendaAppointments() {
  const clients = await prisma.client.findMany({ include: { animals: true } });
  const upcoming = faker.helpers.arrayElements(clients.filter((client) => client.animals.length > 0), Math.min(14, clients.length));

  for (const client of upcoming) {
    const animal = pick(client.animals);
    const date = faker.date.soon({ days: 10 });
    const mode: VisitMode = faker.datatype.boolean() ? "DOMICILE" : "CABINET";
    // postalCode/city réels (pas seulement `location`, du texte libre) :
    // nécessaires pour que les tournées retrouvent ce rendez-vous comme un
    // arrêt réel de leur zone (findMatchingZone, cf. src/lib/tours.ts).
    const cityMatch = mode === "DOMICILE" ? CITIES.find((city) => city.name === client.city) : undefined;
    await prisma.appointment.create({
      data: {
        clientId: client.id,
        animalId: animal.id,
        clientName: `${client.firstName} ${client.lastName}`,
        animalName: animal.name,
        serviceName: SERVICES_BY_SPECIES[animal.species] ?? "Ostéopathie canine",
        date,
        start: pick(["08:00", "09:00", "09:30", "11:00", "14:00", "14:30", "16:00", "17:00"]),
        duration: pick([45, 60, 90]),
        mode,
        location: mode === "CABINET" ? "Cabinet" : client.city,
        postalCode: cityMatch?.postalCode,
        city: cityMatch?.name,
        latitude: cityMatch?.lat,
        longitude: cityMatch?.lng,
        price: faker.number.int({ min: 50, max: 95 }),
        status: pick(["PENDING", "CONFIRMED", "CONFIRMED", "CONFIRMED"] as const),
        notes: faker.lorem.sentence(),
      },
    });
  }
}

async function main() {
  console.log("Comptes utilisateurs…");
  await seedUsers();

  console.log("Réinitialisation de la base…");
  await resetDatabase();

  console.log("Zones et villes…");
  const zoneByName = await seedZonesAndCities();

  console.log("Prestations…");
  await seedServices();

  console.log("Clients de démonstration…");
  await seedCuratedClients();

  console.log("Faux clients de test…");
  await seedFakeClients(20);

  console.log("Tournées…");
  await seedToursAndAppointments(zoneByName);

  console.log("Agenda…");
  await seedAgendaAppointments();

  const [clientCount, animalCount] = await Promise.all([prisma.client.count(), prisma.animal.count()]);
  console.log(`Terminé : ${clientCount} clients, ${animalCount} animaux.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
