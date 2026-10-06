"use client";

import { useCallback, useMemo, useState } from "react";
import type { AppointmentPrefill } from "@/components/appointments/appointments-context";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";
import type { ClientPickerAnimal, ClientPickerOption } from "@/data/clients";
import type { ServiceSettings } from "@/data/settings";
import type { AnimalSpecies } from "@/data/species";
import { toLocalDateId } from "@/lib/booking-validation";
import { hasCabinet, type PracticeMode } from "@/lib/practice-mode";
import { durationOptions } from "@/data/durations";

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
  /**
   * Visite multi-animaux (chantier C6) : les animaux cochés après le
   * premier, chacun avec sa prestation, sa durée et son tarif. Le premier
   * reste dans les champs ci-dessus : un seul animal coché, rien ne change.
   */
  extraAnimals: VisitLine[];
};

/** Un animal d'une visite et son rendez-vous. */
export type VisitLine = {
  animalId?: string;
  animalName: string;
  animalSpecies?: AnimalSpecies;
  animalDetail: string;
  serviceName: string;
  duration: number;
  price: number;
};

/** Les rendez-vous de la visite, dans l'ordre : le premier animal, puis les suivants. */
export function visitLines(draft: AppointmentDraft): VisitLine[] {
  const first: VisitLine = { animalId: draft.animalId, animalName: draft.animalName, animalSpecies: draft.animalSpecies, animalDetail: draft.animalDetail, serviceName: draft.serviceName, duration: draft.duration, price: draft.price };
  return draft.animalName ? [first, ...draft.extraAnimals] : draft.extraAnimals;
}

/** Réécrit le brouillon à partir des lignes : la première dans les champs, les autres à la suite. */
function withLines(draft: AppointmentDraft, lines: VisitLine[]): AppointmentDraft {
  const [first, ...rest] = lines;
  if (!first) return { ...draft, animalId: undefined, animalName: "", animalSpecies: undefined, animalDetail: "", extraAnimals: [] };
  return { ...draft, animalId: first.animalId, animalName: first.animalName, animalSpecies: first.animalSpecies, animalDetail: first.animalDetail, serviceName: first.serviceName, duration: first.duration, price: first.price, extraAnimals: rest };
}

/** Durée totale de la visite (ou du rendez-vous seul). */
export function visitDuration(draft: AppointmentDraft): number {
  return visitLines(draft).reduce((total, line) => total + line.duration, 0) || draft.duration;
}

/**
 * Adresse d'un rendez-vous à domicile, tirée du lieu où vit l'animal (haras,
 * pension… — phase 8.9) : l'adresse du lieu, son nom en complément, sa
 * position. Nulle si l'animal vit chez son propriétaire.
 */
