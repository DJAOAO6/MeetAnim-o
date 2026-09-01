"use client";

import { useId, useState } from "react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { notify } from "@/lib/notify";
import { reverseGeocodeAction } from "@/lib/tour-runs-actions";
import type { SavedPlaceView } from "@/lib/tour-runs";

export type EndpointValue = {
  type: "CABINET" | "HOME" | "FAVORITE" | "CUSTOM" | "CURRENT_LOCATION" | "LAST_APPOINTMENT" | "SAME_AS_START";
  savedPlaceId: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
};

type TourRunEndpointPickerProps = {
  label: string;
  value: EndpointValue;
  onChange: (value: EndpointValue) => void;
  savedPlaces: SavedPlaceView[];
  cabinetAvailable: boolean;
  allowMirrorStart?: boolean;
  allowLastAppointment?: boolean;
};

const OPTION_CUSTOM = "__custom__";
const OPTION_CURRENT_LOCATION = "__current_location__";

export function TourRunEndpointPicker({ label, value, onChange, savedPlaces, cabinetAvailable, allowMirrorStart, allowLastAppointment }: TourRunEndpointPickerProps) {
  const selectId = useId();
  const [customQuery, setCustomQuery] = useState(value.type === "CUSTOM" ? value.address ?? "" : "");
  const [locating, setLocating] = useState(false);

  const selectValue =
    value.type === "FAVORITE" || value.type === "HOME" ? value.savedPlaceId ?? "" :
    value.type === "CUSTOM" ? OPTION_CUSTOM :
    value.type === "CURRENT_LOCATION" ? OPTION_CURRENT_LOCATION :
    value.type;

  function handleSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;

    if (next === "CABINET") return onChange({ type: "CABINET", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null });
    if (next === "SAME_AS_START") return onChange({ type: "SAME_AS_START", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null });
    if (next === "LAST_APPOINTMENT") return onChange({ type: "LAST_APPOINTMENT", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null });
    if (next === OPTION_CUSTOM) {
      setCustomQuery("");
      return onChange({ type: "CUSTOM", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null });
    }
    if (next === OPTION_CURRENT_LOCATION) return void requestCurrentLocation();

    // Sinon : id d'un SavedPlace (favori ou domicile).
    const place = savedPlaces.find((candidate) => candidate.id === next);
    if (!place) return;
    onChange({ type: place.type === "HOME" ? "HOME" : "FAVORITE", savedPlaceId: place.id, address: place.address, latitude: place.latitude, longitude: place.longitude, label: place.label });
  }

  function requestCurrentLocation() {
    if (!("geolocation" in navigator)) {
      notify.error("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const result = await reverseGeocodeAction({ latitude, longitude });
        setLocating(false);
        onChange({
          type: "CURRENT_LOCATION",
          savedPlaceId: null,
          address: result.ok ? result.label : null,
          latitude,
          longitude,
          label: "Position actuelle",
        });
      },
      (error) => {
        setLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED ? "Autorisation de localisation refusée." :
          error.code === error.TIMEOUT ? "La localisation a pris trop de temps." :
          "Position actuelle indisponible.";
        notify.error(message);
      },
      { timeout: 10000 },
    );
  }

  const homePlaces = savedPlaces.filter((place) => place.type === "HOME");
  const otherPlaces = savedPlaces.filter((place) => place.type !== "HOME");

  return (
    <div>
      <label htmlFor={selectId} className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">{label}</label>
      <select
        id={selectId}
        value={selectValue}
        onChange={handleSelectChange}
        disabled={locating}
        className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark"
      >
        {cabinetAvailable ? <option value="CABINET">Cabinet</option> : null}
        {homePlaces.map((place) => <option key={place.id} value={place.id}>{place.label || "Domicile"}</option>)}
        {otherPlaces.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
        <option value={OPTION_CURRENT_LOCATION}>{locating ? "Localisation…" : "Ma position actuelle"}</option>
        {allowMirrorStart ? <option value="SAME_AS_START">Même adresse que le départ</option> : null}
        {allowLastAppointment ? <option value="LAST_APPOINTMENT">Dernier rendez-vous</option> : null}
        <option value={OPTION_CUSTOM}>Adresse personnalisée…</option>
      </select>

      {value.type === "CUSTOM" ? (
        <div className="mt-2">
          <AddressAutocomplete
            value={customQuery}
            onQueryChange={setCustomQuery}
            onSelect={(result) => onChange({ type: "CUSTOM", savedPlaceId: null, address: result.label, latitude: result.latitude, longitude: result.longitude, label: result.label })}
            placeholder="Rechercher une adresse"
            inputClassName="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-semibold text-animeo-dark"
          />
        </div>
      ) : null}

      {value.address && value.type !== "CUSTOM" ? <p className="mt-1.5 truncate text-xs font-semibold text-animeo-muted">{value.address}</p> : null}
    </div>
  );
}
