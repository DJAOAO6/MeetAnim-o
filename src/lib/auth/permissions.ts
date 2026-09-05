export type PermissionKey = "DELETE_CLIENTS" | "VIEW_FINANCES" | "MANAGE_PUBLIC_SETTINGS" | "MANAGE_DOCUMENTS";

export const permissionKeys: PermissionKey[] = ["DELETE_CLIENTS", "VIEW_FINANCES", "MANAGE_PUBLIC_SETTINGS", "MANAGE_DOCUMENTS"];

export const permissionLabels: Record<PermissionKey, string> = {
  DELETE_CLIENTS: "Supprimer des clients et animaux",
  VIEW_FINANCES: "Voir les statistiques financières",
  MANAGE_PUBLIC_SETTINGS: "Modifier les paramètres publics (profil, personnalisation)",
  MANAGE_DOCUMENTS: "Supprimer et finaliser des comptes rendus et modèles",
};

export type PermissionCheckable = { role: "ADMIN" | "PRACTITIONER" | "SECRETARY"; permissions: string[] } | null | undefined;

export function hasPermission(user: PermissionCheckable, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return user.permissions.includes(key);
}
