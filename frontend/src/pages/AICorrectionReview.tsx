/**
 * Pagina: AICorrectionReview
 * Panel humano de revision de correcciones detectadas a la IA.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * UI side-by-side:
 *   - Respuesta INCORRECTA del bot (wrongAiClaim)
 *   - Respuesta CORRECTA del humano (correctHumanClaim)
 *   - Tipo, scope, confidence del clasificador
 *   - Botones Aprobar / Rechazar
 *
 * Estados: Loading, Error, Empty, Data.
 *
 * [Fase2·G] Migrada de MUI Joy al design system Tailwind v4 + shadcn/Radix.
 * Se conserva CircularProgress (MUI) por indicación del design system.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { CircularProgress } from "@mui/joy";
import {
  CheckCircle, XCircle, Warning, MagnifyingGlass, ArrowClockwise,
  ShieldCheck, FileText, User, Tag, Clock
} from "@phosphor-icons/react";
import { toast } from "react-toastify";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  listReviews, getReviewStats, showReview,
  approveReview, rejectReview,
  CorrectionReviewItem, CorrectionReviewStats
} from "../services/aiCorrectionReviewService";

const CORRECTION_TYPE_LABELS: Record<string, string> = {
  factual_contradiction: "Contradicción factual",
  price_correction: "Corrección de precio",
  policy_correction: "Corrección de política",
  appointment_override: "Override de cita",
  status_override: "Override de estado",
  payment_override: "Override de pago",
  contract_override: "Override de contrato",
  availability_override: "Override de disponibilidad",
  human_clarification: "Aclaración humana",
  sales_strategy_override: "Estrategia de venta"
};

const CRITICAL_TYPES = new Set([
  "price_correction",
  "payment_override",
  "appointment_override",
  "status_override",
  "contract_override",
  "availability_override"
]);

// Mapea el estado a la variante de <Badge> del design system.
const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  expired: "neutral"
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Expirada"
};

// Sentinela para "todos" — Radix Select no admite value="" en items,
// pero el estado interno (statusFilter/typeFilter) sigue usando "".
const ALL = "__all__";

const textareaBase =
  "w-full rounded-md bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors resize-y placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30";

export default function AICorrectionReview() {
  const [items, setItems] = useState<CorrectionReviewItem[]>([]);
  const [stats, setStats] = useState<CorrectionReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(0);

  // Detail modal
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailReview, setDetailReview] = useState<CorrectionReviewItem | null>(null);
  const [detailLog, setDetailLog] = useState<Record<string, unknown> | null>(null);
  const [overrideProblem, setOverrideProblem] = useState("");
  const [overrideSolution, setOverrideSolution] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionInProgress, setActionInProgress] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await listReviews({
        status: statusFilter || undefined,
        correctionType: typeFilter || undefined,
        searchParam: search || undefined,
        pageNumber
      });
      if (!data?.success) {
        setError("Respuesta inesperada del servidor");
        return;
      }
      setItems(data.data.records);
      setCount(data.data.count);
      setHasMore(data.data.hasMore);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search, pageNumber]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await getReviewStats(30);
      if (data?.success) setStats(data.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const openDetail = async (item: CorrectionReviewItem) => {
    setSelectedId(item.id);
    setOverrideProblem(item.wrongAiClaim || "");
    setOverrideSolution(item.correctHumanClaim || "");
    setReviewNotes("");
    try {
      const { data } = await showReview(item.id);
      if (data?.success) {
        setDetailReview(data.data.review);
        setDetailLog(data.data.aiLog);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error cargando detalle: ${msg}`);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetailReview(null);
    setDetailLog(null);
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    setActionInProgress(true);
    try {
      const { data } = await approveReview(selectedId, {
        overrideProblem: overrideProblem !== detailReview?.wrongAiClaim ? overrideProblem : undefined,
        overrideSolution: overrideSolution !== detailReview?.correctHumanClaim ? overrideSolution : undefined,
        reviewNotes: reviewNotes || undefined
      });
      if (data?.success) {
        toast.success(`Corrección aprobada (id=${data.data?.supportCorrectionId})`);
        closeDetail();
        loadList();
        loadStats();
      } else {
        toast.error(data?.message || "No se pudo aprobar");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${msg}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    setActionInProgress(true);
    try {
      const { data } = await rejectReview(selectedId, reviewNotes || undefined);
      if (data?.success) {
        toast.success("Corrección rechazada");
        closeDetail();
        loadList();
        loadStats();
      } else {
        toast.error(data?.message || "No se pudo rechazar");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${msg}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const pendingCount = stats?.reviewByStatus?.pending || 0;
  const approvedCount = stats?.reviewByStatus?.approved || 0;
  const rejectedCount = stats?.reviewByStatus?.rejected || 0;
  const autoAppliedCount = stats?.learnedByOutcome?.auto_applied || 0;
  const notCorrectionCount = stats?.learnedByOutcome?.skipped_not_correction || 0;

  const isCritical = useMemo(() => {
    return detailReview ? CRITICAL_TYPES.has(detailReview.correctionType) : false;
  }, [detailReview]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ShieldCheck className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Revisión de Correcciones IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Aprueba las correcciones humanas críticas para que la IA aprenda sin repetir errores.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={() => { loadList(); loadStats(); }}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Pendientes" value={String(pendingCount)} tone="warning" />
          <StatTile label="Aprobadas (30d)" value={String(approvedCount)} tone="success" />
          <StatTile label="Rechazadas (30d)" value={String(rejectedCount)} tone="destructive" />
          <StatTile label="Auto-aprendidas (30d)" value={String(autoAppliedCount)} tone="primary" />
          <StatTile label="No fueron corrección" value={String(notCorrectionCount)} tone="neutral" />
        </div>

        {/* Filtros */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <Select
                value={statusFilter || ALL}
                onValueChange={(v) => { setStatusFilter(v === ALL ? "" : v); setPageNumber(1); }}
              >
                <SelectTrigger aria-label="Filtrar por estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="approved">Aprobadas</SelectItem>
                  <SelectItem value="rejected">Rechazadas</SelectItem>
                  <SelectItem value="expired">Expiradas</SelectItem>
                  <SelectItem value={ALL}>Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4">
              <Select
                value={typeFilter || ALL}
                onValueChange={(v) => { setTypeFilter(v === ALL ? "" : v); setPageNumber(1); }}
              >
                <SelectTrigger aria-label="Filtrar por tipo">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los tipos</SelectItem>
                  {Object.entries(CORRECTION_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-5">
              <Input
                leftIcon={<MagnifyingGlass aria-hidden />}
                placeholder="Buscar por claim, entidad..."
                aria-label="Buscar correcciones"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { setPageNumber(1); loadList(); } }}
              />
            </div>
          </div>
        </div>

        {/* Estados */}
        {loading && (
          <div className="flex justify-center p-8">
            <CircularProgress />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-text">
            <Warning className="size-[18px] shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No hay correcciones {statusFilter === "pending" ? "pendientes" : "que mostrar"} ahora mismo.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Las correcciones críticas (precio, pago, cita, contrato, estado, disponibilidad) y las de baja confianza aparecerán aquí cuando un humano corrija al bot.
            </p>
          </div>
        )}

        {/* Lista */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map(item => {
              const critical = CRITICAL_TYPES.has(item.correctionType);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(item)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(item); } }}
                  className={`cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02] transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${critical ? "border-l-4 border-l-warning" : ""}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {STATUS_LABEL[item.status]}
                      </Badge>
                      <Badge variant={critical ? "warning" : "primary"}>
                        <Tag className="size-3" aria-hidden />
                        {CORRECTION_TYPE_LABELS[item.correctionType] || item.correctionType}
                      </Badge>
                      {item.entity && (
                        <Badge variant="outline">{item.entity}</Badge>
                      )}
                      <Badge variant="outline">
                        <Clock className="size-3" aria-hidden />
                        conf {Number(item.classifierConfidence).toFixed(2)}
                      </Badge>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      #{item.id} • {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-destructive-text">Respuesta INCORRECTA del bot</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {item.wrongAiClaim || <em className="text-muted-foreground">(no se identificó claim específico)</em>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-success-text">Respuesta CORRECTA del humano</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {item.correctHumanClaim || <em className="text-muted-foreground">(sin contenido)</em>}
                      </p>
                    </div>
                  </div>

                  {(item.queue || item.contact) && (
                    <>
                      <div className="my-3 border-t border-border" />
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        {item.queue && (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="size-3" aria-hidden />
                            Cola: {item.queue.name}
                          </span>
                        )}
                        {item.contact && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3" aria-hidden />
                            {item.contact.name} ({item.contact.number})
                          </span>
                        )}
                        {item.ticketId && (
                          <span>Ticket #{item.ticketId}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Paginación simple */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {pageNumber} • {count} resultados
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPageNumber(p => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      <Dialog open={selectedId !== null} onOpenChange={(o) => { if (!o) closeDetail(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Revisar corrección #{selectedId}
              {isCritical && (
                <Badge variant="warning">CRÍTICA</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {!detailReview && (
            <div className="flex justify-center p-6">
              <CircularProgress />
            </div>
          )}

          {detailReview && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <p className="text-sm text-foreground">
                  {CORRECTION_TYPE_LABELS[detailReview.correctionType] || detailReview.correctionType}
                </p>
              </div>

              {(detailLog as any)?.outputSummary && (
                <div>
                  <p className="text-xs font-medium text-destructive-text">
                    Respuesta original del bot (AIAgentLog)
                  </p>
                  <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-foreground">
                    {String((detailLog as any).outputSummary)}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="override-problem">Claim INCORRECTO identificado</Label>
                <textarea
                  id="override-problem"
                  value={overrideProblem}
                  onChange={e => setOverrideProblem(e.target.value)}
                  rows={3}
                  className={`${textareaBase} border border-destructive/40 hover:border-destructive/60 focus-visible:border-destructive`}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="override-solution">Claim CORRECTO según el humano</Label>
                <textarea
                  id="override-solution"
                  value={overrideSolution}
                  onChange={e => setOverrideSolution(e.target.value)}
                  rows={4}
                  className={`${textareaBase} border border-success/50 hover:border-success/70 focus-visible:border-success`}
                />
              </div>

              {detailReview.scope && Object.keys(detailReview.scope).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Alcance (scope)</p>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                    {JSON.stringify(detailReview.scope, null, 2)}
                  </pre>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="review-notes">Notas de revisión (opcional)</Label>
                <textarea
                  id="review-notes"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  rows={3}
                  placeholder="Por qué apruebas o rechazas..."
                  className={`${textareaBase} border border-input hover:border-muted-foreground/40 focus-visible:border-ring`}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeDetail} disabled={actionInProgress}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 bg-destructive/10 text-destructive-text hover:bg-destructive/16 hover:text-destructive-text hover:border-destructive/40"
              onClick={handleReject}
              disabled={actionInProgress || detailReview?.status !== "pending"}
            >
              <XCircle className="size-4" aria-hidden />
              Rechazar
            </Button>
            <Button
              className="bg-success text-white hover:brightness-95"
              onClick={handleApprove}
              disabled={actionInProgress || detailReview?.status !== "pending"}
            >
              <CheckCircle className="size-4" aria-hidden />
              Aprobar y aprender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
