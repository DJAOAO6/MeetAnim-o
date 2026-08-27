import { z } from "zod";

export const geocodedAddressSchema = z.object({
  id: z.string(),
  label: z.string(),
  houseNumber: z.string().optional(),
  street: z.string().optional(),
  postcode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
  citycode: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type GeocodedAddress = z.infer<typeof geocodedAddressSchema>;

export type AddressSearchResponse =
  | { results: GeocodedAddress[] }
  | { results: GeocodedAddress[]; error: "network" | "upstream" };
