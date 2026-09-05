// Studio de documents — schéma animalier (étape 4). Un seul schéma en
// Phase 1 : chien, profil gauche, silhouette simplifiée (illustration
// originale, tracée à la main pour ce fichier — pas d'asset tiers, donc
// aucune question de licence). Les autres espèces/vues sont hors périmètre.

export const DOG_DIAGRAM_VIEWBOX = { width: 420, height: 280 };

const DOG_DIAGRAM_BODY = `
  <ellipse cx="250" cy="264" rx="170" ry="10" fill="#183b45" opacity="0.08" />
  <path d="M360,150 C402,118 412,76 393,52 C386,66 376,96 352,132 Z" fill="#d8b98c" stroke="#5c4632" stroke-width="3" stroke-linejoin="round" />
  <rect x="298" y="168" width="27" height="86" rx="11" fill="#e7cba3" stroke="#5c4632" stroke-width="3" />
  <rect x="330" y="174" width="27" height="80" rx="11" fill="#dcb88d" stroke="#5c4632" stroke-width="3" />
  <rect x="174" y="174" width="25" height="86" rx="10" fill="#dcb88d" stroke="#5c4632" stroke-width="3" />
  <rect x="203" y="177" width="25" height="83" rx="10" fill="#e7cba3" stroke="#5c4632" stroke-width="3" />
  <ellipse cx="250" cy="165" rx="115" ry="55" fill="#e7cba3" stroke="#5c4632" stroke-width="3" />
  <ellipse cx="176" cy="138" rx="46" ry="50" fill="#e7cba3" stroke="#5c4632" stroke-width="3" />
  <ellipse cx="110" cy="100" rx="58" ry="52" fill="#e7cba3" stroke="#5c4632" stroke-width="3" />
  <ellipse cx="55" cy="120" rx="32" ry="22" fill="#efd9b6" stroke="#5c4632" stroke-width="3" />
  <path d="M120,58 C98,52 72,68 67,104 C83,120 106,109 119,88 Z" fill="#c9a679" stroke="#5c4632" stroke-width="3" stroke-linejoin="round" />
  <circle cx="100" cy="90" r="6" fill="#3a2a1f" />
  <ellipse cx="27" cy="117" rx="9" ry="7" fill="#3a2a1f" />
  <path d="M55,140 Q40,148 29,137" fill="none" stroke="#3a2a1f" stroke-width="3" stroke-linecap="round" />
`;

export function dogDiagramSvgMarkup(): string {
  const { width, height } = DOG_DIAGRAM_VIEWBOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${DOG_DIAGRAM_BODY}</svg>`;
}

export function dogDiagramDataUri(): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(dogDiagramSvgMarkup())}`;
}
