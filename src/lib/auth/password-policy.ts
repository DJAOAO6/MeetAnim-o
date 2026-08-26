import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule.")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule.")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre.")
  .regex(/[^a-zA-Z0-9]/, "Le mot de passe doit contenir au moins un caractère spécial.");
