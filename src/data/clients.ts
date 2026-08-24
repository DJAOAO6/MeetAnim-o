export type Consultation = {
  id: string;
  date: string;
  service: string;
  mode: "Cabinet" | "Domicile";
  price: string;
  summary: string;
  status: "Terminé";
};

export type AnimalDocument = {
  id: string;
  name: string;
  type: "PDF" | "Image";
  linkedTo: string;
};

export type Animal = {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  weight: string;
  sex: string;
  avatar: string;
  avatarBackground: string;
  history: string;
  conditions: string;
  treatments: string;
  notes: string;
  reminder: {
    label: string;
    date: string;
  };
  consultations: Consultation[];
  documents: AnimalDocument[];
};

export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  status: "Actif";
  lastConsultation: string;
  animals: Animal[];
};

export const clients: Client[] = [
  {
    id: "marie-dupont",
    firstName: "Marie",
    lastName: "Dupont",
    initials: "MD",
    phone: "06 12 34 56 78",
    email: "marie.dupont@example.fr",
    city: "Rouen",
    address: "18 rue des Carmes, 76000 Rouen",
    status: "Actif",
    lastConsultation: "31 août 2026",
    animals: [
      {
        id: "luna",
        name: "Luna",
        species: "Chien",
        breed: "Golden Retriever",
        age: "5 ans",
        weight: "28 kg",
        sex: "Femelle stérilisée",
        avatar: "🐕",
        avatarBackground: "from-[#dcefeb] to-[#f4faf8]",
        history: "Entorse légère de la patte arrière droite en 2024.",
        conditions: "Raideurs lombaires après les longues promenades.",
        treatments: "Complément articulaire quotidien, aucun traitement médicamenteux.",
        notes: "Très sociable. Préfère être manipulée au sol et se détend rapidement.",
        reminder: {
          label: "À relancer dans 6 mois",
          date: "28 février 2027",
        },
        consultations: [
          {
            id: "luna-1",
            date: "31 août 2026",
            service: "Ostéopathie",
            mode: "Domicile",
            price: "70 €",
            summary: "Raideur du bassin après une randonnée. Mobilité améliorée en fin de séance.",
            status: "Terminé",
          },
          {
            id: "luna-2",
            date: "12 juillet 2026",
            service: "Ostéopathie",
            mode: "Cabinet",
            price: "60 €",
            summary: "Suivi préventif et travail doux de la zone thoraco-lombaire.",
            status: "Terminé",
          },
          {
            id: "luna-3",
            date: "8 juin 2026",
            service: "Massage canin",
            mode: "Domicile",
            price: "55 €",
            summary: "Détente musculaire après une période d’activité soutenue.",
            status: "Terminé",
          },
        ],
        documents: [
          { id: "luna-doc-1", name: "Compte-rendu.pdf", type: "PDF", linkedTo: "Consultation du 31 août" },
          { id: "luna-doc-2", name: "Facture-2026-041.pdf", type: "PDF", linkedTo: "Consultation du 31 août" },
          { id: "luna-doc-3", name: "Radio.jpg", type: "Image", linkedTo: "Fiche de Luna" },
        ],
      },
      {
        id: "oscar",
        name: "Oscar",
        species: "Chat",
        breed: "Européen",
        age: "8 ans",
        weight: "5,2 kg",
        sex: "Mâle castré",
        avatar: "🐈",
        avatarBackground: "from-[#fff0d1] to-[#fffaf0]",
        history: "Chute sans fracture en 2023.",
        conditions: "Sensibilité de la zone cervicale.",
        treatments: "Aucun traitement en cours.",
        notes: "Manipulation progressive recommandée. Se sent plus en sécurité dans son panier.",
        reminder: {
          label: "À relancer dans 12 mois",
          date: "15 mai 2027",
        },
        consultations: [
          {
            id: "oscar-1",
            date: "15 mai 2026",
            service: "Ostéopathie féline",
            mode: "Domicile",
            price: "65 €",
            summary: "Bilan de mobilité et détente de la zone cervicale.",
            status: "Terminé",
          },
          {
            id: "oscar-2",
            date: "10 novembre 2025",
            service: "Ostéopathie féline",
            mode: "Domicile",
            price: "65 €",
            summary: "Suivi annuel, mobilité globale satisfaisante.",
            status: "Terminé",
          },
        ],
        documents: [
          { id: "oscar-doc-1", name: "Compte-rendu-Oscar.pdf", type: "PDF", linkedTo: "Consultation du 15 mai" },
        ],
      },
    ],
  },
  {
    id: "thomas-martin",
    firstName: "Thomas",
    lastName: "Martin",
    initials: "TM",
    phone: "06 28 41 73 09",
    email: "thomas.martin@example.fr",
    city: "Le Havre",
    address: "16 rue de Paris, 76600 Le Havre",
    status: "Actif",
    lastConsultation: "18 août 2026",
    animals: [
      {
        id: "oslo",
        name: "Oslo",
        species: "Chien",
        breed: "Berger blanc suisse",
        age: "6 ans",
        weight: "34 kg",
        sex: "Mâle",
        avatar: "🐕‍🦺",
        avatarBackground: "from-[#e7edf4] to-[#f7f9fc]",
        history: "Entorse légère de la patte avant gauche en 2023.",
        conditions: "Raideurs après les longues sorties.",
        treatments: "Étirements doux après l’activité.",
        notes: "Chien calme et coopératif pendant les manipulations.",
        reminder: { label: "À relancer dans 6 mois", date: "18 février 2027" },
        consultations: [
          { id: "oslo-1", date: "18 août 2026", service: "Ostéopathie canine", mode: "Domicile", price: "70 €", summary: "Bilan locomoteur et travail des tensions du bassin.", status: "Terminé" },
        ],
        documents: [
          { id: "oslo-doc-1", name: "Compte-rendu-Oslo.pdf", type: "PDF", linkedTo: "Consultation du 18 août" },
        ],
      },
    ],
  },
  {
    id: "julie-robert",
    firstName: "Julie",
    lastName: "Robert",
    initials: "JR",
    phone: "07 56 22 18 40",
    email: "julie.robert@example.fr",
    city: "Mont-Saint-Aignan",
    address: "32 avenue du Mont aux Malades, 76130 Mont-Saint-Aignan",
    status: "Actif",
    lastConsultation: "22 août 2026",
    animals: [
      {
        id: "spirit",
        name: "Spirit",
        species: "Cheval",
        breed: "Selle Français",
        age: "9 ans",
        weight: "540 kg",
        sex: "Hongre",
        avatar: "🐎",
        avatarBackground: "from-[#e7edf4] to-[#f7f9fc]",
        history: "Tendinite légère en 2022, aujourd’hui résolue.",
        conditions: "Tensions régulières au niveau du garrot.",
        treatments: "Programme d’étirements après le travail.",
        notes: "Cheval calme, suivi sportif trimestriel.",
        reminder: { label: "À relancer dans 6 mois", date: "22 février 2027" },
        consultations: [
          { id: "spirit-1", date: "22 août 2026", service: "Ostéopathie équine", mode: "Domicile", price: "95 €", summary: "Suivi sportif et libération des tensions du garrot.", status: "Terminé" },
        ],
        documents: [
          { id: "spirit-doc-1", name: "Compte-rendu-Spirit.pdf", type: "PDF", linkedTo: "Consultation du 22 août" },
        ],
      },
      {
        id: "nala",
        name: "Nala",
        species: "Chien",
        breed: "Berger Australien",
        age: "4 ans",
        weight: "21 kg",
        sex: "Femelle",
        avatar: "🐕‍🦺",
        avatarBackground: "from-[#eee8f8] to-[#faf8fd]",
        history: "Aucun antécédent majeur.",
        conditions: "Tensions musculaires après les séances d’agility.",
        treatments: "Repos actif pendant 48 heures après consultation.",
        notes: "Très dynamique, aime garder sa propriétaire dans son champ de vision.",
        reminder: { label: "À relancer dans 6 mois", date: "18 février 2027" },
        consultations: [
          { id: "nala-1", date: "18 août 2026", service: "Massage canin", mode: "Cabinet", price: "50 €", summary: "Récupération après compétition d’agility.", status: "Terminé" },
        ],
        documents: [
          { id: "nala-doc-1", name: "Bilan-Nala.pdf", type: "PDF", linkedTo: "Consultation du 18 août" },
        ],
      },
      {
        id: "milo",
        name: "Milo",
        species: "Chat",
        breed: "Maine Coon",
        age: "6 ans",
        weight: "7,8 kg",
        sex: "Mâle castré",
        avatar: "🐈‍⬛",
        avatarBackground: "from-[#e5f4f0] to-[#f5fbf9]",
        history: "Aucun antécédent notable.",
        conditions: "Raideur légère des hanches.",
        treatments: "Surveillance du poids.",
        notes: "Consultation à domicile recommandée.",
        reminder: { label: "À relancer dans 12 mois", date: "4 avril 2027" },
        consultations: [
          { id: "milo-1", date: "4 avril 2026", service: "Ostéopathie féline", mode: "Domicile", price: "65 €", summary: "Bilan annuel de mobilité.", status: "Terminé" },
        ],
        documents: [],
      },
    ],
  },
  {
    id: "camille-leroy",
    firstName: "Camille",
    lastName: "Leroy",
    initials: "CL",
    phone: "06 91 07 43 25",
    email: "camille.leroy@example.fr",
    city: "Harfleur",
    address: "7 rue de la République, 76700 Harfleur",
    status: "Actif",
    lastConsultation: "9 août 2026",
    animals: [
      {
        id: "neo",
        name: "Néo",
        species: "Chat",
        breed: "Européen",
        age: "5 ans",
        weight: "5,6 kg",
        sex: "Mâle castré",
        avatar: "🐈",
        avatarBackground: "from-[#e5f4f0] to-[#f5fbf9]",
        history: "Aucun antécédent majeur.",
        conditions: "Sensibilité lombaire légère.",
        treatments: "Aucun traitement en cours.",
        notes: "Consultation à domicile recommandée pour limiter le stress.",
        reminder: { label: "À relancer dans 6 mois", date: "10 février 2027" },
        consultations: [
          { id: "neo-1", date: "10 août 2026", service: "Ostéopathie féline", mode: "Domicile", price: "65 €", summary: "Bilan de mobilité et détente de la zone lombaire.", status: "Terminé" },
        ],
        documents: [
          { id: "neo-doc-1", name: "Compte-rendu-Neo.pdf", type: "PDF", linkedTo: "Consultation du 10 août" },
        ],
      },
      {
        id: "ruby",
        name: "Ruby",
        species: "Chien",
        breed: "Cocker anglais",
        age: "7 ans",
        weight: "14 kg",
        sex: "Femelle stérilisée",
        avatar: "🐶",
        avatarBackground: "from-[#fff0d1] to-[#fffaf0]",
        history: "Opération du ligament croisé en 2024.",
        conditions: "Faiblesse résiduelle du postérieur gauche.",
        treatments: "Exercices de proprioception trois fois par semaine.",
        notes: "Prévoir des pauses fréquentes pendant la séance.",
        reminder: { label: "À relancer dans 3 mois", date: "9 novembre 2026" },
        consultations: [
          { id: "ruby-1", date: "9 août 2026", service: "Suivi locomoteur", mode: "Domicile", price: "70 €", summary: "Contrôle du postérieur gauche et conseils d’exercices.", status: "Terminé" },
        ],
        documents: [
          { id: "ruby-doc-1", name: "Radio-genou.jpg", type: "Image", linkedTo: "Fiche de Ruby" },
        ],
      },
    ],
  },
];

export function getClientById(id: string) {
  return clients.find((client) => client.id === id);
}
