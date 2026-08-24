"use client";

import Image from "next/image";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Field, ImagePicker, SectionTitle, inputClassName } from "@/components/settings/settings-fields";
import type { ProfileSettings } from "@/data/settings";

const colors = ["#4FAF9F", "#3D8E83", "#4E7BA6", "#8067B0", "#D58C55"];

type CustomizationSettingsTabProps = {
  profile: ProfileSettings;
  color: string;
  onProfileChange: (profile: ProfileSettings) => void;
  onColorChange: (color: string) => void;
};

export function CustomizationSettingsTab({ profile, color, onProfileChange, onColorChange }: CustomizationSettingsTabProps) {
  const [draftColor, setDraftColor] = useState(color);
  const photoIsImage = profile.photo.startsWith("data:image");
  const logoIsImage = profile.logo.startsWith("data:image");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="p-5 sm:p-6">
        <SectionTitle title="Personnalisation de la page publique" description="Ces choix ne modifient pas les couleurs de votre interface professionnelle Animéo." />
        <div className="space-y-4">
          <ImagePicker label="Logo public" value={profile.logo} onChange={(logo) => onProfileChange({ ...profile, logo })} shape="square" />
          <ImagePicker label="Photo professionnelle" value={profile.photo} onChange={(photo) => onProfileChange({ ...profile, photo })} />
        </div>
        <div className="mt-6">
          <Field label="Couleur principale de la page publique">
            <div className="flex flex-wrap items-center gap-3">
              {colors.map((item) => <button key={item} type="button" onClick={() => setDraftColor(item)} aria-label={`Choisir la couleur ${item}`} aria-pressed={draftColor === item} className={`h-10 w-10 rounded-full border-4 transition ${draftColor === item ? "scale-110 border-animeo-dark" : "border-white shadow"}`} style={{ backgroundColor: item }} />)}
              <input type="color" value={draftColor} onChange={(event) => setDraftColor(event.target.value)} aria-label="Couleur personnalisée" className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent" />
              <input value={draftColor.toUpperCase()} onChange={(event) => setDraftColor(event.target.value)} className={`${inputClassName} w-32`} aria-label="Code de la couleur" />
            </div>
          </Field>
        </div>
        <button type="button" onClick={() => onColorChange(draftColor)} className="mt-6 rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-sm">Enregistrer la personnalisation</button>
      </Card>

      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Aperçu de la page de réservation</p>
        <div className="overflow-hidden rounded-3xl border border-[#dfe9e6] bg-white shadow-[0_18px_50px_rgba(24,59,69,0.12)]">
          <div className="h-3" style={{ backgroundColor: draftColor }} />
          <div className="p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-animeo-soft text-lg font-black text-animeo-dark">
              {logoIsImage ? <Image src={profile.logo} alt="Logo local" width={64} height={64} unoptimized className="h-full w-full object-cover" /> : profile.logo}
            </div>
            <div className="mx-auto -mt-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-animeo-bg text-xl font-black text-animeo-dark shadow-sm">
              {photoIsImage ? <Image src={profile.photo} alt="Portrait local" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : profile.photo}
            </div>
            <h3 className="mt-3 text-xl font-black text-animeo-dark">{profile.firstName} {profile.lastName}</h3>
            <p className="text-sm font-bold" style={{ color: draftColor }}>{profile.profession}</p>
            <p className="mt-3 text-sm leading-6 text-animeo-muted">{profile.bio}</p>
            <div className="mt-5 rounded-2xl bg-animeo-bg p-4 text-left"><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Prochaine étape</p><p className="mt-1 font-black text-animeo-dark">Choisissez votre prestation</p></div>
            <span className="mt-4 block w-full rounded-2xl px-5 py-3 text-center text-sm font-extrabold text-white" style={{ backgroundColor: draftColor }}>Prendre rendez-vous</span>
          </div>
        </div>
      </div>
    </div>
  );
}
