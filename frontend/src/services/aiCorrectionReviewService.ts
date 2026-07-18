/**
 * Cliente API del panel de revisión de correcciones.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 */
import api from "./api";

export interface CorrectionReviewItem {
  id: number;
  companyId: number;
  ticketId: number | null;
  contactId: number | null;
  aiAgentLogId: number | null;
  queueId: number | null;
  correctionType: string;
  wrongAiClaim: string | null;
  correctHumanClaim: string | null;
  entity: string | null;
  field: string | null;
  scope: Record<string, unknown>;
  classifierConfidence: number;
  classifierJson: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  ticket?: {
    id: number;
    status: string;
    contactId: number;
    queueId: number | null;
  };
  queue?: { id: number; name: string };
  contact?: { id: number; name: string; number: string };
}

export interface CorrectionReviewListResponse {
  records: CorrectionReviewItem[];
  count: number;
  hasMore: boolean;
  pageNumber: number;
}

export interface CorrectionReviewStats {
  days: number;
  reviewByStatus: Record<string, number>;
  learnedByOutcome: Record<string, number>;
}

export interface ListParams {
  status?: string;
  correctionType?: string;
  searchParam?: string;
  pageNumber?: number;
}

export const listReviews = (params: ListParams = {}) =>
  api.get<{ success: boolean; data: CorrectionReviewListResponse }>(
    "/ai/correction-review",
    { params }
  );

export const getReviewStats = (days = 30) =>
  api.get<{ success: boolean; data: CorrectionReviewStats }>(
    "/ai/correction-review/stats",
    { params: { days } }
  );

export const showReview = (id: number) =>
  api.get<{
    success: boolean;
    data: { review: CorrectionReviewItem; aiLog: Record<string, unknown> | null };
  }>(`/ai/correction-review/${id}`);

export const approveReview = (
  id: number,
  payload?: { overrideProblem?: string; overrideSolution?: string; reviewNotes?: string }
) =>
  api.post<{ success: boolean; data?: { supportCorrectionId: number }; message?: string }>(
    `/ai/correction-review/${id}/approve`,
    payload || {}
  );

export const rejectReview = (id: number, reviewNotes?: string) =>
  api.post<{ success: boolean; message?: string }>(
    `/ai/correction-review/${id}/reject`,
    { reviewNotes }
  );

export const bulkApprove = (ids: number[]) =>
  api.post<{
    success: boolean;
    data: Array<{ id: number; ok: boolean; reason?: string; supportCorrectionId?: number }>;
  }>("/ai/correction-review/bulk-approve", { ids });
