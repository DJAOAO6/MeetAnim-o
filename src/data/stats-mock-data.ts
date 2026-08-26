export type StatsPeriod = "current" | "previous" | "3months" | "6months" | "year" | "previousYear" | "custom";
export type StatsSpecies = "all" | "dog" | "cat" | "horse" | "nac" | "ruminant";
export type StatsService = "all" | "canine" | "equine" | "massage" | "nac";
export type BreedSpecies = Exclude<StatsSpecies, "all">;

export const periodOptions: Array<{ value: StatsPeriod; label: string; factor: number }> = [
  { value: "current", label: "Ce mois-ci", factor: 1 },
  { value: "previous", label: "Mois dernier", factor: 0.92 },
  { value: "3months", label: "3 derniers mois", factor: 2.76 },
  { value: "6months", label: "6 derniers mois", factor: 5.4 },
  { value: "year", label: "Cette année", factor: 8.15 },
  { value: "previousYear", label: "Année dernière", factor: 7.55 },
  { value: "custom", label: "Période personnalisée", factor: 1 },
];

export const serviceOptions: Array<{ value: StatsService; label: string; factor: number }> = [
  { value: "all", label: "Toutes les prestations", factor: 1 },
  { value: "canine", label: "Ostéopathie canine", factor: 0.46 },
  { value: "equine", label: "Ostéopathie équine", factor: 0.29 },
  { value: "massage", label: "Massage canin", factor: 0.18 },
  { value: "nac", label: "Consultation NAC", factor: 0.08 },
];

export const speciesOptions: Array<{ value: StatsSpecies; label: string; factor: number }> = [
  { value: "all", label: "Toutes les espèces", factor: 1 },
  { value: "dog", label: "Chien", factor: 0.5 },
  { value: "cat", label: "Chat", factor: 0.21 },
  { value: "horse", label: "Cheval", factor: 0.17 },
  { value: "nac", label: "NAC", factor: 0.06 },
  { value: "ruminant", label: "Petit ruminant", factor: 0.06 },
];