function placeAddress(animal: ClientPickerAnimal | undefined): Partial<AppointmentDraft> | null {
  const place = animal?.place;
  if (!place) return null;
  return {
    addressLine: place.address,
    addressExtra: place.name,
    postalCode: place.postalCode,
    city: place.city,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
  };
}

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
export function useAppointmentDraft({ appointment, template, defaultDate, prefill, prefillClient, services, practiceMode }: {
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
  /** Fiche du client à préremplir (résolue par l'appelant à partir de prefill.clientId). */
  prefillClient?: ClientPickerOption;
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
        extraAnimals: [],
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
    // Client déjà choisi (ex. « Nouveau RDV » depuis la carte) : mêmes
    // valeurs que si on l'avait sélectionné dans la liste.
    const client = prefillClient;
    // L'animal affiché sur la fiche d'où l'on vient, sinon le premier.
    const firstAnimal = client?.animals.find((animal) => animal.id === prefill?.animalId) ?? client?.animals[0];
    return {
      place,
      tourRunId: null,
      date: prefill?.date ?? defaultDate ?? toLocalDateId(new Date()),
      start: prefill?.start ?? "09:00",
      duration: prefill?.duration ?? firstService?.duration ?? 60,
      clientId: client?.id,
      clientName: client ? `${client.firstName} ${client.lastName}` : "",
      clientPhone: client?.phone ?? "",
      animalId: firstAnimal?.id,
      animalName: firstAnimal?.name ?? "",
      animalSpecies: (firstAnimal?.species as AnimalSpecies | undefined) ?? undefined,
      animalDetail: animalDetailOf(firstAnimal),
      serviceName: firstService?.name ?? "",
      price: (place === "cabinet" ? firstService?.cabinetPrice : firstService?.homePrice) ?? 0,
      status: "confirmed",
      notes: "",
      addressLine: client?.address ?? "",
      addressExtra: "",
      postalCode: "",
      city: client?.city ?? "",
      latitude: undefined,
      longitude: undefined,
      extraAnimals: [],
      ...placeAddress(firstAnimal),
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
      extraAnimals: [],
      animalId: firstAnimal?.id,
      animalName: firstAnimal?.name ?? "",
      animalSpecies: (firstAnimal?.species as AnimalSpecies) ?? undefined,
      animalDetail: animalDetailOf(firstAnimal),
      // L'adresse du client sert de point de départ, jamais d'imposition :
      // elle reste modifiable, et n'écrase pas une adresse déjà saisie.
      addressLine: current.addressLine || client.address,
      city: current.city || client.city,
      // Un animal qui vit ailleurs (haras…) : c'est là qu'on se rend.
      ...(current.addressLine ? null : placeAddress(firstAnimal)),
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
      extraAnimals: [],
      animalId: undefined,
      animalName: "",
      animalSpecies: undefined,
      animalDetail: "",
    }));
  }, []);

  const setFreeformAnimal = useCallback((name: string, species: AnimalSpecies) => {
    setDraft((current) => ({
      ...current,
      extraAnimals: [],
      animalId: undefined,
      animalName: name,
      animalSpecies: species,
      animalDetail: species,
    }));
  }, []);

  const clearClient = useCallback(() => {
    setDraft((current) => ({
      ...current,
      extraAnimals: [],
      clientId: undefined,
      clientName: "",
      clientPhone: "",
      animalId: undefined,
      animalName: "",
      animalSpecies: undefined,
      animalDetail: "",
    }));
  }, []);

  const selectAnimal = useCallback((animal: { id: string; name: string; species: string; breed?: string; age?: string; place?: ClientPickerAnimal["place"] }) => {
    setDraft((current) => ({
      ...current,
      animalId: animal.id,
      animalName: animal.name,
      animalSpecies: animal.species as AnimalSpecies,
      animalDetail: animalDetailOf(animal),
      // Choisir un animal qui vit dans un lieu y place le rendez-vous
      // (adresse toujours modifiable ensuite).
      ...placeAddress(animal as ClientPickerAnimal),
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
      // Le tarif suit le lieu, comme il suit la prestation — pour chaque animal de la visite.
      price: service ? (place === "cabinet" ? service.cabinetPrice : service.homePrice) : current.price,
      extraAnimals: current.extraAnimals.map((line) => {
        const lineService = services.find((item) => item.name === line.serviceName);
        return lineService ? { ...line, price: place === "cabinet" ? lineService.cabinetPrice : lineService.homePrice } : line;
      }),
    }));
  }, [services]);

  /**
   * Cocher ou décocher un animal (création seulement). Le premier coché tient
   * le rendez-vous comme avant ; les suivants rejoignent la visite avec la
   * même prestation que lui, réglable ensuite.
   */
  const toggleVisitAnimal = useCallback((animal: { id: string; name: string; species: string; breed?: string; age?: string; place?: ClientPickerAnimal["place"] }) => {
    setDraft((current) => {
      const lines = visitLines(current);
      if (lines.some((line) => line.animalId === animal.id)) return withLines(current, lines.filter((line) => line.animalId !== animal.id));
      if (lines.length === 0) {
        return { ...current, animalId: animal.id, animalName: animal.name, animalSpecies: animal.species as AnimalSpecies, animalDetail: animalDetailOf(animal), ...placeAddress(animal as ClientPickerAnimal) };
      }
      const service = services.find((item) => item.name === current.serviceName);
      const line: VisitLine = {
        animalId: animal.id,
        animalName: animal.name,
        animalSpecies: animal.species as AnimalSpecies,
        animalDetail: animalDetailOf(animal),
        serviceName: current.serviceName,
        duration: service?.duration ?? current.duration,
        price: service ? (current.place === "cabinet" ? service.cabinetPrice : service.homePrice) : current.price,
      };
      return { ...current, extraAnimals: [...current.extraAnimals, line] };
    });
  }, [services]);

  /** Régler le rendez-vous d'un animal de la visite (durée, tarif). */
  const updateVisitLine = useCallback((index: number, change: Partial<VisitLine>) => {
    setDraft((current) => withLines(current, visitLines(current).map((line, position) => (position === index ? { ...line, ...change } : line))));
  }, []);

  const selectVisitLineService = useCallback((index: number, service: ServiceSettings) => {
    setDraft((current) => withLines(current, visitLines(current).map((line, position) => (position === index
      ? { ...line, serviceName: service.name, duration: service.duration, price: current.place === "cabinet" ? service.cabinetPrice : service.homePrice }
      : line))));
  }, []);

  /** Monter ou descendre un animal dans le déroulé. */
  const moveVisitLine = useCallback((index: number, delta: -1 | 1) => {
    setDraft((current) => {
      const lines = visitLines(current);
      const target = index + delta;
      if (target < 0 || target >= lines.length) return current;
      const next = [...lines];
      [next[index], next[target]] = [next[target], next[index]];
      return withLines(current, next);
    });
  }, []);

  return { draft, setDraft, update, selectClient, clearClient, selectAnimal, selectService, selectPlace, useFreeformClient, setFreeformAnimal, toggleVisitAnimal, updateVisitLine, selectVisitLineService, moveVisitLine };
}

/** Adresse composée telle qu'elle est enregistrée (reprise de l'ancien formulaire). */
export function composeLocation(draft: AppointmentDraft): string {
  if (draft.place === "cabinet") return "Cabinet";
  const line1 = [draft.addressLine.trim(), draft.addressExtra.trim() ? `(${draft.addressExtra.trim()})` : ""].filter(Boolean).join(" ");
  const line2 = [draft.postalCode.trim(), draft.city.trim()].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}


/** Durées proposées : la liste commune, celles des prestations réglées, et la valeur courante. */
export function useDurationOptions(services: ServiceSettings[], current: number) {
  return useMemo(() => {
    const values = new Set<number>(durationOptions(current));
    for (const service of services) if (service.duration > 0) values.add(service.duration);
    return [...values].sort((first, second) => first - second);
  }, [services, current]);
}
