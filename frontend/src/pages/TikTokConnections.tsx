/**
 * Page: TikTokConnections
 * Gestión de conexiones TikTok para monitoreo de comentarios
 * Tabs: Conexiones (tabla) + Publicaciones (feed UGC)
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { CircularProgress } from "@mui/joy";
import {
  Trash,
  ArrowClockwise,
  ArrowSquareOut,
  MusicNotes,
  Info,
  WarningCircle,
  CheckCircle,
  XCircle,
  Buildings,
  VideoCamera,
  PlugsConnected,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import api from "../services/api";
import socketService from "../services/socket";
import { useAuth } from "../hooks/useAuth";
import TikTokPostsTab from "../components/TikTokPostsTab";

interface TikTokConnection {
  id: number;
  name: string;
  status: "CONNECTED" | "DISCONNECTED" | string;
  lastPollAt: string | null;
  pollingEnabled: boolean;
  pollingInterval?: number;
  tiktokBusinessConnected?: boolean;
  createdAt: string;
  updatedAt: string;
}

type TikTokConnectionPayload = Partial<TikTokConnection> & {
  tiktokLastPollAt?: string | null;
  tiktokPollingEnabled?: boolean | null;
  tiktokPollingInterval?: number | null;
};

const getAuthUrl = (payload: unknown): string | null => {
  const normalizeUrl = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  };

  if (typeof payload === "string") return normalizeUrl(payload);
  if (!payload || typeof payload !== "object") return null;

  const body = payload as {
    authUrl?: unknown;
    url?: unknown;
    data?: { authUrl?: unknown; url?: unknown };
  };

  const authUrl = body.data?.authUrl ?? body.data?.url ?? body.authUrl ?? body.url;
  return normalizeUrl(authUrl);
};

const normalizeConnection = (connection: TikTokConnectionPayload): TikTokConnection => ({
  ...(connection as TikTokConnection),
  lastPollAt: connection.lastPollAt ?? connection.tiktokLastPollAt ?? null,
  pollingEnabled: Boolean(connection.pollingEnabled ?? connection.tiktokPollingEnabled ?? true),
  pollingInterval: connection.pollingInterval ?? connection.tiktokPollingInterval ?? 120,
});

const POLLING_INTERVALS = [
  { value: 30, label: "30 seg" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
];

// Botón de acción de fila (mismo look que RowAction, con onClick/disabled y children variables).
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function TikTokConnections() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [connections, setConnections] = useState<TikTokConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [connectingBusinessId, setConnectingBusinessId] = useState<number | null>(null);
  const [pollingIds, setPollingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<number>(0);

  const errorParam = searchParams.get("error");
  const successParam = searchParams.get("success");

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (successParam === "true") {
      toast.success("Cuenta de TikTok conectada exitosamente");
      fetchConnections(); // Recargar lista tras OAuth exitoso
    }
  }, [successParam]);

  // Socket listener — actualización en tiempo real
  const handleTikTokSocket = useCallback((data: Record<string, unknown>) => {
    const typedData = data as { action?: string; tiktok?: TikTokConnectionPayload; tiktokId?: number };
    if (typedData.action === "update" && typedData.tiktok) {
      const updatedTikTok = normalizeConnection(typedData.tiktok);
      setConnections((prev) => {
        const exists = prev.find((c) => c.id === updatedTikTok.id);
        if (exists) {
          return prev.map((c) => (c.id === updatedTikTok.id ? { ...c, ...updatedTikTok } : c));
        }
        return [...prev, updatedTikTok];
      });
    } else if (typedData.action === "delete" && typedData.tiktokId) {
      setConnections((prev) => prev.filter((c) => c.id !== typedData.tiktokId));
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const eventName = `company-${companyId}-tiktok`;
    socketService.on(eventName, handleTikTokSocket);
    return () => {
      socketService.off(eventName, handleTikTokSocket);
    };
  }, [companyId, handleTikTokSocket]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const response = await api.get("/tiktok");
      const data = response.data;
      const list: TikTokConnectionPayload[] = Array.isArray(data)
        ? data
        : data.data ?? data.connections ?? [];
      setConnections(list.map(normalizeConnection));
    } catch (error) {
      toast.error("Error al cargar las conexiones de TikTok");
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnectingOAuth(true);
      const response = await api.get("/tiktok/oauth/url");
      const authUrl = getAuthUrl(response.data);
      if (!authUrl) {
        toast.error("No se pudo obtener la URL de autenticación de TikTok");
        return;
      }
      window.open(authUrl, "_blank", "width=600,height=700,noopener,noreferrer");
    } catch (error) {
      toast.error("Error al iniciar la conexión con TikTok");
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleConnectBusiness = async (connectionId: number) => {
    try {
      setConnectingBusinessId(connectionId);
      const response = await api.get("/tiktok/business/oauth/url");
      const authUrl = getAuthUrl(response.data);
      if (!authUrl) {
        toast.error("No se pudo obtener la URL de Business API");
        return;
      }
      // Abrir popup OAuth — al volver, el callback guardará los tokens
      const popup = window.open(authUrl, "_blank", "width=600,height=700,noopener,noreferrer");

      // Escuchar mensaje del popup para conectar automáticamente
      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === "tiktok-business-callback" && event.data?.code) {
          window.removeEventListener("message", handleMessage);
          try {
            await api.post(`/tiktok/${connectionId}/business/connect`, {
              code: event.data.code,
            });
            toast.success("Business API conectada exitosamente");
            fetchConnections();
          } catch (err) {
            toast.error("Error al conectar Business API");
          }
        }
      };
      window.addEventListener("message", handleMessage);

      // Timeout para limpiar listener si no vuelve
      setTimeout(() => {
        window.removeEventListener("message", handleMessage);
      }, 300000); // 5 minutos
    } catch (error) {
      toast.error("Error al iniciar la conexión Business API");
    } finally {
      setConnectingBusinessId(null);
    }
  };

  const handleTogglePolling = async (connection: TikTokConnection) => {
    try {
      setPollingIds((prev) => new Set(prev).add(connection.id));
      await api.put(`/tiktok/${connection.id}`, {
        tiktokPollingEnabled: !connection.pollingEnabled,
      });
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connection.id
            ? { ...c, pollingEnabled: !c.pollingEnabled }
            : c
        )
      );
      toast.success(
        !connection.pollingEnabled
          ? "Polling activado correctamente"
          : "Polling desactivado correctamente"
      );
    } catch (error) {
      toast.error("Error al cambiar el estado del polling");
    } finally {
      setPollingIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.id);
        return next;
      });
    }
  };

  const handleChangeInterval = async (connectionId: number, interval: number) => {
    try {
      await api.put(`/tiktok/${connectionId}`, {
        tiktokPollingInterval: interval,
      });
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId ? { ...c, pollingInterval: interval } : c
        )
      );
      toast.success(`Intervalo de polling actualizado a ${POLLING_INTERVALS.find(i => i.value === interval)?.label ?? interval + "s"}`);
    } catch (error) {
      toast.error("Error al cambiar el intervalo de polling");
    }
  };

  const handlePollNow = async (connectionId: number) => {
    try {
      setPollingIds((prev) => new Set(prev).add(connectionId));
      await api.post(`/tiktok/${connectionId}/poll`);
      toast.success("Poll ejecutado. Los comentarios nuevos se procesaran en instantes.");
      fetchConnections();
    } catch (error) {
      toast.error("Error al ejecutar el poll manual");
    } finally {
      setPollingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const handleDelete = async (connectionId: number) => {
    if (!confirm("¿Estas seguro de eliminar esta conexion de TikTok? Esta accion no se puede deshacer.")) {
      return;
    }
    try {
      setDeletingIds((prev) => new Set(prev).add(connectionId));
      await api.delete(`/tiktok/${connectionId}`);
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      toast.success("Conexion eliminada correctamente");
    } catch (error) {
      toast.error("Error al eliminar la conexion");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "Nunca";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Nunca";
    return date.toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasBusinessConnection = connections.some((c) => c.tiktokBusinessConnected);
  const connectedCount = connections.filter((c) => c.status === "CONNECTED").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <MusicNotes className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                TikTok Comments
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitorea y gestiona comentarios de tus videos de TikTok
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Recargar lista"
              className="text-muted-foreground"
              onClick={fetchConnections}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={handleConnect} loading={connectingOAuth}>
              {!connectingOAuth && <ArrowSquareOut className="size-4" aria-hidden />}
              {connectingOAuth ? "Abriendo..." : "Conectar con TikTok"}
            </Button>
          </div>
        </div>

        {/* Alerta de error en URL params */}
        {errorParam && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/12 p-4 text-destructive-text">
            <WarningCircle className="mt-0.5 size-5 shrink-0" weight="fill" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Error al conectar con TikTok</p>
              <p className="mt-0.5 text-xs">{decodeURIComponent(errorParam)}</p>
            </div>
          </div>
        )}

        {/* Alerta condicional según estado Business API */}
        {connections.length > 0 && !hasBusinessConnection && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/16 p-4 text-warning-text">
            <Info className="mt-0.5 size-5 shrink-0" weight="fill" aria-hidden />
            <div>
              <p className="text-sm font-semibold">
                Conecta la Business API para responder comentarios
              </p>
              <p className="mt-0.5 text-xs">
                Sin Business API solo puedes leer comentarios. Conecta Business API en una
                conexion para habilitar respuestas manuales y auto-reply con IA.
              </p>
            </div>
          </div>
        )}

        {hasBusinessConnection && (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/14 p-4 text-success-text">
            <CheckCircle className="mt-0.5 size-5 shrink-0" weight="fill" aria-hidden />
            <p className="text-sm">
              Business API conectada — Puedes responder comentarios directamente y usar auto-reply con IA.
              Ve a la pestaña <strong>Publicaciones</strong> para ver y responder comentarios.
            </p>
          </div>
        )}

        {/* Tabs: Conexiones + Publicaciones */}
        <Tabs value={String(activeTab)} onValueChange={(value) => setActiveTab(Number(value))}>
          <TabsList>
            <TabsTrigger value="0">
              <PlugsConnected className="size-[18px]" aria-hidden />
              Conexiones
              {connectedCount > 0 && (
                <Badge variant="success" className="ml-1">
                  {connectedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="1">
              <VideoCamera className="size-[18px]" aria-hidden />
              Publicaciones
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════ */}
          {/* TAB 0: Conexiones */}
          {/* ═══════════════════════════════════════════════ */}
          <TabsContent value="0">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Cuentas conectadas</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business API</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intervalo</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultimo Poll</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Polling</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <CircularProgress size="md" />
                            <span className="text-sm">Cargando conexiones...</span>
                          </div>
                        </td>
                      </tr>
                    ) : connections.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <MusicNotes className="size-10 text-muted-foreground/40" aria-hidden />
                            <p className="text-sm font-semibold text-foreground">
                              Sin conexiones de TikTok
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Haz click en "Conectar con TikTok" para agregar tu primera cuenta
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      connections.map((connection) => (
                        <tr key={connection.id} className="transition-colors hover:bg-accent/40">
                          {/* Nombre */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <MusicNotes className="size-4" aria-hidden />
                              </span>
                              <span className="whitespace-nowrap font-medium text-foreground">
                                {connection.name}
                              </span>
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <Badge variant={connection.status === "CONNECTED" ? "success" : "destructive"}>
                              {connection.status === "CONNECTED" ? (
                                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                              ) : (
                                <XCircle className="size-3.5" weight="fill" aria-hidden />
                              )}
                              {connection.status === "CONNECTED" ? "Conectado" : "Desconectado"}
                            </Badge>
                          </td>

                          {/* Business API */}
                          <td className="px-4 py-3">
                            {connection.tiktokBusinessConnected ? (
                              <Badge variant="success">
                                <Buildings className="size-3.5" weight="fill" aria-hidden />
                                Activa
                              </Badge>
                            ) : (
                              <Badge variant="neutral">No conectada</Badge>
                            )}
                          </td>

                          {/* Intervalo */}
                          <td className="px-4 py-3">
                            <Select
                              value={String(connection.pollingInterval ?? 120)}
                              onValueChange={(value) =>
                                handleChangeInterval(connection.id, Number(value))
                              }
                            >
                              <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Intervalo de polling">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {POLLING_INTERVALS.map((opt) => (
                                  <SelectItem key={opt.value} value={String(opt.value)}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Ultimo Poll */}
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(connection.lastPollAt)}
                          </td>

                          {/* Polling toggle */}
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={connection.pollingEnabled}
                              aria-label={connection.pollingEnabled ? "Desactivar polling" : "Activar polling"}
                              disabled={pollingIds.has(connection.id)}
                              onClick={() => handleTogglePolling(connection)}
                              className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55",
                                connection.pollingEnabled ? "bg-success" : "bg-input",
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                                  connection.pollingEnabled ? "translate-x-[22px]" : "translate-x-0.5",
                                )}
                                aria-hidden
                              />
                            </button>
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {/* Conectar Business API */}
                              {!connection.tiktokBusinessConnected && connection.status === "CONNECTED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 px-2.5 text-xs"
                                  onClick={() => handleConnectBusiness(connection.id)}
                                  loading={connectingBusinessId === connection.id}
                                >
                                  {connectingBusinessId !== connection.id && (
                                    <Buildings className="size-4" aria-hidden />
                                  )}
                                  Business
                                </Button>
                              )}
                              <ActionBtn
                                label="Poll ahora"
                                onClick={() => handlePollNow(connection.id)}
                                disabled={pollingIds.has(connection.id)}
                                className="text-primary hover:bg-primary/10 hover:text-primary"
                              >
                                {pollingIds.has(connection.id) ? (
                                  <CircularProgress size="sm" />
                                ) : (
                                  <ArrowClockwise className="size-[18px]" aria-hidden />
                                )}
                              </ActionBtn>
                              <ActionBtn
                                label="Eliminar conexion"
                                onClick={() => handleDelete(connection.id)}
                                disabled={deletingIds.has(connection.id)}
                                className="hover:bg-destructive/10 hover:text-destructive-text"
                              >
                                {deletingIds.has(connection.id) ? (
                                  <CircularProgress size="sm" />
                                ) : (
                                  <Trash className="size-[18px]" aria-hidden />
                                )}
                              </ActionBtn>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════ */}
          {/* TAB 1: Publicaciones */}
          {/* ═══════════════════════════════════════════════ */}
          <TabsContent value="1">
            <TikTokPostsTab connections={connections} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
