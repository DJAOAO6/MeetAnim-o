export type Consultation = {
  id: string;
  date: string;
  service: string;
  mode: "Cabinet" | "Domicile";
  price: string;
  summary: string;
  status: "Terminé" | "Annulé";
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
  photo?: string;
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
  status: "Actif" | "Inactif";
  lastConsultation: string;
  createdAt: string;
  animals: Animal[];
};
