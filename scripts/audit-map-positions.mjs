#!/usr/bin/env node
/**
 * Audit des positions de la carte clients — lecture seule.
 *
 * Reproduit la règle actuelle de getMapClients (src/lib/tours.ts) : pour
 * chaque animal, le dernier rendez-vous à domicile géolocalisé, sinon les
 * coordonnées de la fiche client, sinon aucune position. Puis mesure, par
 * espace professionnel :
 *   1. la source de position (rendez-vous domicile / fiche client / aucune),
 *      par animal et par client ;
 *   2. les clients sans coordonnées et leur état de géocodage ;
 *   3. les coordonnées partagées par plusieurs clients distincts ;
 *   4. les écarts de plus de 2 km entre fiche client et rendez-vous ;
 *   5. quelques adresses réelles passées au géocodeur actuel (IGN), avec
 *      et sans autocomplétion, code postal, type et score.
 *
 * Ne modifie rien : toutes les lectures ont lieu dans une transaction
 * READ ONLY, annulée à la fin.
 *
 * Usage, depuis le dossier du projet :
 *   node scripts/audit-map-positions.mjs            base de développement
 *   node scripts/audit-map-positions.mjs --test     base de test
 *   node scripts/audit-map-positions.mjs --no-geocode   sans appel réseau
 */
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
import { parse } from "dotenv";

const useTest = process.argv.includes("--test");
const skipGeocode = process.argv.includes("--no-geocode");
const envFile = useTest ? ".env.test.local" : ".env.local";
if (!existsSync(envFile)) {
  console.error(`✖ ${envFile} introuvable. Lancez ce script depuis le dossier du projet.`);
  process.exit(1);
}
const url = parse(readFileSync(envFile)).DATABASE_URL;
const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const DIVERGENCE_KM = 2;

