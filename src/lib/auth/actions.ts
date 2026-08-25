"use server";

import { redirect } from "next/navigation";
import { verifyCredentials } from "@/lib/auth/credentials";
import { createSession, deleteSession } from "@/lib/auth/session";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Merci de renseigner votre email et votre mot de passe." };
  }

  let valid: boolean;
  try {
    valid = await verifyCredentials(email, password);
  } catch {
    return { error: "La connexion n'est pas configurée. Contactez l'administrateur." };
  }

  if (!valid) {
    return { error: "Email ou mot de passe incorrect." };
  }

  await createSession(email);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
