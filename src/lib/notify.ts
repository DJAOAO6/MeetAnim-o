"use client";

import { toast } from "sonner";

/**
 * Enveloppe Sonner plutôt que de l'importer directement dans les
 * composants (PROMPT-NOTIFICATIONS.md §A3) : permet de changer de
 * librairie plus tard sans toucher aux appelants, et impose la bonne
 * convention de durée par type plutôt que de la laisser au choix de
 * chaque site d'appel.
 *
 * Durées : succès 4 s (fixé une fois pour toutes ici) ; erreur persistante
 * jusqu'à fermeture manuelle — une erreur ne doit pas disparaître avant
 * d'avoir été lue. Ceci s'écarte délibérément de la recommandation générale
 * du skill ui-ux-pro-max ("Toast Notifications" : auto-dismiss 3-5 s pour
 * tout toast) : ce document prime explicitement sur cette règle générique
 * pour les erreurs.
 */
const SUCCESS_DURATION_MS = 4000;

export const notify = {
  success(message: string) {
    return toast.success(message, { duration: SUCCESS_DURATION_MS });
  },
  error(message: string) {
    return toast.error(message, { duration: Number.POSITIVE_INFINITY });
  },
  /** Information contextuelle non liée à une réussite/échec d'action (ex. "vous êtes ici parce que…") — même durée que succès. */
  info(message: string) {
    return toast.info(message, { duration: SUCCESS_DURATION_MS });
  },
  promise<T>(
    promiseValue: Promise<T> | (() => Promise<T>),
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    },
  ) {
    return toast.promise(promiseValue, {
      loading: options.loading,
      success: (data: T) => ({
        message: typeof options.success === "function" ? options.success(data) : options.success,
        duration: SUCCESS_DURATION_MS,
      }),
      error: (error: unknown) => ({
        message: typeof options.error === "function" ? options.error(error) : options.error,
        duration: Number.POSITIVE_INFINITY,
      }),
    });
  },
};
