import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  Switch,
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Box,
  Textarea,
  Grid,
  Divider,
  IconButton,
  Chip,
  CircularProgress,
} from "@mui/joy";
import {
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import api from "../../services/api";
import CredentialsTab from "./CredentialsTab";

export type ConnectionType = 'whatsapp' | 'meta' | 'telegram' | 'facebook' | 'instagram';

interface Schedule {
  weekday: string;
  weekdayEn: string;
  startTimeA: string;
  endTimeA: string;
  startTimeB: string;
  endTimeB: string;
}

interface Flow {
  id: number;
  name: string;
}

interface Queue {
  id: number;
  name: string;
}

interface Prompt {
  id: number;
  name: string;
}

interface UnifiedConnectionModalProps {
  open: boolean;
  onClose: () => void;
  connectionId?: number | null;
  connectionType: ConnectionType;
  onSuccess?: () => void;
}

const defaultSchedules: Schedule[] = [
  { weekday: "Lunes", weekdayEn: "monday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
  { weekday: "Martes", weekdayEn: "tuesday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
  { weekday: "Miércoles", weekdayEn: "wednesday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
  { weekday: "Jueves", weekdayEn: "thursday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
  { weekday: "Viernes", weekdayEn: "friday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
  { weekday: "Sábado", weekdayEn: "saturday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
  { weekday: "Domingo", weekdayEn: "sunday", startTimeA: "08:00", endTimeA: "12:00", startTimeB: "13:00", endTimeB: "18:00" },
];

function generateRandomCode(length: number): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    code += charset.charAt(randomIndex);
  }
  return code;
}

const connectionTypeLabels: Record<ConnectionType, string> = {
  whatsapp: 'WhatsApp',
  meta: 'Meta Cloud API',
  telegram: 'Telegram',
  facebook: 'Facebook Messenger',
  instagram: 'Instagram Direct',
};

const UnifiedConnectionModal: React.FC<UnifiedConnectionModalProps> = ({
  open,
  onClose,
  connectionId,
  connectionType,
  onSuccess,
}) => {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [copied, setCopied] = useState(false);

  // Credentials data (specific to connection type)
  const [credentials, setCredentials] = useState({
    // WhatsApp
    token: "",
    // Meta Cloud API
    accessToken: "",
    phoneNumberId: "",
    displayPhoneNumber: "",
    // Telegram
    botToken: "",
    botUsername: "",
    // Facebook/Instagram OAuth status
    oauthStatus: "disconnected" as "connected" | "disconnected" | "error",
    pageName: "",
    pageId: "",
    // Facebook Ads (optional)
    facebookAdAccountId: "",
    facebookBusinessId: "",
  });

  // Form data (common fields)
  const [formData, setFormData] = useState({
    name: "",
    greetingMessage: "",
    farewellMessage: "",
    complationMessage: "",
    outOfHoursMessage: "",
    ratingMessage: "",
    callRejectMessage: "",
    rejectAudioMessage: "",
    npsEnabled: null as boolean | null,
    acceptAudio: null as boolean | null,
    isDefault: false,
    maxUseBotQueues: 3,
    expiresTicket: 0,
    allowGroup: false,
    groupAsTicket: "disabled",
    timeUseBotQueues: "0",
    timeSendQueue: "0",
    sendIdQueue: 0,
    expiresTicketNPS: "0",
    expiresInactiveMessage: "",
    timeInactiveMessage: "",
    inactiveMessage: "",
    maxUseBotQueuesNPS: 3,
    whenExpiresTicket: "0",
    timeCreateNewTicket: 0,
    collectiveVacationEnd: "",
    collectiveVacationStart: "",
    collectiveVacationMessage: "",
    promptId: null as number | null,
    useAIOrchestrator: false,
    integrationId: null as number | null,
  });

  const [autoToken, setAutoToken] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>(defaultSchedules);
  const [selectedQueueIds, setSelectedQueueIds] = useState<number[]>([]);
  const [flowIdWelcome, setFlowIdWelcome] = useState<number | null>(null);
  const [flowIdNotPhrase, setFlowIdNotPhrase] = useState<number | null>(null);

  // Lists
  const [queues, setQueues] = useState<Queue[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);

  // Attachment
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState("");

  // Load initial data
  useEffect(() => {
    if (open) {
      fetchQueues();
      fetchFlows();
      fetchPrompts();
      fetchIntegrations();

      if (connectionId) {
        fetchConnectionData();
      } else {
        resetForm();
        setAutoToken(generateRandomCode(30));
      }
    }
  }, [open, connectionId, connectionType]);

  const fetchQueues = async () => {
    try {
      const { data } = await api.get("/queue");
      setQueues(data);
    } catch (err) {
      console.error("Error fetching queues:", err);
    }
  };

  const fetchFlows = async () => {
    try {
      const { data } = await api.get("/flowbuilder");
      setFlows(data.flows || []);
    } catch (err) {
      console.error("Error fetching flows:", err);
    }
  };

  const fetchPrompts = async () => {
    try {
      const { data } = await api.get("/prompt");
      setPrompts(data.prompts || []);
    } catch (err) {
      console.error("Error fetching prompts:", err);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const { data } = await api.get("/queueIntegration");
      setIntegrations(data.queueIntegrations || []);
    } catch (err) {
      console.error("Error fetching integrations:", err);
    }
  };

  const fetchConnectionData = async () => {
    if (!connectionId) return;
    setFetchingData(true);

    try {
      let endpoint = "";
      switch (connectionType) {
        case "whatsapp":
          endpoint = `/whatsapp/${connectionId}?session=0`;
          break;
        case "meta":
          endpoint = `/whatsapp/${connectionId}?session=0`; // Meta uses whatsapp endpoint
          break;
        case "telegram":
          endpoint = `/telegram/${connectionId}`;
          break;
        case "facebook":
          endpoint = `/whatsapp/${connectionId}?session=0`; // Facebook uses whatsapp endpoint
          break;
        case "instagram":
          endpoint = `/whatsapp/${connectionId}?session=0`; // Instagram uses whatsapp endpoint
          break;
      }

      const { data } = await api.get(endpoint);

      // Set common form data
      setFormData({
        name: data.name || "",
        greetingMessage: data.greetingMessage || "",
        farewellMessage: data.farewellMessage || "",
        complationMessage: data.complationMessage || "",
        outOfHoursMessage: data.outOfHoursMessage || "",
        ratingMessage: data.ratingMessage || "",
        callRejectMessage: data.callRejectMessage || "",
        rejectAudioMessage: data.rejectAudioMessage || "",
        npsEnabled: data.npsEnabled === undefined ? null : data.npsEnabled,
        acceptAudio: data.acceptAudio === undefined ? null : data.acceptAudio,
        isDefault: data.isDefault || false,
        maxUseBotQueues: data.maxUseBotQueues || 3,
        expiresTicket: data.expiresTicket || 0,
        allowGroup: data.allowGroup || false,
        groupAsTicket: data.groupAsTicket || "disabled",
        timeUseBotQueues: data.timeUseBotQueues || "0",
        timeSendQueue: data.timeSendQueue || "0",
        sendIdQueue: data.sendIdQueue || 0,
        expiresTicketNPS: data.expiresTicketNPS || "0",
        expiresInactiveMessage: data.expiresInactiveMessage || "",
        timeInactiveMessage: data.timeInactiveMessage || "",
        inactiveMessage: data.inactiveMessage || "",
        maxUseBotQueuesNPS: data.maxUseBotQueuesNPS || 3,
        whenExpiresTicket: data.whenExpiresTicket || "0",
        timeCreateNewTicket: data.timeCreateNewTicket || 0,
        collectiveVacationEnd: data.collectiveVacationEnd || "",
        collectiveVacationStart: data.collectiveVacationStart || "",
        collectiveVacationMessage: data.collectiveVacationMessage || "",
        promptId: data.promptId || null,
        useAIOrchestrator: data.useAIOrchestrator || false,
        integrationId: data.integrationId || null,
      });

      // Set credentials based on connection type
      // Para Meta: 'number' almacena el Phone Number ID, 'tokenMeta' almacena el Access Token
      setCredentials({
        token: data.token || "",
        accessToken: data.tokenMeta || "",
        phoneNumberId: data.number || "", // Para Meta, el Phone Number ID está en 'number'
        displayPhoneNumber: data.displayPhoneNumber || data.number || "",
        botToken: data.botToken || "",
        botUsername: data.botUsername || "",
        oauthStatus: data.status === "CONNECTED" ? "connected" : "disconnected",
        pageName: data.facebookPageUserId || data.name || "",
        pageId: data.facebookUserId || "",
        facebookAdAccountId: data.facebookAdAccountId || "",
        facebookBusinessId: data.facebookBusinessId || "",
      });

      setAutoToken(data.token || generateRandomCode(30));
      setAttachmentName(data.greetingMediaAttachment || "");

      if (data.queues) {
        setSelectedQueueIds(data.queues.map((q: any) => q.id));
      }

      if (data.schedules && data.schedules.length > 0) {
        setSchedules(data.schedules);
      }

      if (data.flowIdWelcome) {
        setFlowIdWelcome(data.flowIdWelcome);
      }
      if (data.flowIdNotPhrase) {
        setFlowIdNotPhrase(data.flowIdNotPhrase);
      }
    } catch (err) {
      console.error("Error fetching connection:", err);
      toast.error("Error al cargar la conexión");
    } finally {
      setFetchingData(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      greetingMessage: "",
      farewellMessage: "",
      complationMessage: "",
      outOfHoursMessage: "",
      ratingMessage: "",
      callRejectMessage: "",
      rejectAudioMessage: "",
      npsEnabled: null,
      acceptAudio: null,
      isDefault: false,
      maxUseBotQueues: 3,
      expiresTicket: 0,
      allowGroup: false,
      groupAsTicket: "disabled",
      timeUseBotQueues: "0",
      timeSendQueue: "0",
      sendIdQueue: 0,
      expiresTicketNPS: "0",
      expiresInactiveMessage: "",
      timeInactiveMessage: "",
      inactiveMessage: "",
      maxUseBotQueuesNPS: 3,
      whenExpiresTicket: "0",
      timeCreateNewTicket: 0,
      collectiveVacationEnd: "",
      collectiveVacationStart: "",
      collectiveVacationMessage: "",
      promptId: null,
      integrationId: null,
      useAIOrchestrator: false,
    });
    setCredentials({
      token: "",
      accessToken: "",
      phoneNumberId: "",
      displayPhoneNumber: "",
      botToken: "",
      botUsername: "",
      oauthStatus: "disconnected",
      pageName: "",
      pageId: "",
      facebookAdAccountId: "",
      facebookBusinessId: "",
    });
    setSchedules(defaultSchedules);
    setSelectedQueueIds([]);
    setFlowIdWelcome(null);
    setFlowIdNotPhrase(null);
    setAttachment(null);
    setAttachmentName("");
    setTab(0);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("El nombre es requerido");
      return;
    }

    // Validate credentials based on type
    if (connectionType === "meta" && !connectionId) {
      if (!credentials.accessToken) {
        toast.error("El Access Token es requerido");
        return;
      }
      if (!credentials.phoneNumberId) {
        toast.error("El Phone Number ID es requerido");
        return;
      }
    }

    if (connectionType === "telegram" && !connectionId) {
      if (!credentials.botToken) {
        toast.error("El Bot Token es requerido");
        return;
      }
    }

    setLoading(true);

    try {
      let endpoint = "";
      let method: "post" | "put" = connectionId ? "put" : "post";

      // Build request data based on connection type
      const baseData = {
        ...formData,
        flowIdWelcome: flowIdWelcome || null,
        flowIdNotPhrase: flowIdNotPhrase || null,
        queueIds: selectedQueueIds,
        schedules,
      };

      let requestData: any = baseData;

      switch (connectionType) {
        case "whatsapp":
          endpoint = connectionId ? `/whatsapp/${connectionId}` : "/whatsapp";
          requestData = {
            ...baseData,
            token: autoToken,
            ...(credentials.pageId && { facebookUserId: credentials.pageId }),
            ...(credentials.accessToken && { tokenMeta: credentials.accessToken }),
          };
          break;

        case "meta":
          if (connectionId) {
            endpoint = `/whatsapp/${connectionId}`;
            requestData = {
              ...baseData,
              tokenMeta: credentials.accessToken,
              number: credentials.phoneNumberId, // El backend usa 'number' para Phone Number ID
            };
          } else {
            // La ruta para crear Meta es /webhook/meta
            endpoint = "/webhook/meta";
            requestData = {
              accessToken: credentials.accessToken,
              number: credentials.phoneNumberId,
              name: formData.name,
            };
          }
          break;

        case "telegram":
          endpoint = connectionId ? `/telegram/${connectionId}` : "/telegram";
          requestData = {
            ...baseData,
            botToken: credentials.botToken,
            botUsername: credentials.botUsername,
          };
          break;

        case "facebook":
          if (!connectionId) {
            toast.error("Las conexiones de Facebook se crean mediante OAuth. Usa el botón 'Conectar con Facebook'.");
            setLoading(false);
            return;
          }
          endpoint = `/whatsapp/${connectionId}`;
          requestData = {
            ...baseData,
            facebookAdAccountId: credentials.facebookAdAccountId || null,
            facebookBusinessId: credentials.facebookBusinessId || null,
          };
          break;

        case "instagram":
          if (!connectionId) {
            toast.error("Las conexiones de Instagram se crean mediante OAuth. Usa el botón 'Conectar con Instagram'.");
            setLoading(false);
            return;
          }
          endpoint = `/whatsapp/${connectionId}`;
          requestData = baseData;
          break;
      }

      await api[method](endpoint, requestData);

      // Handle file upload for whatsapp
      if ((connectionType === "whatsapp" || connectionType === "meta") && attachment) {
        const formDataFile = new FormData();
        formDataFile.append("file", attachment);
        const id = connectionId || (await api.get("/whatsapp")).data[0]?.id;
        if (id) {
          await api.post(`/whatsapp/${id}/media-upload`, formDataFile);
        }
      }

      toast.success(connectionId ? "Conexión actualizada con éxito" : "Conexión creada con éxito");
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      console.error("Error saving connection:", err);
      toast.error(err.response?.data?.message || err.response?.data?.error || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleRefreshToken = () => {
    setAutoToken(generateRandomCode(30));
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(autoToken);
    setCopied(true);
    toast.success("Token copiado al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachment(file);
      setAttachmentName(file.name);
    }
  };

  const handleDeleteFile = () => {
    setAttachment(null);
    setAttachmentName("");
    if (inputFileRef.current) {
      inputFileRef.current.value = "";
    }
  };

  const handleScheduleChange = (index: number, field: keyof Schedule, value: string) => {
    const newSchedules = [...schedules];
    newSchedules[index] = { ...newSchedules[index], [field]: value };
    setSchedules(newSchedules);
  };

  const isOAuthConnection = connectionType === "facebook" || connectionType === "instagram";
  const showCredentialsTab = true; // Always show credentials tab

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ width: "90%", maxWidth: 900, maxHeight: "90vh", overflow: "auto" }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          {connectionId ? `Editar ${connectionTypeLabels[connectionType]}` : `Nueva Conexión - ${connectionTypeLabels[connectionType]}`}
        </Typography>

        {fetchingData ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Tabs value={tab} onChange={(_, v) => setTab(v as number)}>
            <TabList>
              <Tab value={0}>Credenciales</Tab>
              <Tab value={1}>Información</Tab>
              <Tab value={2}>Horarios</Tab>
              <Tab value={3}>Mensajes</Tab>
              {/* Tab "Permisos" (value=4) ocultado a pedido. El TabPanel value={4}
                  sigue existiendo pero queda inalcanzable desde la UI. */}
              {/* <Tab value={4}>Permisos</Tab> */}
              <Tab value={5}>IA / Bot</Tab>
              <Tab value={6}>Avanzado</Tab>
            </TabList>

            {/* TAB 0 — CREDENCIALES */}
            <TabPanel value={0}>
              <CredentialsTab
                connectionType={connectionType}
                connectionId={connectionId}
                credentials={credentials}
                setCredentials={setCredentials}
                autoToken={autoToken}
                onRefreshToken={handleRefreshToken}
                onCopyToken={handleCopyToken}
                copied={copied}
              />
            </TabPanel>

            {/* TAB 1 — INFORMACIÓN (datos básicos de la conexión) */}
            <TabPanel value={1}>
              <Stack spacing={2}>
                <Box>
                  <Typography level="title-md">Datos básicos</Typography>
                  <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                    Identidad y comportamiento general de esta conexión.
                  </Typography>
                </Box>
                <Divider />

                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <FormControl required>
                      <FormLabel>Nombre</FormLabel>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: WhatsApp Principal"
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={3}>
                    <FormControl>
                      <FormLabel>Por defecto</FormLabel>
                      <Switch
                        checked={formData.isDefault}
                        onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={3}>
                    <FormControl>
                      <FormLabel>Permitir grupos</FormLabel>
                      <Switch
                        checked={formData.allowGroup}
                        onChange={(e) => setFormData({ ...formData, allowGroup: e.target.checked })}
                      />
                    </FormControl>
                  </Grid>
                </Grid>

                <FormControl>
                  <FormLabel>Tratar grupos como ticket</FormLabel>
                  <Select
                    value={formData.groupAsTicket}
                    onChange={(_, v) => setFormData({ ...formData, groupAsTicket: v as string })}
                  >
                    <Option value="disabled">Deshabilitado</Option>
                    <Option value="enabled">Habilitado</Option>
                  </Select>
                  <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                    Si está habilitado, las conversaciones grupales generan tickets como un contacto individual.
                  </Typography>
                </FormControl>

                <Divider />
                <Typography level="title-md">Colas asignadas</Typography>
                <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                  Colas que pueden recibir tickets desde esta conexión.
                </Typography>

                <FormControl>
                  <FormLabel>Colas</FormLabel>
                  <Select
                    multiple
                    value={selectedQueueIds}
                    onChange={(_, v) => setSelectedQueueIds(v as number[])}
                    placeholder="Seleccionar colas"
                  >
                    {queues.map((queue) => (
                      <Option key={queue.id} value={queue.id}>
                        {queue.name}
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                {/* Archivo adjunto - solo para WhatsApp y Meta */}
                {(connectionType === "whatsapp" || connectionType === "meta") && (
                  <>
                    <Divider />
                    <Typography level="title-md">Archivo de bienvenida</Typography>
                    <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                      Imagen o video opcional que acompaña al mensaje de saludo.
                    </Typography>
                    <FormControl>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <input
                          type="file"
                          accept="video/*,image/*"
                          ref={inputFileRef}
                          style={{ display: "none" }}
                          onChange={handleFileUpload}
                        />
                        <Button
                          variant="outlined"
                          onClick={() => inputFileRef.current?.click()}
                        >
                          Seleccionar archivo
                        </Button>
                        {attachmentName && (
                          <Chip
                            endDecorator={
                              <IconButton size="sm" onClick={handleDeleteFile}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            }
                          >
                            {attachmentName}
                          </Chip>
                        )}
                      </Stack>
                    </FormControl>
                  </>
                )}
              </Stack>
            </TabPanel>

            {/* TAB 2 — HORARIOS */}
            <TabPanel value={2}>
              <Stack spacing={2}>
                <Box>
                  <Typography level="title-md">Horarios de atención</Typography>
                  <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                    Define los turnos por día. Fuera de estos horarios se envía el "Mensaje fuera de horario" definido en la pestaña Mensajes.
                  </Typography>
                </Box>
                <Divider />

                {schedules.map((schedule, index) => (
                  <Box key={schedule.weekdayEn} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: "sm" }}>
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      {schedule.weekday}
                    </Typography>
                    <Grid container spacing={1}>
                      <Grid xs={3}>
                        <FormControl size="sm">
                          <FormLabel>Turno 1 — Inicio</FormLabel>
                          <Input
                            type="time"
                            value={schedule.startTimeA}
                            onChange={(e) => handleScheduleChange(index, "startTimeA", e.target.value)}
                          />
                        </FormControl>
                      </Grid>
                      <Grid xs={3}>
                        <FormControl size="sm">
                          <FormLabel>Turno 1 — Fin</FormLabel>
                          <Input
                            type="time"
                            value={schedule.endTimeA}
                            onChange={(e) => handleScheduleChange(index, "endTimeA", e.target.value)}
                          />
                        </FormControl>
                      </Grid>
                      <Grid xs={3}>
                        <FormControl size="sm">
                          <FormLabel>Turno 2 — Inicio</FormLabel>
                          <Input
                            type="time"
                            value={schedule.startTimeB}
                            onChange={(e) => handleScheduleChange(index, "startTimeB", e.target.value)}
                          />
                        </FormControl>
                      </Grid>
                      <Grid xs={3}>
                        <FormControl size="sm">
                          <FormLabel>Turno 2 — Fin</FormLabel>
                          <Input
                            type="time"
                            value={schedule.endTimeB}
                            onChange={(e) => handleScheduleChange(index, "endTimeB", e.target.value)}
                          />
                        </FormControl>
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            </TabPanel>

            {/* TAB 3 — MENSAJES (todos los textos automáticos por conexión) */}
            <TabPanel value={3}>
              <Stack spacing={2}>
                <Box>
                  <Typography level="title-md">Mensajes automáticos por conexión</Typography>
                  <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                    Textos que esta conexión envía al cliente. Si un campo se deja vacío, no se envía nada en ese evento.
                  </Typography>
                </Box>
                <Divider />

                {/* Saludo y despedida */}
                <Typography level="title-sm">Saludo y despedida</Typography>

                <FormControl>
                  <FormLabel>Mensaje de saludo</FormLabel>
                  <Textarea
                    minRows={3}
                    value={formData.greetingMessage}
                    onChange={(e) => setFormData({ ...formData, greetingMessage: e.target.value })}
                    placeholder="Texto de bienvenida cuando el cliente inicia conversación."
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Mensaje de despedida</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.farewellMessage}
                    onChange={(e) => setFormData({ ...formData, farewellMessage: e.target.value })}
                    placeholder="Texto enviado cuando el agente se despide del cliente."
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Mensaje al cerrar ticket</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.complationMessage}
                    onChange={(e) => setFormData({ ...formData, complationMessage: e.target.value })}
                    placeholder="Texto enviado al cliente cuando el ticket se marca como resuelto."
                  />
                </FormControl>

                <Divider />
                {/* Horario y disponibilidad */}
                <Typography level="title-sm">Horario y disponibilidad</Typography>

                <FormControl>
                  <FormLabel>Mensaje fuera de horario</FormLabel>
                  <Textarea
                    minRows={3}
                    value={formData.outOfHoursMessage}
                    onChange={(e) => setFormData({ ...formData, outOfHoursMessage: e.target.value })}
                    placeholder="Texto enviado cuando llega un mensaje fuera del horario configurado."
                  />
                </FormControl>

                <Divider />
                {/* Reseña / NPS */}
                <Typography level="title-sm">Encuesta / Evaluación NPS</Typography>
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                  Texto que se envía al cerrar un ticket cuando la encuesta NPS está activa (ver pestaña Permisos). Si lo dejas vacío, no se envía encuesta aunque el NPS esté habilitado.
                </Typography>

                <FormControl>
                  <FormLabel>Mensaje de evaluación NPS</FormLabel>
                  <Textarea
                    minRows={3}
                    value={formData.ratingMessage}
                    onChange={(e) => setFormData({ ...formData, ratingMessage: e.target.value })}
                    placeholder="Ej.: ¿Cómo calificarías nuestra atención del 1 al 5?"
                  />
                </FormControl>

                <Divider />
                {/* Llamadas y audios */}
                <Typography level="title-sm">Llamadas y audios</Typography>

                <FormControl>
                  <FormLabel>Mensaje al rechazar llamada</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.callRejectMessage}
                    onChange={(e) => setFormData({ ...formData, callRejectMessage: e.target.value })}
                    placeholder="Texto que se envía al cliente cuando esta conexión NO acepta llamadas (según la configuración de la empresa). Si lo dejas vacío, no se envía ningún mensaje."
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Mensaje cuando NO se aceptan audios</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.rejectAudioMessage}
                    onChange={(e) => setFormData({ ...formData, rejectAudioMessage: e.target.value })}
                    placeholder="Texto enviado al cliente cuando esta conexión no recibe audios."
                  />
                </FormControl>

                <Divider />
                {/* Inactividad */}
                <Typography level="title-sm">Inactividad</Typography>

                <FormControl>
                  <FormLabel>Mensaje de inactividad</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.inactiveMessage}
                    onChange={(e) => setFormData({ ...formData, inactiveMessage: e.target.value })}
                    placeholder="Recordatorio enviado al cliente cuando lleva un rato sin responder."
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Tiempo para enviar mensaje de inactividad (min)</FormLabel>
                  <Input
                    type="number"
                    value={formData.timeInactiveMessage}
                    onChange={(e) => setFormData({ ...formData, timeInactiveMessage: e.target.value })}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Mensaje antes de cerrar por inactividad</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.expiresInactiveMessage}
                    onChange={(e) => setFormData({ ...formData, expiresInactiveMessage: e.target.value })}
                    placeholder="Aviso al cliente justo antes de cerrar el ticket por inactividad."
                  />
                </FormControl>

                <Divider />
                {/* Vacaciones colectivas */}
                <Typography level="title-sm">Vacaciones colectivas</Typography>

                <FormControl>
                  <FormLabel>Mensaje de vacaciones</FormLabel>
                  <Textarea
                    minRows={2}
                    value={formData.collectiveVacationMessage}
                    onChange={(e) => setFormData({ ...formData, collectiveVacationMessage: e.target.value })}
                    placeholder="Texto enviado durante el período de vacaciones colectivas."
                  />
                </FormControl>

                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Fecha inicio</FormLabel>
                      <Input
                        type="date"
                        value={formData.collectiveVacationStart}
                        onChange={(e) => setFormData({ ...formData, collectiveVacationStart: e.target.value })}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Fecha fin</FormLabel>
                      <Input
                        type="date"
                        value={formData.collectiveVacationEnd}
                        onChange={(e) => setFormData({ ...formData, collectiveVacationEnd: e.target.value })}
                      />
                    </FormControl>
                  </Grid>
                </Grid>
              </Stack>
            </TabPanel>

            {/* TAB 4 — PERMISOS (políticas por conexión) */}
            <TabPanel value={4}>
              <Stack spacing={3}>
                <Box>
                  <Typography level="title-md">Permisos de mensajería</Typography>
                  <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                    Cada permiso puede heredar la política global de la empresa (configurada en Ajustes) o forzar un valor solo para esta conexión.
                  </Typography>
                </Box>
                <Divider />

                {/* NPS por conexión */}
                <FormControl>
                  <FormLabel>Encuesta NPS al cerrar ticket</FormLabel>
                  <Typography level="body-xs" sx={{ color: "text.tertiary", mb: 1 }}>
                    Solicita al cliente que califique la atención recibida cuando se cierra un ticket. El texto se configura en la pestaña Mensajes.
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      variant={formData.npsEnabled === null ? "solid" : "soft"}
                      color={formData.npsEnabled === null ? "primary" : "neutral"}
                      onClick={() => setFormData({ ...formData, npsEnabled: null })}
                      sx={{ cursor: "pointer" }}
                    >
                      🔗 Heredar global
                    </Chip>
                    <Chip
                      variant={formData.npsEnabled === true ? "solid" : "soft"}
                      color={formData.npsEnabled === true ? "success" : "neutral"}
                      onClick={() => setFormData({ ...formData, npsEnabled: true })}
                      sx={{ cursor: "pointer" }}
                    >
                      ✓ Activar siempre
                    </Chip>
                    <Chip
                      variant={formData.npsEnabled === false ? "solid" : "soft"}
                      color={formData.npsEnabled === false ? "danger" : "neutral"}
                      onClick={() => setFormData({ ...formData, npsEnabled: false })}
                      sx={{ cursor: "pointer" }}
                    >
                      ✗ Desactivar
                    </Chip>
                  </Stack>
                  {formData.npsEnabled === false && (
                    <Typography level="body-xs" sx={{ color: "warning.500", mt: 1 }}>
                      Esta conexión no enviará encuestas NPS aunque el switch global esté activo.
                    </Typography>
                  )}
                  {formData.npsEnabled !== false && !formData.ratingMessage && (
                    <Typography level="body-xs" sx={{ color: "warning.500", mt: 1 }}>
                      ⚠ El mensaje de evaluación está vacío. Defínelo en la pestaña Mensajes para que se envíe la encuesta.
                    </Typography>
                  )}
                </FormControl>

                <Divider />

                {/* Aceptar audio por conexión */}
                <FormControl>
                  <FormLabel>Aceptar audios entrantes</FormLabel>
                  <Typography level="body-xs" sx={{ color: "text.tertiary", mb: 1 }}>
                    Permite que los clientes envíen mensajes de voz a través de esta conexión. Si rechazas audios, el cliente recibe el "Mensaje cuando NO se aceptan audios" definido en Mensajes.
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      variant={formData.acceptAudio === null ? "solid" : "soft"}
                      color={formData.acceptAudio === null ? "primary" : "neutral"}
                      onClick={() => setFormData({ ...formData, acceptAudio: null })}
                      sx={{ cursor: "pointer" }}
                    >
                      🔗 Heredar global
                    </Chip>
                    <Chip
                      variant={formData.acceptAudio === true ? "solid" : "soft"}
                      color={formData.acceptAudio === true ? "success" : "neutral"}
                      onClick={() => setFormData({ ...formData, acceptAudio: true })}
                      sx={{ cursor: "pointer" }}
                    >
                      ✓ Aceptar audios
                    </Chip>
                    <Chip
                      variant={formData.acceptAudio === false ? "solid" : "soft"}
                      color={formData.acceptAudio === false ? "danger" : "neutral"}
                      onClick={() => setFormData({ ...formData, acceptAudio: false })}
                      sx={{ cursor: "pointer" }}
                    >
                      ✗ Rechazar audios
                    </Chip>
                  </Stack>
                </FormControl>
              </Stack>
            </TabPanel>

            {/* TAB 5 — IA / BOT */}
            <TabPanel value={5}>
              <Stack spacing={3}>
                <Box>
                  <Typography level="title-md">Automatización de respuesta</Typography>
                  <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                    Define qué respuesta automática usa esta conexión. Solo se puede activar una opción a la vez (Orquestador IA o Flujo).
                  </Typography>
                </Box>
                <Divider />

                <FormControl orientation="horizontal" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Box>
                    <FormLabel>Orquestador IA</FormLabel>
                    <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                      Las respuestas las genera el orquestador IA en lugar de un flujo predefinido.
                    </Typography>
                  </Box>
                  <Switch
                    checked={formData.useAIOrchestrator}
                    onChange={(e) => {
                      const isActive = e.target.checked;
                      setFormData({
                        ...formData,
                        useAIOrchestrator: isActive,
                        // Mutuamente excluyente: si activa orquestador → limpiar flujo
                        integrationId: isActive ? null : formData.integrationId,
                        promptId: null
                      });
                    }}
                    color={formData.useAIOrchestrator ? "primary" : "neutral"}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Flujo (FlowBuilder)</FormLabel>
                  <Select
                    value={formData.integrationId ? String(formData.integrationId) : ""}
                    onChange={(_, v) => {
                      const newValue = v ? Number(v) : null;
                      setFormData({
                        ...formData,
                        integrationId: newValue,
                        // Mutuamente excluyente: al elegir un flujo se APAGA el Orquestador IA.
                        // (Solo puede funcionar uno a la vez: Orquestador O Flujo, nunca los dos.)
                        useAIOrchestrator: newValue ? false : formData.useAIOrchestrator,
                        // Limpiar agente IA cuando se selecciona flujo
                        promptId: newValue ? null : formData.promptId
                      });
                    }}
                    placeholder="Seleccionar flujo"
                  >
                    <Option value="">Deshabilitado</Option>
                    {flows.map((flow) => (
                      <Option key={flow.id} value={String(flow.id)}>
                        {flow.name}
                      </Option>
                    ))}
                  </Select>
                  <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                    Selecciona un flujo de FlowBuilder para responder automáticamente.
                  </Typography>
                </FormControl>

                <Divider />
                <Typography level="title-sm">Flujos específicos</Typography>

                <FormControl>
                  <FormLabel>Flujo de bienvenida</FormLabel>
                  <Select
                    value={flowIdWelcome ? String(flowIdWelcome) : ""}
                    onChange={(_, v) => setFlowIdWelcome(v ? Number(v) : null)}
                    placeholder="Seleccionar flujo"
                  >
                    <Option value="">Deshabilitado</Option>
                    {flows.map((flow) => (
                      <Option key={flow.id} value={String(flow.id)}>
                        {flow.name}
                      </Option>
                    ))}
                  </Select>
                  <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                    Solo se ejecuta para contactos nuevos (no guardados).
                  </Typography>
                </FormControl>

                <FormControl>
                  <FormLabel>Flujo de respuesta estándar</FormLabel>
                  <Select
                    value={flowIdNotPhrase ? String(flowIdNotPhrase) : ""}
                    onChange={(_, v) => setFlowIdNotPhrase(v ? Number(v) : null)}
                    placeholder="Seleccionar flujo"
                  >
                    <Option value="">Deshabilitado</Option>
                    {flows.map((flow) => (
                      <Option key={flow.id} value={String(flow.id)}>
                        {flow.name}
                      </Option>
                    ))}
                  </Select>
                  <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                    Se activa cuando el mensaje no coincide con ninguna palabra clave o el ticket ya está cerrado.
                  </Typography>
                </FormControl>

                <Divider />
                <Typography level="title-sm">Comportamiento del chatbot</Typography>

                <Grid container spacing={2}>
                  <Grid xs={12} md={4}>
                    <FormControl>
                      <FormLabel>Tiempo para nuevo ticket (min)</FormLabel>
                      <Input
                        type="number"
                        value={formData.timeCreateNewTicket}
                        onChange={(e) => setFormData({ ...formData, timeCreateNewTicket: parseInt(e.target.value) || 0 })}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={4}>
                    <FormControl>
                      <FormLabel>Máx. usos del chatbot</FormLabel>
                      <Input
                        type="number"
                        value={formData.maxUseBotQueues}
                        onChange={(e) => setFormData({ ...formData, maxUseBotQueues: parseInt(e.target.value) || 3 })}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={4}>
                    <FormControl>
                      <FormLabel>Tiempo envío chatbot (seg)</FormLabel>
                      <Input
                        type="number"
                        value={formData.timeUseBotQueues}
                        onChange={(e) => setFormData({ ...formData, timeUseBotQueues: e.target.value })}
                      />
                    </FormControl>
                  </Grid>
                </Grid>
              </Stack>
            </TabPanel>

            {/* TAB 6 — AVANZADO (técnico, expiraciones, redirección, NPS técnico) */}
            <TabPanel value={6}>
              <Stack spacing={3}>
                <Box>
                  <Typography level="title-md">Configuraciones avanzadas</Typography>
                  <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                    Parámetros técnicos y expiraciones específicas. Solo modifica si sabes lo que haces.
                  </Typography>
                </Box>
                <Divider />

                {/* Cierre por inactividad */}
                <Typography level="title-sm">Cierre automático de tickets</Typography>

                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Cerrar tickets después de (horas)</FormLabel>
                      <Input
                        type="number"
                        value={formData.expiresTicket}
                        onChange={(e) => setFormData({ ...formData, expiresTicket: parseInt(e.target.value) || 0 })}
                      />
                      <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                        0 = no cerrar automáticamente.
                      </Typography>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Cerrar basado en</FormLabel>
                      <Select
                        value={formData.whenExpiresTicket}
                        onChange={(_, v) => setFormData({ ...formData, whenExpiresTicket: v as string })}
                      >
                        <Option value="0">Último mensaje del cliente</Option>
                        <Option value="1">Último mensaje del agente</Option>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Divider />
                {/* Redirección de cola */}
                <Typography level="title-sm">Redirección automática a cola</Typography>
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                  Después de cierto tiempo de inactividad, redirige el ticket a otra cola.
                </Typography>

                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Cola destino</FormLabel>
                      <Select
                        value={formData.sendIdQueue}
                        onChange={(_, v) => setFormData({ ...formData, sendIdQueue: v as number })}
                      >
                        <Option value={0}>Ninguna</Option>
                        {queues.map((queue) => (
                          <Option key={queue.id} value={queue.id}>
                            {queue.name}
                          </Option>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Tiempo (minutos)</FormLabel>
                      <Input
                        type="number"
                        value={formData.timeSendQueue}
                        onChange={(e) => setFormData({ ...formData, timeSendQueue: e.target.value })}
                      />
                    </FormControl>
                  </Grid>
                </Grid>

                <Divider />
                {/* NPS técnico */}
                <Typography level="title-sm">Configuración técnica de NPS</Typography>
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                  Parámetros de envío y expiración de la encuesta NPS. El texto se configura en Mensajes y la activación en Permisos.
                </Typography>

                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Máx. envíos NPS</FormLabel>
                      <Input
                        type="number"
                        value={formData.maxUseBotQueuesNPS}
                        onChange={(e) => setFormData({ ...formData, maxUseBotQueuesNPS: parseInt(e.target.value) || 3 })}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Cerrar NPS después de (min)</FormLabel>
                      <Input
                        type="number"
                        value={formData.expiresTicketNPS}
                        onChange={(e) => setFormData({ ...formData, expiresTicketNPS: e.target.value })}
                      />
                    </FormControl>
                  </Grid>
                </Grid>
              </Stack>
            </TabPanel>
          </Tabs>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="outlined" color="neutral" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          {/* Para Facebook/Instagram sin connectionId, no mostrar botón Crear (se crean por OAuth) */}
          {!((!connectionId) && (connectionType === "facebook" || connectionType === "instagram")) && (
            <Button color="primary" onClick={handleSave} loading={loading}>
              {connectionId ? "Actualizar" : "Crear"}
            </Button>
          )}
        </Stack>
      </ModalDialog>
    </Modal>
  );
};

export default UnifiedConnectionModal;
