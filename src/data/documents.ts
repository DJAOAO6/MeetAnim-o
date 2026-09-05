import type { DocumentContent } from "@/lib/documents/content";

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
};

export type StudioDocumentTemplateSummary = {
  id: string;
  name: string;
  species: string | null;
  thumbnail: string | null;
  isBuiltIn: boolean;
};
