"use client";

import { useCallback, useMemo, useState } from "react";
import type { AppointmentPrefill } from "@/components/appointments/appointments-context";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";
import type { ClientPickerOption } from "@/data/clients";
import type { ServiceSettings } from "@/data/settings";
import type { AnimalSpecies } from "@/data/species";
import { toLocalDateId } from "@/lib/booking-validation";
import { hasCabinet, type PracticeMode } from "@/lib/practice-mode";

/**
 * Où le rendez-vous se déroule, du point de vue de l'utilisateur.
 *
 * « Tournée » n'existe pas en base : un rendez-vous est au cabinet ou à
 * domicile. C'est une façon de saisir un rendez-vous à domicile en le
 * rattachant du même geste à la tournée du jour — voir
 * listTourRunsForDateAction. La distinction ne vit donc que dans ce
 * brouillon, jamais dans les données enregistrées.
 */
export type AppointmentPlace = "cabinet" | "home" | "tour";

export type AppointmentDraft = {
  place: AppointmentPlace;
  tourRunId: string | null;
  date: string;
  start: string;
  duration: number;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  animalId?: string;
  animalName: string;
  animalSpecies?: AnimalSpecies;
  animalDetail: string;
  serviceName: string;
  price: number;
  status: AppointmentStatus;
  notes: string;
  addressLine: string;
  addressExtra: string;
  postalCode: string;
  city: string;
  latitude?: number;
  longitude?: number;
  /** Répétition : voir buildRecurrenceDates. */
  repeat: RecurrenceFrequency | null;
  repeatCount: number;
};

export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";

export const recurrenceLabels: Record<RecurrenceFrequency, string> = {
  weekly: "Chaque semaine",
  biweekly: "Toutes les deux semaines",
  monthly: "Tous les mois",
};

export function modeOf(place: AppointmentPlace): AppointmentMode {
  return place === "cabinet" ? "cabinet" : "home";
}

function animalDetailOf(animal: { species?: string; breed?: string; age?: string } | undefined): string {
  if (!animal) return "";
  return [animal.species, animal.breed, animal.age].map((part) => part?.trim()).filter(Boolean).join(" · ");
}

/**
 * Brouillon du rendez-vous en cours de saisie.
 *
 * Il vit **au-dessus** des sous-fenêtres de création rapide (client, animal) :
 * c'est ce qui garantit qu'ouvrir « + Créer un nouveau client » au milieu de
 * la saisie ne perd rien de ce qui a déjà été renseigné. Les sous-fenêtres ne
 * font que rendre un résultat, elles ne détiennent jamais l'état du
 * rendez-vous.
 */
