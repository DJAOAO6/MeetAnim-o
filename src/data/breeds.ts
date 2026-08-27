import type { PublicAnimalType } from "@/data/public-booking";

export const UNKNOWN_BREED_LABEL = "Croisé / Non déterminé";

const dogBreeds = [
  "Labrador Retriever", "Golden Retriever", "Berger Allemand", "Berger Australien", "Berger Belge Malinois",
  "Berger Belge Tervueren", "Berger Belge Groenendael", "Berger Blanc Suisse", "Border Collie", "Bouledogue Français",
  "Bouledogue Anglais", "Bulldog Américain", "Jack Russell Terrier", "Parson Russell Terrier", "Chihuahua",
  "Yorkshire Terrier", "Cavalier King Charles Spaniel", "King Charles Spaniel", "Cocker Spaniel Anglais",
  "Cocker Spaniel Américain", "Springer Spaniel Anglais", "Épagneul Breton", "Épagneul Français", "Setter Anglais",
  "Setter Irlandais", "Setter Gordon", "Pointer Anglais", "Braque Allemand à poil court", "Braque Allemand à poil dur",
  "Braque de Weimar", "Braque Hongrois à poil court (Vizsla)", "Braque Saint-Germain", "Épagneul Nain Continental (Papillon)",
  "Caniche Toy", "Caniche Nain", "Caniche Moyen", "Caniche Royal", "Bichon Frisé", "Bichon Maltais", "Bichon Havanais",
  "Coton de Tuléar", "Shih Tzu", "Lhassa Apso", "Pékinois", "Carlin", "Boston Terrier", "Bull Terrier",
  "Staffordshire Bull Terrier", "American Staffordshire Terrier", "Rottweiler", "Doberman", "Boxer", "Dogue Allemand",
  "Dogue de Bordeaux", "Cane Corso", "Mastiff", "Bullmastiff", "Terre-Neuve", "Saint-Bernard", "Léonberg",
  "Montagne des Pyrénées", "Bouvier Bernois", "Bouvier des Flandres", "Braque Italien", "Beagle", "Basset Hound",
  "Basset Bleu de Gascogne", "Basset Fauve de Bretagne", "Basset Artésien Normand", "Teckel à poil court", "Teckel à poil long",
  "Teckel à poil dur", "Husky Sibérien", "Malamute d'Alaska", "Samoyède", "Akita Inu", "Akita Américain", "Shiba Inu",
  "Chow Chow", "Spitz Nain (Poméranien)", "Spitz Allemand", "Spitz Japonais", "Terre-Neuve", "Whippet", "Lévrier Afghan",
  "Greyhound", "Lévrier Espagnol (Galgo)", "Barzoï", "Podenco Ibicenco", "Basenji", "Fox Terrier à poil dur",
  "Fox Terrier à poil lisse", "West Highland White Terrier", "Cairn Terrier", "Scottish Terrier", "Skye Terrier",
  "Airedale Terrier", "Bedlington Terrier", "Bull Terrier Miniature", "Norfolk Terrier", "Norwich Terrier",
  "Australian Cattle Dog", "Australian Shepherd", "Kelpie Australien", "Colley à poil long", "Colley à poil court",
  "Shetland Sheepdog", "Welsh Corgi Pembroke", "Welsh Corgi Cardigan", "Berger Picard", "Berger des Pyrénées",
  "Berger de Beauce (Beauceron)", "Briard", "Chien de Canaan", "Chien d'eau Portugais", "Chien d'eau Espagnol",
  "Épagneul de Pont-Audemer", "Épagneul Picard", "Griffon Korthals", "Griffon Bruxellois", "Griffon Belge",
  "Griffon Vendéen (Grand)", "Griffon Vendéen (Petit Basset)", "Griffon Fauve de Bretagne", "Beagle-Harrier",
  "Grand Bleu de Gascogne", "Chien Courant Bernois", "Chien Courant Suisse", "Foxhound Anglais", "Harrier",
  "Bull Terrier de Boston", "Chihuahua à poil long", "Chihuahua à poil court", "Pinscher Nain", "Pinscher Allemand",
  "Épagneul Tibétain", "Terrier Tibétain", "Dogue Argentin", "Dogue de Majorque", "Fila Brasileiro", "Presa Canario",
  "Kangal", "Berger d'Anatolie", "Berger de Maremme et des Abruzzes", "Berger Polonais de Podhale",
  "Berger de Russie du Sud", "Berger Estrela", "Chien de Montagne des Pyrénées", "Chien Loup Tchécoslovaque",
  "Chien Loup de Saarloos", "Xoloitzcuintle", "Terrier Brésilien", "Rat Terrier", "Toy Fox Terrier", "Pit Bull",
  "Chien Nu du Pérou", "Lévrier Polonais (Chart Polski)", "Deerhound Écossais", "Saluki", "Sloughi",
  "Berger de Bergame", "Berger des Abruzzes", "Épagneul Bleu de Picardie", "Braque Français type Pyrénées",
  "Braque Français type Gascogne", "Ariégeois", "Porcelaine", "Poitevin", "Billy", "Français Blanc et Noir",
  "Français Blanc et Orange", "Français Tricolore", "Petit Bleu de Gascogne", "Berger Catalan", "Podenco Canario",
  "Podenco Andaluz", "Cimarrón Uruguayo", "Berger d'Asie Centrale", "Terrier Irlandais", "Terrier Kerry Bleu",
  "Terrier Gallois", "Sealyham Terrier", "Lakeland Terrier", "Manchester Terrier", "Silky Terrier",
];

