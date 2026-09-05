"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { AnimalEditModal } from "@/components/clients/animal-edit-modal";
import { Card } from "@/components/ui/card";
import { createDocumentAction, getDocumentsForAnimal, getDocumentTemplates } from "@/lib/documents-actions";
import { pickDefaultTemplate } from "@/lib/documents/templates";
import { notify } from "@/lib/notify";
import type { Animal } from "@/data/clients";
import type { StudioDocumentSummary } from "@/data/documents";

type AnimalRecordProps = {
  animal: Animal;
  clientId: string;
  photo?: string;
  onPhotoChange: (photo: string | null) => void;
  onAnimalUpdated: (animal: Animal) => void;
};

export function AnimalRecord({ animal, clientId, photo, onPhotoChange, onAnimalUpdated }: AnimalRecordProps) {
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 5_000_000) {
      setPhotoError("La photo doit peser moins de 5 Mo.");
      return;
    }

    try {
      const resizedPhoto = await resizeAnimalPhoto(file);
      onPhotoChange(resizedPhoto);
      setPhotoError(null);
    } catch {
      setPhotoError("Cette image n’a pas pu être utilisée. Essayez un fichier JPG, PNG ou WebP.");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="shrink-0" style={{ width: 128 }}>
              <div className={`relative flex items-center justify-center overflow-hidden rounded-[24px] border-4 border-white bg-gradient-to-br text-6xl shadow-[0_8px_24px_rgba(24,59,69,0.1)] ${animal.avatarBackground}`} style={{ width: 128, height: 128 }} role="img" aria-label={photo ? `Photo de ${animal.name}` : `Pictogramme de ${animal.name}`}>
                {photo ? <Image src={photo} alt="" fill unoptimized sizes="128px" className="object-cover" /> : animal.avatar}
              </div>
              <div className="mt-2 flex justify-center gap-2">
                <label className="cursor-pointer text-xs font-extrabold text-animeo hover:underline">
                  {photo ? "Remplacer" : "Ajouter une photo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} className="sr-only" />
                </label>
                {photo ? <button type="button" onClick={() => { onPhotoChange(null); setPhotoError(null); }} className="text-xs font-bold text-animeo-muted hover:text-animeo-error">Retirer</button> : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-animeo">Fiche animal</p>
              <h2 className="mt-1 text-3xl font-black text-animeo-dark">{animal.name}</h2>
              <p className="mt-1 font-bold text-animeo-muted">{animal.species} · {animal.breed}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <AnimalInfo label="Âge" value={animal.age} />
                <AnimalInfo label="Poids" value={animal.weight} />
                <AnimalInfo label="Sexe" value={animal.sex} />
              </div>
            </div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-[#d4e2df] bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:border-animeo hover:bg-animeo-soft"
            >
              <EditIcon />
              Modifier
            </button>
          </div>
          {photoError ? <p role="alert" className="mt-4 rounded-[14px] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{photoError}</p> : null}
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <HealthInfo title="Antécédents" value={animal.history} />
          <HealthInfo title="Pathologies / sensibilités" value={animal.conditions} />
          <HealthInfo title="Traitements" value={animal.treatments} />
          <HealthInfo title="Notes" value={animal.notes} accent />
        </div>
      </Card>

      <ConsultationHistory animal={animal} />

      <DocumentsHistory animal={animal} clientId={clientId} />

      {editing ? (
        <AnimalEditModal
          animal={animal}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            onAnimalUpdated(updated);
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

async function resizeAnimalPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const maximumSize = 640;
  const scale = Math.min(1, maximumSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.82);
}

function AnimalInfo({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-xl border border-white bg-white/80 px-3 py-2 text-xs shadow-sm">
      <strong className="text-animeo-muted">{label} :</strong>{" "}
      <span className="font-extrabold text-animeo-dark">{value}</span>
    </span>
  );
}

function HealthInfo({ title, value, accent = false }: { title: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-[#f1d89f] bg-[#fff9ec]" : "border-[#e2ece9] bg-animeo-bg"}`}>
      <h3 className={`text-xs font-extrabold uppercase tracking-[0.11em] ${accent ? "text-[#9a6a18]" : "text-animeo"}`}>{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-animeo-dark">{value}</p>
    </div>
  );
}

function ConsultationHistory({ animal }: { animal: Animal }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#e5eeeb] px-5 py-4 sm:px-6">
        <h2 className="text-lg font-extrabold text-animeo-dark">Historique des consultations</h2>
        <p className="mt-0.5 text-sm text-animeo-muted">Suivi propre à {animal.name}</p>
      </div>

      <div className="divide-y divide-[#edf2f0]">
        {animal.consultations.map((consultation) => (
          <article key={consultation.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-animeo-dark">{consultation.date}</p>
                <p className="mt-1 font-extrabold text-animeo-dark">{consultation.service}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e4f5ef] px-2.5 py-1 text-[10px] font-black text-[#267668]">
                <span className="h-1.5 w-1.5 rounded-full bg-animeo" />
                {consultation.status}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${consultation.mode === "Cabinet" ? "bg-animeo-soft text-animeo-dark" : "bg-[#e8f1f4] text-[#315f6c]"}`}>
                {consultation.mode}
              </span>
              <span className="rounded-full bg-animeo-bg px-2.5 py-1 text-[10px] font-black text-animeo-dark">{consultation.price}</span>
            </div>

            <p className="mt-3 text-xs font-semibold leading-relaxed text-animeo-muted">{consultation.summary}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

/**
 * Comptes rendus du Studio de documents liés à cet animal (étape 5). Seule
 * section de la fiche animal à récupérer ses données après le montage
 * plutôt que via les props serveur déjà chargées (comme `consultations`) :
 * `getDocumentsForAnimal` ne renvoie les documents que d'UN animal, alors
 * que changer d'animal ici est un simple état client (AnimalSelector dans
 * client-profile.tsx, pas une navigation) — y ajouter systématiquement les
 * documents de tous les animaux via getClientById alourdirait toutes les
 * autres consommations de `Animal` (tournées, statistiques, import...) pour
 * un besoin propre à cette seule section.
 */
function DocumentsHistory({ animal, clientId }: { animal: Animal; clientId: string }) {
  const router = useRouter();
  // Associe chaque résultat à l'animal pour lequel il a été chargé plutôt
  // que de réinitialiser à null en tête d'effet (setState synchrone dans un
  // effet, cascading renders) : le "Chargement…" se déduit à la lecture en
  // comparant `loaded.animalId` à l'animal affiché, jamais posé par l'effet.
  const [loaded, setLoaded] = useState<{ animalId: string; documents: StudioDocumentSummary[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const documents = loaded?.animalId === animal.id ? loaded.documents : null;

  useEffect(() => {
    let cancelled = false;
    getDocumentsForAnimal(animal.id).then((result) => {
      if (!cancelled) setLoaded({ animalId: animal.id, documents: result });
    });
    return () => {
      cancelled = true;
    };
  }, [animal.id]);

  async function handleCreate() {
    setCreating(true);
    const templates = await getDocumentTemplates();
    const template = pickDefaultTemplate(animal.species, templates);
    const result = await createDocumentAction({
      title: `Compte rendu — ${animal.name}`,
      clientId,
      animalId: animal.id,
      templateId: template?.id,
    });
    setCreating(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    router.push(`/dashboard/documents/${result.id}`);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[#e5eeeb] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-extrabold text-animeo-dark">Comptes rendus</h2>
          <p className="mt-0.5 text-sm text-animeo-muted">Studio de documents, propre à {animal.name}</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="shrink-0 rounded-xl bg-animeo px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? "…" : "Nouveau compte rendu"}
        </button>
      </div>

      {documents === null ? (
        <p className="p-5 text-sm font-semibold text-animeo-muted sm:p-6">Chargement…</p>
      ) : documents.length === 0 ? (
        <p className="p-5 text-sm font-semibold text-animeo-muted sm:p-6">Aucun compte rendu pour {animal.name}.</p>
      ) : (
        <div className="divide-y divide-[#edf2f0]">
          {documents.map((document) => (
            <Link key={document.id} href={`/dashboard/documents/${document.id}`} className="flex items-center justify-between gap-3 p-4 transition hover:bg-animeo-bg sm:px-6">
              <span className="min-w-0">
                <span className="block truncate font-extrabold text-animeo-dark">{document.title}</span>
                <span className="mt-0.5 block text-xs font-semibold text-animeo-muted">{document.updatedAt}</span>
              </span>
              <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${document.status === "Finalisé" ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#fff1d5] text-[#986216]"}`}>
                {document.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
