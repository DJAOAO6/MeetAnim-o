"use client";

import { useState, type FormEvent } from "react";
import { PawPrint } from "lucide-react";
import { Field, inputClassName } from "@/components/settings/settings-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createAnimalAction } from "@/lib/clients-actions";
import { animalSpeciesList } from "@/data/species";
import type { ClientPickerAnimal } from "@/data/clients";

const sexOptions = ["Mâle", "Femelle"] as const;

/**
 * Création d'un animal sans quitter le rendez-vous, rattaché au client
 * sélectionné, via createAnimalAction — l'action de la fiche client.
 *
 * Seul le nom est obligatoire côté serveur ; l'espèce l'est ici aussi car
 * elle détermine l'avatar et la couleur de l'animal dans l'agenda. Tout le
 * reste peut attendre : au téléphone, on ne demande pas la date de naissance
 * exacte du chien avant de poser un rendez-vous.
 */
export function QuickCreateAnimal({ clientId, clientName, onCreated, onClose }: {
  clientId: string;
  clientName: string;
  onCreated: (animal: ClientPickerAnimal) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<string>(animalSpeciesList[0]);
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<string>("");
  const [birthDate, setBirthDate] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    const age = birthDate ? ageLabelFrom(birthDate) : "";
    const result = await createAnimalAction(clientId, {
      name,
      species,
      breed,
      age,
      weight,
      sex,
      history: "",
      conditions: "",
      treatments: "",
      notes: "",
    });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }

    onCreated({ id: result.animal.id, name: result.animal.name, species: result.animal.species, breed: result.animal.breed, age: result.animal.age });
  }

  return (
    <Modal
      title="Ajout rapide d’un animal"
      description={`L’animal sera rattaché à la fiche de ${clientName}.`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="quick-create-animal" disabled={pending}>
            {pending ? "Ajout…" : "Ajouter l’animal et continuer"}
          </Button>
        </div>
      }
    >
      <form id="quick-create-animal" onSubmit={submit} className="space-y-4">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom *">
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClassName} required autoFocus autoComplete="off" />
          </Field>
          <Field label="Espèce *">
            <select value={species} onChange={(event) => setSpecies(event.target.value)} className={inputClassName}>
              {animalSpeciesList.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="Race">
            <input value={breed} onChange={(event) => setBreed(event.target.value)} className={inputClassName} placeholder="Berger australien" autoComplete="off" />
          </Field>
          <Field label="Poids">
            <input value={weight} onChange={(event) => setWeight(event.target.value)} className={inputClassName} placeholder="24 kg" autoComplete="off" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Sexe</span>
            <div className="inline-flex gap-1 rounded-xl bg-animeo-bg p-1" role="group" aria-label="Sexe de l’animal">
              {sexOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={sex === option}
                  onClick={() => setSex((current) => (current === option ? "" : option))}
                  className={`min-h-9 rounded-lg px-4 text-sm font-extrabold transition ${sex === option ? "bg-animeo-surface text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <Field label="Date de naissance">
            <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={inputClassName} />
          </Field>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-animeo-bg px-4 py-3 text-xs text-animeo-muted">
          <PawPrint aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Antécédents, traitements et photo se complètent depuis la fiche de l’animal — rien ne bloque la prise de
          rendez-vous.
        </p>
      </form>
    </Modal>
  );
}

/**
 * « 3 ans », « 8 mois » : le champ âge est un texte libre en base (voir
 * UpdateAnimalInput), et c'est un âge qu'on lit sur une fiche, pas une date
 * de naissance. Calculé une fois à la création ; il vieillira comme le
 * faisait déjà la saisie manuelle.
 */
function ageLabelFrom(birthDate: string): string {
  const born = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(born.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return "";
  if (months < 12) return `${months} mois`;
  const years = Math.floor(months / 12);
  return `${years} an${years > 1 ? "s" : ""}`;
}