export function useAppointmentDraft({ appointment, template, defaultDate, prefill, services, practiceMode }: {
  /** Rendez-vous en cours de modification. */
  appointment?: Appointment;
  /**
   * Rendez-vous servant de modèle à une duplication : mêmes valeurs de
   * départ, mais un nouveau rendez-vous — donc sans identifiant, et ramené
   * au statut d'un rendez-vous à venir plutôt qu'à celui, souvent « terminé »,
   * de celui qu'on recopie.
   */
  template?: Appointment;
  defaultDate?: string;
  /** Créneau choisi dans la grille de l'agenda, appliqué par-dessus les valeurs par défaut. */
  prefill?: AppointmentPrefill;
  services: ServiceSettings[];
  /** Mode d'exercice : décide du lieu proposé par défaut. */
  practiceMode: PracticeMode;
}) {
  const [draft, setDraft] = useState<AppointmentDraft>(() => {
    const seed = appointment ?? template;
    if (seed) {
      const appointment = seed;
      return {
        place: appointment.mode === "cabinet" ? "cabinet" : "home",
        tourRunId: null,
        // Une duplication garde la date de son modèle : on la déplace
        // ensuite, et partir de la date d'origine évite de la ressaisir
        // quand on recopie un rendez-vous de la même semaine.
        date: appointment.date,
        start: appointment.start,
        duration: appointment.duration,
        clientId: appointment.clientId,
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone ?? "",
        animalId: appointment.animalId,
        animalName: appointment.animalName,
        animalSpecies: appointment.animalSpecies,
        animalDetail: appointment.animalSpecies ?? "",
        serviceName: appointment.serviceName,
        price: appointment.price,
        status: template ? "confirmed" : appointment.status,
        notes: appointment.notes,
        addressLine: appointment.mode === "home" ? appointment.location : "",
        addressExtra: "",
        postalCode: appointment.postalCode ?? "",
        city: appointment.city ?? "",
        latitude: appointment.latitude,
        longitude: appointment.longitude,
        repeat: null,
        repeatCount: 4,
      };
    }

    // Première prestation active plutôt qu'un nom écrit en dur : les
    // prestations, leurs durées et leurs tarifs sont réglés dans Prestations,
    // et c'est la seule source.
    const firstService = services.find((service) => service.active) ?? services[0];
    // Créneau tracé dans l'agenda : il prime sur la prestation et sur l'heure
    // par défaut, puisqu'il vient d'être choisi à la main.
    // Sans cabinet, le rendez-vous est à domicile d'office : proposer un
    // lieu qui n'existe pas obligerait à le corriger à chaque fois.
    const place: AppointmentPlace = prefill?.mode === "home" || !hasCabinet(practiceMode) ? "home" : "cabinet";
    return {
      place,
      tourRunId: null,
      date: prefill?.date ?? defaultDate ?? toLocalDateId(new Date()),
      start: prefill?.start ?? "09:00",
      duration: prefill?.duration ?? firstService?.duration ?? 60,
      clientId: undefined,
      clientName: "",
      clientPhone: "",
      animalId: undefined,
      animalName: "",
      animalSpecies: undefined,
      animalDetail: "",
      serviceName: firstService?.name ?? "",
      price: (place === "cabinet" ? firstService?.cabinetPrice : firstService?.homePrice) ?? 0,
      status: "confirmed",
      notes: "",
      addressLine: "",
      addressExtra: "",
      postalCode: "",
      city: "",
      latitude: undefined,
      longitude: undefined,
      repeat: null,
      repeatCount: 4,
    };
  });

  const update = useCallback((change: Partial<AppointmentDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
  }, []);

  /** Sélection d'un client : ses coordonnées, son premier animal, son adresse. */
  const selectClient = useCallback((client: ClientPickerOption) => {
    const firstAnimal = client.animals[0];
    setDraft((current) => ({
      ...current,
      clientId: client.id,
      clientName: `${client.firstName} ${client.lastName}`,
      clientPhone: client.phone,
      animalId: firstAnimal?.id,
      animalName: firstAnimal?.name ?? "",
      animalSpecies: (firstAnimal?.species as AnimalSpecies) ?? undefined,
      animalDetail: animalDetailOf(firstAnimal),
      // L'adresse du client sert de point de départ, jamais d'imposition :
      // elle reste modifiable, et n'écrase pas une adresse déjà saisie.
      addressLine: current.addressLine || client.address,
      city: current.city || client.city,
    }));
  }, []);

  /**
   * Client saisi à la volée, sans fiche.
   *
   * Un rendez-vous peut exister sans client enregistré : le serveur stocke
   * alors le nom seul (clientId à null). C'est le cas d'un passage unique, ou
   * d'un appel où l'on ne veut pas créer de fiche tout de suite. Retirer cette
   * possibilité aurait supprimé une fonction qui existait.
   */
  const useFreeformClient = useCallback((name: string) => {
    setDraft((current) => ({
      ...current,
      clientId: undefined,
      clientName: name.trim(),
      clientPhone: "",
      animalId: undefined,
      animalName: "",
      animalSpecies: undefined,
      animalDetail: "",
    }));
  }, []);

  const setFreeformAnimal = useCallback((name: string, species: AnimalSpecies) => {
    setDraft((current) => ({
      ...current,
      animalId: undefined,
      animalName: name,
      animalSpecies: species,
      animalDetail: species,
    }));
  }, []);

  const clearClient = useCallback(() => {
    setDraft((current) => ({
      ...current,
      clientId: undefined,
      clientName: "",
      clientPhone: "",
      animalId: undefined,
      animalName: "",
      animalSpecies: undefined,
      animalDetail: "",
    }));
  }, []);

  const selectAnimal = useCallback((animal: { id: string; name: string; species: string; breed?: string; age?: string }) => {
    setDraft((current) => ({
      ...current,
      animalId: animal.id,
      animalName: animal.name,
      animalSpecies: animal.species as AnimalSpecies,
      animalDetail: animalDetailOf(animal),
    }));
  }, []);

  /**
   * Prestation choisie : durée et tarif suivent, le tarif dépendant du lieu
   * (une visite à domicile n'est pas facturée comme une venue au cabinet).
   * Les deux restent modifiables ensuite — un cas particulier arrive.
   */
  const selectService = useCallback((service: ServiceSettings, place: AppointmentPlace) => {
    setDraft((current) => ({
      ...current,
      serviceName: service.name,
      duration: service.duration,
      price: place === "cabinet" ? service.cabinetPrice : service.homePrice,
    }));
  }, []);

  const selectPlace = useCallback((place: AppointmentPlace, service: ServiceSettings | undefined) => {
    setDraft((current) => ({
      ...current,
      place,
      tourRunId: place === "tour" ? current.tourRunId : null,
      // Le tarif suit le lieu, comme il suit la prestation.
      price: service ? (place === "cabinet" ? service.cabinetPrice : service.homePrice) : current.price,
    }));
  }, []);

  return { draft, setDraft, update, selectClient, clearClient, selectAnimal, selectService, selectPlace, useFreeformClient, setFreeformAnimal };
}