const catBreeds = [
  "Européen", "Chartreux", "Persan", "Maine Coon", "Sacré de Birmanie", "British Shorthair", "British Longhair",
  "Siamois", "Oriental", "Bengal", "Sphynx", "Abyssin", "Somali", "Ragdoll", "Norvégien", "Sibérien", "Turc Angora",
  "Turc Van", "Devon Rex", "Cornish Rex", "Selkirk Rex", "American Shorthair", "American Curl", "Scottish Fold",
  "Scottish Straight", "Highland Fold", "Highland Straight", "Exotic Shorthair", "Burmese", "Bombay", "Tonkinois",
  "Korat", "Singapura", "Ocicat", "Egyptian Mau", "Manx", "Cymric", "Balinais", "Javanais", "Colourpoint Shorthair",
  "Nebelung", "Russian Blue (Bleu Russe)", "LaPerm", "Munchkin", "Savannah", "Toyger", "Khao Manee",
  "Angora Turc", "Chausie", "Kurilian Bobtail", "Pixie-bob", "Serengeti", "American Wirehair", "Peterbald",
];

const horseBreeds = [
  "Selle Français", "Anglo-Arabe", "Pur-sang Anglais", "Pur-sang Arabe", "Trotteur Français", "Cheval de Selle",
  "Poney Shetland", "Poney Welsh", "Poney Connemara", "Poney Fjord (Fjord Norvégien)", "Poney New Forest",
  "Poney Français de Selle", "Camargue", "Comtois", "Trait Breton", "Percheron", "Trait du Nord",
  "Ardennais", "Auxois", "Cob Normand", "Franches-Montagnes", "Frison", "Quarter Horse", "Appaloosa",
  "Paint Horse", "Lusitanien", "Pure Race Espagnole (PRE)", "Lipizzan", "Hanovrien", "Holsteiner",
  "Trakehner", "Oldenbourg", "KWPN (Cheval de Sport Néerlandais)", "Mérens", "Landais", "Pottok",
  "Islandais", "Haflinger", "Falabella", "Mustang", "Konik Polski", "Boulonnais", "Camargue Poney",
];

const nacTypes = [
  "Lapin", "Cochon d'Inde (Cobaye)", "Furet", "Hamster Doré (Syrien)", "Hamster Nain", "Rat", "Souris",
  "Gerbille", "Chinchilla", "Octodon (Dègue du Chili)", "Écureuil de Corée", "Perroquet Gris du Gabon",
  "Perroquet Amazone", "Perruche Ondulée", "Perruche Calopsitte", "Cacatoès", "Ara", "Canari", "Pigeon",
  "Poule (basse-cour)", "Serpent (Boa/Python)", "Serpent (Couleuvre)", "Tortue terrestre", "Tortue aquatique",
  "Iguane vert", "Gecko léopard", "Dragon barbu (Pogona)", "Caméléon", "Varan", "Furet albinos",
];

const smallRuminantBreeds = [
  "Chèvre Naine (Naine des Tourelles)", "Chèvre Alpine", "Chèvre Saanen", "Chèvre des Fossés",
  "Chèvre du Poitou", "Chèvre Rove", "Chèvre Angora", "Chèvre Boer", "Chèvre Pyrénéenne", "Chèvre Provençale",
  "Mouton d'Ouessant", "Mouton Shetland", "Brebis Solognote", "Brebis Roussin", "Brebis Lacaune",
  "Brebis Île-de-France", "Brebis Charmoise", "Brebis Bleu du Maine", "Brebis Suffolk", "Brebis Texel",
  "Mouton Mérinos", "Brebis Manech", "Brebis Basco-Béarnaise", "Brebis Avranchin", "Brebis Berrichon",
];

export const breedsBySpecies: Record<PublicAnimalType, string[]> = {
  Chien: [...dogBreeds, UNKNOWN_BREED_LABEL],
  Chat: [...catBreeds, UNKNOWN_BREED_LABEL],
  Cheval: horseBreeds,
  NAC: nacTypes,
  "Petit ruminant": smallRuminantBreeds,
};

export const breedFieldLabel: Record<PublicAnimalType, string> = {
  Chien: "Race",
  Chat: "Race",
  Cheval: "Race",
  NAC: "Espèce / type",
  "Petit ruminant": "Race",
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function searchBreeds(species: PublicAnimalType, query: string, limit = 8): string[] {
  const list = breedsBySpecies[species] ?? [];
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return list.slice(0, limit);
  return list.filter((breed) => normalize(breed).includes(normalizedQuery)).slice(0, limit);
}

export function isKnownBreed(species: PublicAnimalType, value: string): boolean {
  const normalizedValue = normalize(value);
  return (breedsBySpecies[species] ?? []).some((breed) => normalize(breed) === normalizedValue);
}
