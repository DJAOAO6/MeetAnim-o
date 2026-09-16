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
  postalCode: string;
  address: string;
  status: "Actif" | "Inactif";
  lastConsultation: string;
  createdAt: string;
  animals: Animal[];
};

export type ClientPickerAnimal = {
  id: string;
  name: string;
  species: string;
  /** « Golden Retriever », « 3 ans » : ce qui permet de reconnaître l'animal
      quand un client en a plusieurs de la même espèce. */
  breed: string;
  age: string;
};

export type ClientPickerOption = {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  // Téléphone et email : la recherche de client à la prise de rendez-vous se
  // fait très souvent par téléphone — c'est le numéro qui s'affiche sur
  // l'écran pendant l'appel, pas le nom. Ils servent aussi à distinguer deux
  // homonymes avant de choisir.
  phone: string;
  email: string;
  animals: ClientPickerAnimal[];
};