/** Adresse composée telle qu'elle est enregistrée (reprise de l'ancien formulaire). */
export function composeLocation(draft: AppointmentDraft): string {
  if (draft.place === "cabinet") return "Cabinet";
  const line1 = [draft.addressLine.trim(), draft.addressExtra.trim() ? `(${draft.addressExtra.trim()})` : ""].filter(Boolean).join(" ");
  const line2 = [draft.postalCode.trim(), draft.city.trim()].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

/**
 * Dates des occurrences suivantes d'un rendez-vous répété.
 *
 * Chacune sera créée par le même enregistrement que le rendez-vous initial :
 * une occurrence qui tomberait sur un créneau occupé est refusée par le
 * serveur comme n'importe quel autre rendez-vous, et signalée — jamais
 * enregistrée de force, jamais silencieusement ignorée.
 */
export function buildRecurrenceDates(startDateId: string, frequency: RecurrenceFrequency, count: number): string[] {
  const [year, month, day] = startDateId.split("-").map(Number);
  const dates: string[] = [];

  for (let index = 1; index <= count; index += 1) {
    const date = new Date(year, month - 1, day, 12);
    if (frequency === "weekly") date.setDate(date.getDate() + 7 * index);
    else if (frequency === "biweekly") date.setDate(date.getDate() + 14 * index);
    else date.setMonth(date.getMonth() + index);
    dates.push(toLocalDateId(date));
  }

  return dates;
}

/** Durées proposées : celles des prestations réglées, plus les paliers usuels. */
export function useDurationOptions(services: ServiceSettings[], current: number) {
  return useMemo(() => {
    const values = new Set<number>([15, 30, 45, 60, 90, 120]);
    for (const service of services) values.add(service.duration);
    values.add(current);
    return [...values].filter((value) => value > 0).sort((first, second) => first - second);
  }, [services, current]);
}
