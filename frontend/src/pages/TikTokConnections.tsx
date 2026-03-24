/**
 * Page: TikTokConnections
 * Gestión de conexiones TikTok para monitoreo de comentarios
 * Tabs: Conexiones (tabla) + Publicaciones (feed UGC)
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../services/api";
import socketService from "../services/socket";
import { useAuth } from "../hooks/useAuth";
import TikTokPostsTab from "../components/TikTokPostsTab";
import {
  Box,
  Typography,
  Button,
  Card,
  Table,
  Sheet,
  Chip,
  Switch,
  IconButton,
  Alert,
  Stack,
  CircularProgress,
  Container,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Select,
  Option,
} from "@mui/joy";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenInNewIcon,
  MusicNote as MusicNoteIcon,
  Info as InfoIcon,
  ErrorOutline as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Business as BusinessIcon,
  Videocam as VideocamIcon,
  Cable as CableIcon,
} from "@mui/icons-material";

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

const POLLING_INTERVALS = [
  { value: 30, label: "30 seg" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
];

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
    const typedData = data as { action?: string; tiktok?: TikTokConnection; tiktokId?: number };
    if (typedData.action === "update" && typedData.tiktok) {
      setConnections((prev) => {
        const exists = prev.find((c) => c.id === typedData.tiktok!.id);
        if (exists) {
          return prev.map((c) => (c.id === typedData.tiktok!.id ? { ...c, ...typedData.tiktok! } : c));
        }
        return [...prev, typedData.tiktok!];
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
      const list: TikTokConnection[] = Array.isArray(data)
        ? data
        : data.data ?? data.connections ?? [];
      setConnections(list);
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
      const authUrl: string = response.data?.authUrl ?? response.data?.url ?? response.data;
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
      const authUrl: string = response.data?.authUrl ?? response.data?.url ?? response.data;
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
        pollingEnabled: !connection.pollingEnabled,
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
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "12px",
                bgcolor: "#00000010",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MusicNoteIcon sx={{ fontSize: 26, color: "#000000" }} />
            </Box>
            <Box>
              <Typography level="h2">TikTok Comments</Typography>
              <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                Monitorea y gestiona comentarios de tus videos de TikTok
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <IconButton
              variant="soft"
              color="neutral"
              size="lg"
              onClick={fetchConnections}
              disabled={loading}
              sx={{ borderRadius: "lg" }}
              title="Recargar lista"
            >
              <RefreshIcon />
            </IconButton>
            <Button
              variant="solid"
              color="neutral"
              size="lg"
              startDecorator={
                connectingOAuth ? (
                  <CircularProgress size="sm" sx={{ color: "#fff" }} />
                ) : (
                  <OpenInNewIcon />
                )
              }
              onClick={handleConnect}
              disabled={connectingOAuth}
              sx={{
                px: 3,
                fontWeight: 600,
                borderRadius: "lg",
                bgcolor: "#000000",
                color: "#ffffff",
                "&:hover": { bgcolor: "#333333" },
                "&:active": { bgcolor: "#222222" },
              }}
            >
              {connectingOAuth ? "Abriendo..." : "Conectar con TikTok"}
            </Button>
          </Stack>
        </Stack>

        {/* Alerta de error en URL params */}
        {errorParam && (
          <Alert
            variant="soft"
            color="danger"
            startDecorator={<ErrorIcon />}
            sx={{ borderRadius: "lg" }}
          >
            <Box>
              <Typography level="body-sm" fontWeight={600}>
                Error al conectar con TikTok
              </Typography>
              <Typography level="body-xs" sx={{ mt: 0.25 }}>
                {decodeURIComponent(errorParam)}
              </Typography>
            </Box>
          </Alert>
        )}

        {/* Alerta condicional según estado Business API */}
        {connections.length > 0 && !hasBusinessConnection && (
          <Alert
            variant="soft"
            color="warning"
            startDecorator={<InfoIcon />}
            sx={{ borderRadius: "lg" }}
          >
            <Box>
              <Typography level="body-sm" fontWeight={600}>
                Conecta la Business API para responder comentarios
              </Typography>
              <Typography level="body-xs" sx={{ mt: 0.25 }}>
                Sin Business API solo puedes leer comentarios. Conecta Business API en una
                conexion para habilitar respuestas manuales y auto-reply con IA.
              </Typography>
            </Box>
          </Alert>
        )}

        {hasBusinessConnection && (
          <Alert
            variant="soft"
            color="success"
            startDecorator={<CheckCircleIcon />}
            sx={{ borderRadius: "lg" }}
          >
            <Typography level="body-sm">
              Business API conectada — Puedes responder comentarios directamente y usar auto-reply con IA.
              Ve a la pestaña <strong>Publicaciones</strong> para ver y responder comentarios.
            </Typography>
          </Alert>
        )}

        {/* Tabs: Conexiones + Publicaciones */}
        <Tabs
          value={activeTab}
          onChange={(_event, newValue) => setActiveTab(newValue as number)}
          sx={{ borderRadius: "lg" }}
        >
          <TabList
            variant="soft"
            color="neutral"
            disableUnderline
            sx={{
              p: 0.5,
              gap: 0.5,
              borderRadius: "xl",
              bgcolor: "background.level1",
              "& .MuiTab-root": {
                borderRadius: "lg",
                fontWeight: 600,
                fontSize: "0.85rem",
              },
              "& .MuiTab-root[aria-selected='true']": {
                bgcolor: "background.surface",
                boxShadow: "sm",
              },
            }}
          >
            <Tab
              disableIndicator
              value={0}
              sx={{ gap: 1 }}
            >
              <CableIcon sx={{ fontSize: 18 }} />
              Conexiones
              {connectedCount > 0 && (
                <Chip size="sm" variant="solid" color="success" sx={{ ml: 0.5 }}>
                  {connectedCount}
                </Chip>
              )}
            </Tab>
            <Tab
              disableIndicator
              value={1}
              sx={{ gap: 1 }}
            >
              <VideocamIcon sx={{ fontSize: 18 }} />
              Publicaciones
            </Tab>
          </TabList>

          {/* ═══════════════════════════════════════════════ */}
          {/* TAB 0: Conexiones */}
          {/* ═══════════════════════════════════════════════ */}
          <TabPanel value={0} sx={{ p: 0, pt: 2 }}>
            <Card variant="outlined" sx={{ p: 0, overflow: "hidden" }}>
              <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography level="title-sm" fontWeight={700}>
                  Cuentas conectadas
                </Typography>
              </Box>
              <Sheet sx={{ overflow: "auto" }}>
                <Table stickyHeader>
                  <thead>
                    <tr>
                      <th style={{ width: 180, paddingLeft: 16 }}>Nombre</th>
                      <th style={{ width: 120 }}>Estado</th>
                      <th style={{ width: 120 }}>Business API</th>
                      <th style={{ width: 130 }}>Intervalo</th>
                      <th style={{ width: 170 }}>Ultimo Poll</th>
                      <th style={{ width: 100 }}>Polling</th>
                      <th style={{ width: 180 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "3rem" }}>
                          <Stack alignItems="center" spacing={1.5}>
                            <CircularProgress size="md" />
                            <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                              Cargando conexiones...
                            </Typography>
                          </Stack>
                        </td>
                      </tr>
                    ) : connections.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "3rem" }}>
                          <Stack alignItems="center" spacing={1.5}>
                            <MusicNoteIcon sx={{ fontSize: 40, color: "text.tertiary", opacity: 0.4 }} />
                            <Box>
                              <Typography level="body-md" fontWeight={600}>
                                Sin conexiones de TikTok
                              </Typography>
                              <Typography level="body-sm" sx={{ color: "text.tertiary", mt: 0.5 }}>
                                Haz click en "Conectar con TikTok" para agregar tu primera cuenta
                              </Typography>
                            </Box>
                          </Stack>
                        </td>
                      </tr>
                    ) : (
                      connections.map((connection) => (
                        <tr key={connection.id}>
                          {/* Nombre */}
                          <td style={{ paddingLeft: 16 }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <Box
                                sx={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "8px",
                                  bgcolor: "#00000008",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <MusicNoteIcon sx={{ fontSize: 16, color: "#000000" }} />
                              </Box>
                              <Typography level="body-sm" fontWeight={600} noWrap>
                                {connection.name}
                              </Typography>
                            </Stack>
                          </td>

                          {/* Estado */}
                          <td>
                            <Chip
                              size="sm"
                              variant="soft"
                              color={connection.status === "CONNECTED" ? "success" : "danger"}
                              startDecorator={
                                connection.status === "CONNECTED" ? (
                                  <CheckCircleIcon sx={{ fontSize: 13 }} />
                                ) : (
                                  <CancelIcon sx={{ fontSize: 13 }} />
                                )
                              }
                            >
                              {connection.status === "CONNECTED" ? "Conectado" : "Desconectado"}
                            </Chip>
                          </td>

                          {/* Business API */}
                          <td>
                            {connection.tiktokBusinessConnected ? (
                              <Chip
                                size="sm"
                                variant="soft"
                                color="success"
                                startDecorator={<BusinessIcon sx={{ fontSize: 13 }} />}
                              >
                                Activa
                              </Chip>
                            ) : (
                              <Chip
                                size="sm"
                                variant="soft"
                                color="neutral"
                              >
                                No conectada
                              </Chip>
                            )}
                          </td>

                          {/* Intervalo */}
                          <td>
                            <Select
                              size="sm"
                              variant="soft"
                              value={connection.pollingInterval ?? 120}
                              onChange={(_event, newValue) => {
                                if (newValue !== null) {
                                  handleChangeInterval(connection.id, newValue as number);
                                }
                              }}
                              sx={{
                                minWidth: 100,
                                fontSize: "0.75rem",
                              }}
                            >
                              {POLLING_INTERVALS.map((opt) => (
                                <Option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </Option>
                              ))}
                            </Select>
                          </td>

                          {/* Ultimo Poll */}
                          <td>
                            <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                              {formatDate(connection.lastPollAt)}
                            </Typography>
                          </td>

                          {/* Polling toggle */}
                          <td>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Switch
                                checked={connection.pollingEnabled}
                                disabled={pollingIds.has(connection.id)}
                                onChange={() => handleTogglePolling(connection)}
                                color={connection.pollingEnabled ? "success" : "neutral"}
                                size="sm"
                              />
                            </Stack>
                          </td>

                          {/* Acciones */}
                          <td>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              {/* Conectar Business API */}
                              {!connection.tiktokBusinessConnected && connection.status === "CONNECTED" && (
                                <Button
                                  size="sm"
                                  variant="soft"
                                  color="primary"
                                  onClick={() => handleConnectBusiness(connection.id)}
                                  disabled={connectingBusinessId === connection.id}
                                  startDecorator={
                                    connectingBusinessId === connection.id ? (
                                      <CircularProgress size="sm" />
                                    ) : (
                                      <BusinessIcon sx={{ fontSize: 16 }} />
                                    )
                                  }
                                  sx={{ fontSize: "0.7rem", py: 0.5 }}
                                >
                                  Business
                                </Button>
                              )}
                              <IconButton
                                size="sm"
                                variant="soft"
                                color="primary"
                                onClick={() => handlePollNow(connection.id)}
                                disabled={pollingIds.has(connection.id)}
                                title="Poll Ahora"
                              >
                                {pollingIds.has(connection.id) ? (
                                  <CircularProgress size="sm" />
                                ) : (
                                  <RefreshIcon />
                                )}
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="soft"
                                color="danger"
                                onClick={() => handleDelete(connection.id)}
                                disabled={deletingIds.has(connection.id)}
                                title="Eliminar conexion"
                              >
                                {deletingIds.has(connection.id) ? (
                                  <CircularProgress size="sm" />
                                ) : (
                                  <DeleteIcon />
                                )}
                              </IconButton>
                            </Stack>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Sheet>
            </Card>
          </TabPanel>

          {/* ═══════════════════════════════════════════════ */}
          {/* TAB 1: Publicaciones */}
          {/* ═══════════════════════════════════════════════ */}
          <TabPanel value={1} sx={{ p: 0, pt: 2 }}>
            <TikTokPostsTab connections={connections} />
          </TabPanel>
        </Tabs>
      </Stack>
    </Container>
  );
}
