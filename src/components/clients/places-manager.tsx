"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Field, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { deletePlaceAction, savePlaceAction } from "@/lib/places-actions";
import { notify } from "@/lib/notify";
import { animalPlaceKindLabels, animalPlaceKinds, type AnimalPlaceKind, type AnimalPlaceSummary, type SavePlaceInput } from "@/data/places";
import { pluralizeAnimals } from "@/lib/format";

const precisionLabels = { EXACT: "position précise", STREET: "position à la rue", CITY: "position approximative (commune)" } as const;

/** Liste des lieux : adresse, animaux et propriétaires, modifier, supprimer. */
export function PlacesManager({ places }: { places: AnimalPlaceSummary[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SavePlaceInput | null>(null);
  const [deleting, setDeleting] = useState<AnimalPlaceSummary | null>(null);

  async function remove(place: AnimalPlaceSummary) {
    setDeleting(null);
    const result = await deletePlaceAction(place.id);
    if (!result.ok) { notify.error(result.error); return; }
    notify.success(`« ${place.name} » supprimé.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing({ name: "", kind: "HARAS", address: "", postalCode: "", city: "", notes: "" })}>
          <Plus aria-hidden="true" className="h-4 w-4" />Nouveau lieu
        </Button>
      </div>

      {places.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <MapPin aria-hidden="true" className="mx-auto h-8 w-8 text-animeo-muted" />
          <p className="mt-3 text-sm font-extrabold text-animeo-dark">Aucun lieu pour l’instant</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-animeo-muted">
            Quand un animal ne vit pas chez son propriétaire — un cheval en pension au haras, par exemple —, indiquez-le dans sa fiche (« Où vit-il ? ») ou créez le lieu ici.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {places.map((place) => {
            const owners = new Set(place.animals.map((animal) => animal.clientId)).size;
            return (
              <Card key={place.id} className="p-5" data-testid="place-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-animeo">{animalPlaceKindLabels[place.kind]}</p>
                    <h2 className="mt-0.5 truncate text-lg font-black text-animeo-dark">{place.name}</h2>
                    <p className="mt-1 text-sm text-animeo-muted">{[place.address, [place.postalCode, place.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
                    <p className="mt-1 text-xs font-bold text-animeo-muted">
                      {place.latitude != null ? (place.precision ? precisionLabels[place.precision] : "localisé") : <span className="text-animeo-danger">adresse introuvable : pas encore sur la carte</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing({ id: place.id, name: place.name, kind: place.kind, address: place.address, postalCode: place.postalCode, city: place.city, notes: place.notes })} aria-label={`Modifier ${place.name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark">
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDeleting(place)} aria-label={`Supprimer ${place.name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-danger">
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-sm font-extrabold text-animeo-dark">
                  {owners} propriétaire{owners > 1 ? "s" : ""} · {pluralizeAnimals(place.animals.length)}
                </p>
                {place.animals.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {place.animals.map((animal) => (
                      <li key={animal.id}>
                        <Link href={`/dashboard/clients/${animal.clientId}`} className="inline-flex min-h-9 items-center rounded-lg bg-animeo-bg px-2.5 text-xs font-bold text-animeo-dark transition hover:bg-animeo-soft">
                          {animal.name} <span className="ml-1 font-semibold text-animeo-muted">· {animal.species} · {animal.ownerName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-xs text-animeo-muted">Aucun animal rattaché.</p>}
                {place.notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-animeo-bg p-3 text-xs text-animeo-dark"><strong>Accès :</strong> {place.notes}</p> : null}
              </Card>
            );
          })}
        </div>
      )}

      {editing ? <PlaceModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
      {deleting ? (
        <ConfirmModal
          title={`Supprimer « ${deleting.name} » ?`}
          message={deleting.animals.length
            ? `${deleting.animals.length > 1 ? `Ses ${pluralizeAnimals(deleting.animals.length)} redeviendront « chez leur propriétaire »` : "Son animal redeviendra « chez son propriétaire »"}. Les rendez-vous passés ne changent pas.`
            : "Aucun animal n’y est rattaché."}
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

function PlaceModal({ initial, onClose, onSaved }: { initial: SavePlaceInput; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<SavePlaceInput>) => setDraft((current) => ({ ...current, ...patch }));

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await savePlaceAction(draft);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    notify.success(result.located ? `« ${result.place.name} » enregistré.` : `« ${result.place.name} » enregistré, mais son adresse est introuvable : il n’apparaîtra pas sur la carte.`);
    onSaved();
  }

  return (
    <Modal
      title={initial.id ? `Modifier ${initial.name}` : "Nouveau lieu"}
      onClose={onClose}
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving || !draft.name.trim() || !draft.city.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error sm:col-span-2">{error}</p> : null}
        <Field label="Nom du lieu"><input value={draft.name} onChange={(event) => update({ name: event.target.value })} className={inputClassName} placeholder="Ex. Haras du Moulin" required /></Field>
        <Field label="Type">
          <select value={draft.kind} onChange={(event) => update({ kind: event.target.value as AnimalPlaceKind })} className={inputClassName}>
            {animalPlaceKinds.map((kind) => <option key={kind} value={kind}>{animalPlaceKindLabels[kind]}</option>)}
          </select>
        </Field>
        <Field label="Adresse"><input value={draft.address} onChange={(event) => update({ address: event.target.value })} className={inputClassName} /></Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Code postal"><input value={draft.postalCode} onChange={(event) => update({ postalCode: event.target.value })} className={inputClassName} inputMode="numeric" /></Field>
          <Field label="Commune"><input value={draft.city} onChange={(event) => update({ city: event.target.value })} className={inputClassName} required /></Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes d’accès"><textarea value={draft.notes} onChange={(event) => update({ notes: event.target.value })} className={textareaClassName} placeholder="Portail, écurie, personne à prévenir…" /></Field>
        </div>
      </div>
    </Modal>
  );
}