export const statsMockData = {
  overview: {
    revenue: 2520,
    revenueVariation: 8,
    consultations: 42,
    averageBasket: 60,
    newClients: 12,
    kilometers: 386,
  },
  revenueSeries: [
    { label: "Jan.", value: 1850 },
    { label: "Fév.", value: 2100 },
    { label: "Mars", value: 1950 },
    { label: "Avr.", value: 2340 },
    { label: "Mai", value: 2480 },
    { label: "Juin", value: 2320 },
    { label: "Juil.", value: 2650 },
    { label: "Août", value: 2520 },
  ],
  consultationModes: [
    { label: "Domicile", consultations: 26, share: 62, revenue: 1820, averageBasket: 70, color: "var(--theme-primary)" },
    { label: "Cabinet", consultations: 16, share: 38, revenue: 700, averageBasket: 44, color: "var(--theme-heading)" },
  ],
  services: [
    { label: "Ostéopathie canine", consultations: 18, revenue: 1150 },
    { label: "Ostéopathie équine", consultations: 9, revenue: 720 },
    { label: "Massage canin", consultations: 11, revenue: 450 },
    { label: "Consultation NAC", consultations: 4, revenue: 200 },
  ],
  species: [
    { label: "Chien", value: 50, color: "#4FAF9F" },
    { label: "Chat", value: 21, color: "#5B8DEF" },
    { label: "Cheval", value: 17, color: "#F4B860" },
    { label: "NAC", value: 6, color: "#8067B0" },
    { label: "Petit ruminant", value: 6, color: "#C97B4A" },
  ],
  sex: [
    { label: "Mâles", value: 48 },
    { label: "Femelles", value: 49 },
    { label: "Non renseigné", value: 3 },
  ],
  sterilization: [
    { label: "Stérilisé / Castré", value: 58 },
    { label: "Non stérilisé / Non castré", value: 34 },
    { label: "Non renseigné", value: 8 },
  ],
  ages: [
    { label: "0 à 2 ans", value: 14 },
    { label: "3 à 5 ans", value: 31 },
    { label: "6 à 9 ans", value: 38 },
    { label: "10 ans et plus", value: 15 },
    { label: "Non renseigné", value: 2 },
  ],
  breeds: {
    dog: {
      total: 54,
      distinct: 21,
      unit: "chiens",
      items: [
        { label: "Golden Retriever", value: 18 },
        { label: "Berger Australien", value: 14 },
        { label: "Labrador", value: 11 },
        { label: "Border Collie", value: 9 },
        { label: "Bouledogue français", value: 7 },
      ],
    },
    cat: {
      total: 22,
      distinct: 11,
      unit: "chats",
      items: [
        { label: "Européen", value: 8 },
        { label: "Maine Coon", value: 5 },
        { label: "Sacré de Birmanie", value: 4 },
        { label: "Siamois", value: 3 },
        { label: "British Shorthair", value: 2 },
      ],
    },
    horse: {
      total: 18,
      distinct: 9,
      unit: "chevaux",
      items: [
        { label: "Selle Français", value: 6 },
        { label: "Trotteur Français", value: 4 },
        { label: "Pur-sang", value: 3 },
        { label: "Connemara", value: 3 },
        { label: "Frison", value: 2 },
      ],
    },
    nac: {
      total: 6,
      distinct: 4,
      unit: "NAC",
      items: [
        { label: "Lapin nain", value: 2 },
        { label: "Cochon d’Inde", value: 2 },
        { label: "Furet", value: 1 },
        { label: "Perroquet", value: 1 },
      ],
    },
    ruminant: {
      total: 6,
      distinct: 3,
      unit: "petits ruminants",
      items: [
        { label: "Chèvre naine", value: 3 },
        { label: "Mouton d’Ouessant", value: 2 },
        { label: "Brebis", value: 1 },
      ],
    },
  },
  painAreas: [
    { label: "Dos / lombaires", value: 34 },
    { label: "Cervicales", value: 22 },
    { label: "Bassin / sacrum", value: 18 },
    { label: "Membres postérieurs", value: 15 },
    { label: "Membres antérieurs", value: 8 },
    { label: "Autre", value: 3 },
  ],
  pathologies: [
    { label: "Boiterie", value: 16 },
    { label: "Raideur articulaire", value: 13 },
    { label: "Trouble locomoteur post-effort", value: 10 },
    { label: "Suivi sportif / performance", value: 8 },
    { label: "Trouble du comportement", value: 6 },
    { label: "Trouble digestif", value: 4 },
  ],
  satisfaction: {
    averageRating: 4.8,
    reviewsCount: 36,
    recommendationRate: 96,
  },
  cancellations: {
    totalBooked: 46,
    honored: 42,
    cancelled: 3,
    noShow: 1,
    cancellationRate: 9,
    noShowRate: 2,
  },
  loyalty: {
    newClients: 12,
    returningClients: 30,
    returnRate: 63,
    averageDelayMonths: 5.8,
  },
  reminders: {
    sent: 20,
    bookedAgain: 8,
    returnRate: 40,
    generatedRevenue: 560,
  },
  zones: [
    { label: "Rouen", consultations: 18, revenue: 1050, clients: 14 },
    { label: "Le Havre", consultations: 12, revenue: 840, clients: 9 },
    { label: "Mont-Saint-Aignan", consultations: 7, revenue: 430, clients: 6 },
    { label: "Dieppe", consultations: 5, revenue: 320, clients: 4 },
  ],
  travel: {
    kilometers: 386,
    homeConsultations: 26,
    averageKilometers: 14.8,
    travelFees: 210,
    homeRevenue: 1820,
    averageHomeRevenue: 70,
    revenuePerKilometer: 4.72,
  },
  tours: [
    { label: "Le Havre", appointments: 8, kilometers: 126, revenue: 640, averageRevenue: 80 },
    { label: "Rouen Nord", appointments: 6, kilometers: 72, revenue: 450, averageRevenue: 75 },
    { label: "Dieppe", appointments: 4, kilometers: 98, revenue: 280, averageRevenue: 70 },
  ],
} as const;