function haversineKm(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const pct = (part, total) => (total ? `${Math.round((part / total) * 100)} %` : "—");

async function ign(query, { autocomplete, postcode }) {
  const target = new URL(IGN_SEARCH_URL);
  target.searchParams.set("q", query);
  target.searchParams.set("index", "address");
  target.searchParams.set("limit", "1");
  target.searchParams.set("autocomplete", autocomplete ? "1" : "0");
  if (postcode) target.searchParams.set("postcode", postcode);
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const body = await response.json();
    const feature = body.features?.[0];
    if (!feature) return { error: "aucun résultat" };
    const [lng, lat] = feature.geometry.coordinates;
    return { type: feature.properties.type, score: Number(feature.properties.score?.toFixed?.(2) ?? feature.properties.score), label: feature.properties.label, lat, lng };
  } catch (error) {
    return { error: error.name === "TimeoutError" ? "délai dépassé" : error.message };
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("BEGIN READ ONLY");

try {
  const { rows: organizations } = await client.query(`SELECT id, name FROM "Organization" ORDER BY name`);
  console.log(`\nAudit des positions de la carte — base ${useTest ? "de test" : "de développement"}`);

  for (const organization of organizations) {
    const { rows: animals } = await client.query(
      `SELECT an.id, an.name AS animal, an."clientId",
              c."firstName" || ' ' || c."lastName" AS owner, c.city, c.address, c."postalCode",
              c.latitude AS c_lat, c.longitude AS c_lng, c."geocodedAt",
              ap.latitude AS a_lat, ap.longitude AS a_lng
         FROM "Animal" an
         JOIN "Client" c ON c.id = an."clientId"
         LEFT JOIN LATERAL (
           SELECT latitude, longitude FROM "Appointment" a
            WHERE a."animalId" = an.id AND a.mode = 'DOMICILE' AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
            ORDER BY a.date DESC LIMIT 1
         ) ap ON true
        WHERE an."organizationId" = $1`,
      [organization.id],
    );
    const { rows: clients } = await client.query(
      `SELECT c.id, c."firstName" || ' ' || c."lastName" AS owner, c.city, c.address, c."postalCode",
              c.latitude, c.longitude, c."geocodedAt",
              (SELECT count(*)::int FROM "Animal" an WHERE an."clientId" = c.id) AS animals
         FROM "Client" c WHERE c."organizationId" = $1`,
      [organization.id],
    );
    if (animals.length === 0 && clients.length === 0) continue;

    console.log(`\n══ ${organization.name} (${organization.id}) ══`);

    // 1. Source de position — par animal, puis par client.
    const bySource = { appointment: 0, client: 0, none: 0 };
    const effective = [];
    for (const row of animals) {
      const source = row.a_lat != null ? "appointment" : row.c_lat != null ? "client" : "none";
      bySource[source] += 1;
      const coordinates = source === "appointment" ? { lat: row.a_lat, lng: row.a_lng } : source === "client" ? { lat: row.c_lat, lng: row.c_lng } : null;
      effective.push({ ...row, source, coordinates });
    }
    const clientsWithoutAnimals = clients.filter((row) => row.animals === 0).length;
    const perClient = new Map();
    for (const row of effective) {
      const sources = perClient.get(row.clientId) ?? new Set();
      sources.add(row.source);
      perClient.set(row.clientId, sources);
    }
    const clientSource = { appointment: 0, client: 0, none: 0, mixed: 0 };
    for (const sources of perClient.values()) {
      if (sources.size > 1) clientSource.mixed += 1;
      else clientSource[[...sources][0]] += 1;
    }
    console.log(`\n1. Source de la position affichée`);
    console.log(`   Par animal (${animals.length}) : rendez-vous domicile ${bySource.appointment} (${pct(bySource.appointment, animals.length)}) · fiche client ${bySource.client} (${pct(bySource.client, animals.length)}) · aucune ${bySource.none} (${pct(bySource.none, animals.length)})`);
    console.log(`   Par client (${clients.length}) : rendez-vous ${clientSource.appointment} · fiche ${clientSource.client} · aucune ${clientSource.none} · sources mélangées entre ses animaux ${clientSource.mixed} · sans animal (absents de la carte) ${clientsWithoutAnimals}`);
    console.log(`   Compteur affiché aujourd'hui : « ${animals.length} clients » pour ${perClient.size} propriétaires et ${animals.length} animaux.`);

    // 2. Clients sans coordonnées.
    const noCoordinates = clients.filter((row) => row.latitude == null);
    const neverTried = noCoordinates.filter((row) => row.geocodedAt == null);
    const failed = noCoordinates.filter((row) => row.geocodedAt != null);
    const withoutAddress = noCoordinates.filter((row) => !row.address?.trim());
    console.log(`\n2. Fiches client sans coordonnées : ${noCoordinates.length} / ${clients.length}`);
    console.log(`   jamais géocodées ${neverTried.length} · géocodage tenté sans résultat ${failed.length} · sans adresse ${withoutAddress.length}`);

    // 3. Coordonnées partagées par plusieurs clients distincts (position affichée).
    const groups = new Map();
    for (const row of effective) {
      if (!row.coordinates) continue;
      const key = `${row.coordinates.lat.toFixed(5)},${row.coordinates.lng.toFixed(5)}`;
      const group = groups.get(key) ?? { owners: new Set(), animals: 0, cities: new Set() };
      group.owners.add(row.clientId);
      group.animals += 1;
      group.cities.add(row.city);
      groups.set(key, group);
    }
    const shared = [...groups.entries()].filter(([, group]) => group.owners.size > 1).sort((a, b) => b[1].owners.size - a[1].owners.size);
    const stacked = [...groups.values()].filter((group) => group.animals > 1).reduce((sum, group) => sum + group.animals, 0);
    console.log(`\n3. Coordonnées identiques`);
    console.log(`   ${groups.size} positions distinctes pour ${effective.filter((row) => row.coordinates).length} marqueurs · ${stacked} marqueurs empilés sur une position déjà occupée`);
    console.log(`   ${shared.length} positions partagées par plusieurs clients distincts${shared.length ? " :" : ""}`);
    for (const [key, group] of shared.slice(0, 8)) console.log(`     ${key} — ${group.owners.size} clients, ${group.animals} animaux (${[...group.cities].join(", ")})`);

    // 4. Écarts fiche client / rendez-vous.
    const divergences = effective
      .filter((row) => row.a_lat != null && row.c_lat != null)
      .map((row) => ({ row, km: haversineKm({ lat: row.c_lat, lng: row.c_lng }, { lat: row.a_lat, lng: row.a_lng }) }))
      .filter((item) => item.km > DIVERGENCE_KM)
      .sort((a, b) => b.km - a.km);
    const bothKnown = effective.filter((row) => row.a_lat != null && row.c_lat != null).length;
    console.log(`\n4. Écart de plus de ${DIVERGENCE_KM} km entre fiche client et dernier rendez-vous domicile : ${divergences.length} / ${bothKnown} animaux où les deux existent`);
    for (const { row, km } of divergences.slice(0, 8)) console.log(`     ${row.owner} · ${row.animal} (${row.city}) — ${km.toFixed(1)} km`);

    // 5. Géocodeur actuel sur quelques adresses réelles.
    if (!skipGeocode) {
      const samples = clients.filter((row) => row.address?.trim()).slice(0, 5);
      if (samples.length) console.log(`\n5. Géocodeur IGN sur ${samples.length} adresses de fiches (limit=1, index=address)`);
      for (const sample of samples) {
        const query = `${sample.address}, ${sample.city}`;
        const current = await ign(query, { autocomplete: true });
        const precise = await ign(sample.address, { autocomplete: false, postcode: sample.postalCode ?? undefined });
        const stored = sample.latitude != null ? { lat: sample.latitude, lng: sample.longitude } : null;
        console.log(`   « ${query} »${sample.postalCode ? ` [${sample.postalCode}]` : ""}`);
        console.log(`     actuel (autocomplétion, sans code postal) : ${current.error ?? `${current.type} · score ${current.score} · ${current.label}`}`);
        console.log(`     sans autocomplétion + code postal        : ${precise.error ?? `${precise.type} · score ${precise.score} · ${precise.label}`}`);
        if (stored && !current.error) console.log(`     écart position enregistrée / résultat actuel : ${haversineKm(stored, current).toFixed(2)} km`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  if (!skipGeocode) {
    console.log(`\n5 bis. Cas limites du géocodeur actuel (autocomplétion) comparés à une recherche précise`);
    const edgeCases = [
      { query: "12 rue de la République, Saint-Aubin", postcode: undefined, note: "homonyme : plusieurs Saint-Aubin en France" },
      { query: "12 rue de la République", postcode: "76410", note: "même adresse, code postal de Saint-Aubin-lès-Elbeuf" },
      { query: "Le Clos du Moulin, Yvetot", postcode: "76190", note: "lieu-dit sans numéro" },
      { query: "rue qui n'existe pas du tout, Yvetot", postcode: "76190", note: "rue inexistante" },
    ];
    for (const edge of edgeCases) {
      const current = await ign(edge.query, { autocomplete: true });
      const precise = await ign(edge.query, { autocomplete: false, postcode: edge.postcode });
      console.log(`   « ${edge.query} »${edge.postcode ? ` [${edge.postcode}]` : ""} — ${edge.note}`);
      console.log(`     actuel  : ${current.error ?? `${current.type} · score ${current.score} · ${current.label}`}`);
      console.log(`     précise : ${precise.error ?? `${precise.type} · score ${precise.score} · ${precise.label}`}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
console.log("\nAucune donnée modifiée (transaction en lecture seule, annulée).\n");
