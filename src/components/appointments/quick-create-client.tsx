"use client";

import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Field, inputClassName } from "@/components/settings/settings-fields";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClientAction } from "@/lib/clients-actions";
import type { ClientPickerOption } from "@/data/clients";
import type { GeocodedAddress } from "@/data/geocoding";

/**
 * Création d'un client sans quitter le rendez-vous.
 *
 * Elle appelle createClientAction — la même action que la fiche client
 * complète — et rend le client créé à l'appelant, qui le sélectionne
 * aussitôt. Aucune donnée du rendez-vous en cours n'est touchée : le
 * brouillon vit au-dessus de cette fenêtre.
 *
 * Seuls le prénom et le nom sont obligatoires, comme côté serveur. « Je
 * compléterai plus tard » est ici la règle, pas l'exception : au téléphone,
 * on n'a souvent qu'un nom et un numéro.
 */
export function QuickCreateClient({ initialQuery, onCreated, onClose }: {
  initialQuery: string;
  onCreated: (client: ClientPickerOption) => void;
  onClose: () => void;
}) {
  const guessed = splitName(initialQuery);
  const [firstName, setFirstName] = useState(guessed.firstName);
  const [lastName, setLastName] = useState(guessed.lastName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function applyAddress(result: GeocodedAddress) {
    setAddress(result.label);
    setPostalCode(result.postcode);
    setCity(result.city);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    const result = await createClientAction({ firstName, lastName, phone, email, address, postalCode, city });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }

    // Reconstruit la forme attendue par le sélecteur plutôt que de
    // recharger toute la liste : le client vient d'être créé, il n'a donc
    // aucun animal, et ses coordonnées sont celles qu'on vient de saisir.
    onCreated({
      id: result.client.id,
      firstName: result.client.firstName,
      lastName: result.client.lastName,
      address: result.client.address,
      city: result.client.city,
      phone: result.client.phone,
      email: result.client.email,
      animals: [],
    });
  }

  return (
    <Modal
      title="Création rapide d’un nouveau client"
      description="Le prénom et le nom suffisent — la fiche pourra être complétée plus tard."
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="quick-create-client" disabled={pending}>
            {pending ? "Création…" : "Créer le client et continuer"}
          </Button>
        </div>
      }
    >
      <form id="quick-create-client" onSubmit={submit} className="space-y-4">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom *">
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={inputClassName} required autoFocus autoComplete="off" />
          </Field>
          <Field label="Nom *">
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={inputClassName} required autoComplete="off" />
          </Field>
          <Field label="Téléphone">
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClassName} placeholder="06 12 34 56 78" autoComplete="off" />
          </Field>
          <Field label="E-mail">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClassName} placeholder="prenom.nom@email.fr" autoComplete="off" />
          </Field>
        </div>

        <Field label="Adresse">
          <AddressAutocomplete value={address} onQueryChange={setAddress} onSelect={applyAddress} inputClassName={inputClassName} placeholder="Rechercher une adresse…" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code postal">
            <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className={inputClassName} inputMode="numeric" placeholder="76000" />
          </Field>
          <Field label="Ville">
            <input value={city} onChange={(event) => setCity(event.target.value)} className={inputClassName} placeholder="Rouen" />
          </Field>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-animeo-bg px-4 py-3 text-xs text-animeo-muted">
          <UserPlus aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Le client sera enregistré dans votre fichier et sélectionné pour ce rendez-vous. Vous pourrez compléter sa fiche
          depuis Clients &amp; animaux.
        </p>
      </form>
    </Modal>
  );
}

/**
 * « Camille Dupont » tapé dans la recherche pré-remplit les deux champs : le
 * premier mot au prénom, le reste au nom. Une seule chaîne va au nom, qui est
 * ce qu'on retient d'un client.
 */
function splitName(query: string): { firstName: string; lastName: string } {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
