import type { DocumentContent } from "@/lib/documents/content";
import type { DocumentVariableContext } from "@/lib/documents/variables";
import type { MarkerPreset } from "@/lib/documents/marker-presets";

export type StudioDocumentStatus = "Brouillon" | "Finalisé";

export type StudioDocumentSummary = {
  id: string;
  title: string;
  status: StudioDocumentStatus;
  clientName: string | null;
  animalName: string | null;
  updatedAt: string;
  thumbnail: string | null;
};

export type StudioDocumentDetail = StudioDocumentSummary & {
  clientId: string | null;
  animalId: string | null;
  appointmentId: string | null;
  templateId: string | null;
  content: DocumentContent;
  pdfBase64: string | null;
  variableContext: DocumentVariableContext;
  markerPresets: MarkerPreset[];
};

export type StudioDocumentTemplateSummary = {
  id: string;
  name: string;
  species: string | null;
  thumbnail: string | null;
  isBuiltIn: boolean;
};
