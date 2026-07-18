import React, { useState, useEffect } from "react";
import {
  Stack,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Button,
  Typography,
  Chip,
  IconButton,
  Box,
  Divider,
  Alert,
  CircularProgress,
} from "@mui/joy";
import {
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as ConnectedIcon,
  Cancel as DisconnectedIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
} from "@mui/icons-material";
import { ConnectionType } from "./index";
import api from "../../services/api";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface Credentials {
  token: string;
  accessToken: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  botToken: string;
  botUsername: string;
  oauthStatus: "connected" | "disconnected" | "error";
  pageName: string;
  pageId: string;
  facebookAdAccountId: string;
  facebookBusinessId: string;
}

interface CredentialsTabProps {
  connectionType: ConnectionType;
  connectionId?: number | null;
  credentials: Credentials;
  setCredentials: React.Dispatch<React.SetStateAction<Credentials>>;
  autoToken: string;
  onRefreshToken: () => void;
  onCopyToken: () => void;
  copied: boolean;
}

// Instagram OAuth constants
const IG_AUTH_FLAG = "ig_auth_started";
const IG_STATE_KEY = "ig_oauth_state";

const CredentialsTab: React.FC<CredentialsTabProps> = ({
  connectionType,
  connectionId,
  credentials,
  setCredentials,
  autoToken,
  onRefreshToken,
  onCopyToken,
  copied,
}) => {
  const [showToken, setShowToken] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [facebookAppId, setFacebookAppId] = useState<string>("");
  const [instagramAppId, setInstagramAppId] = useState<string>("");
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [sdkError, setSdkError] = useState<string>("");
  const [facebookConnectLoading, setFacebookConnectLoading] = useState(false);
  const [facebookConnectError, setFacebookConnectError] = useState<string>("");

  // Cargar configuracion de Facebook/Instagram App ID
  useEffect(() => {
    const loadAppConfig = async () => {
      try {
        // Obtener facebookAppId
        const fbResponse = await api.get("/companySettingOne/?column=facebookAppId");
        const fbAppId = fbResponse.data?.facebookAppId || import.meta.env.VITE_FACEBOOK_APP_ID || "";
        setFacebookAppId(fbAppId);

        // Obtener instagramAppId
        const igResponse = await api.get("/companySettingOne/?column=instagramAppId");
        // Si no hay Instagram App ID, usar el de Facebook como fallback
        const igAppId = igResponse.data?.instagramAppId || fbAppId || import.meta.env.VITE_INSTAGRAM_APP_ID || "";
        setInstagramAppId(igAppId);
      } catch (error) {
        console.error("Error loading app config:", error);
        setFacebookAppId(import.meta.env.VITE_FACEBOOK_APP_ID || "");
        setInstagramAppId(import.meta.env.VITE_INSTAGRAM_APP_ID || "");
      }
    };

    if (connectionType === "facebook" || connectionType === "instagram") {
      loadAppConfig();
    }
  }, [connectionType]);

  // Cargar SDK de Facebook cuando tengamos el App ID
  useEffect(() => {
    if (!facebookAppId || connectionType !== "facebook") return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const markLoaded = () => {
      if (cancelled || !window.FB) return;
      try {
        window.FB.init({
          appId: facebookAppId,
          cookie: true,
          xfbml: true,
          version: "v24.0",
        });
        setSdkLoaded(true);
        setSdkLoading(false);
        setSdkError("");
      } catch (error) {
        setSdkLoaded(false);
        setSdkLoading(false);
        setSdkError("No se pudo inicializar el SDK de Facebook. Verifica el App ID.");
      }
    };

    const markError = () => {
      if (cancelled) return;
      setSdkLoaded(false);
      setSdkLoading(false);
      setSdkError("No se pudo cargar el SDK de Facebook. Revisa bloqueadores del navegador o acceso a connect.facebook.net.");
    };

    setSdkLoading(true);
    setSdkError("");

    window.fbAsyncInit = markLoaded;

    if (window.FB) {
      markLoaded();
      return () => {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    let script = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    script.onload = markLoaded;
    script.onerror = markError;

    timeoutId = setTimeout(() => {
      if (!window.FB) markError();
    }, 12000);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
    };
  }, [facebookAppId, connectionType]);

  const handleFacebookReconnect = () => {
    if (!window.FB) {
      const message = "Facebook SDK no esta cargado. Verifica que el Facebook App ID este configurado en Settings.";
      setFacebookConnectError(message);
      alert(message);
      return;
    }

    setFacebookConnectError("");
    setFacebookConnectLoading(true);

    const loginOptions = {
      scope: "public_profile,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management",
      auth_type: "rerequest",
      return_scopes: true,
    };

    console.info("Facebook login start", {
      facebookAppId,
      scope: loginOptions.scope,
      authType: loginOptions.auth_type,
      returnScopes: loginOptions.return_scopes,
    });

    window.FB.login(
      (response: any) => {
        try {
          if (!response?.authResponse) {
            const status = response?.status || "unknown";
            const message = status === "not_authorized"
              ? "Facebook autorizo el login, pero no autorizo esta app. Reintenta y acepta todos los permisos."
              : "Facebook no devolvio autorizacion. Reintenta y selecciona las paginas necesarias.";
            setFacebookConnectError(message);
            console.warn("Facebook login without authResponse", { status });
            setFacebookConnectLoading(false);
            return;
          }

          const { accessToken, userID, grantedScopes } = response.authResponse;
          console.info("Facebook login authorized", {
            userID,
            hasAccessToken: Boolean(accessToken),
            grantedScopes,
          });

          api.post("/facebook", {
            facebookUserId: userID,
            facebookUserToken: accessToken,
            addInstagram: false,
          })
            .then(() => {
              window.location.reload();
            })
            .catch((error: any) => {
              console.error("Error connecting Facebook:", error);
              const status = error?.response?.status;
              const backendError = error?.response?.data?.error;
              const message = status === 401
                ? "Tu sesion de ChatEAM vencio antes de guardar Facebook. Inicia sesion nuevamente y repite la conexion."
                : backendError || "Error al conectar con Facebook. Revisa que hayas seleccionado una pagina con permisos.";
              setFacebookConnectError(message);
              alert(message);
            })
            .finally(() => {
              setFacebookConnectLoading(false);
            });
        } catch (error: any) {
          console.error("Error connecting Facebook:", error);
          const status = error?.response?.status;
          const backendError = error?.response?.data?.error;
          const message = status === 401
            ? "Tu sesion de ChatEAM vencio antes de guardar Facebook. Inicia sesion nuevamente y repite la conexion."
            : backendError || "Error al conectar con Facebook. Revisa que hayas seleccionado una pagina con permisos.";
          setFacebookConnectError(message);
          alert(message);
          setFacebookConnectLoading(false);
        }
      },
      loginOptions
    );
  };

  const handleInstagramReconnect = () => {
    // Usar el Instagram App ID desde configuracion o fallback a variable de entorno
    const clientId = instagramAppId || import.meta.env.VITE_INSTAGRAM_APP_ID || "";

    if (!clientId) {
      alert("Instagram App ID no esta configurado. Configuralo en Settings > Facebook Ads.");
      return;
    }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(IG_AUTH_FLAG, "1");
    sessionStorage.setItem(IG_STATE_KEY, state);

    const redirectUri = encodeURIComponent(`${window.location.origin}/connections`);

    const scopes = [
      "instagram_business_basic",
      "instagram_business_manage_messages",
      "instagram_business_manage_comments",
      "instagram_business_content_publish",
    ].join(",");

    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${state}`;

    window.location.href = authUrl;
  };

  // Render different content based on connection type
  switch (connectionType) {
    case "whatsapp":
      return (
        <Stack spacing={2}>
          <Typography level="title-md">Token API de WhatsApp</Typography>
          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
            Este token se usa para integraciones externas con tu conexión de WhatsApp.
          </Typography>

          <FormControl>
            <FormLabel>Token API</FormLabel>
            <Stack direction="row" spacing={1}>
              <Input value={autoToken} disabled sx={{ flex: 1 }} />
              <IconButton onClick={onRefreshToken} title="Generar nuevo token">
                <RefreshIcon />
              </IconButton>
              <IconButton
                onClick={onCopyToken}
                color={copied ? "success" : "neutral"}
                title="Copiar token"
              >
                <CopyIcon />
              </IconButton>
            </Stack>
          </FormControl>

          <Alert color="neutral" variant="soft">
            Este token es generado automáticamente y se usa para identificar tu conexión en integraciones de terceros.
          </Alert>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-sm">
            Configuración de Conversiones Facebook (Opcional)
          </Typography>
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            Si este número recibe mensajes de anuncios Click-to-WhatsApp (CTWA),
            configura estos datos para enviar conversiones a Facebook automáticamente.
            Obtén estos valores desde Meta Business Suite.
          </Typography>

          <FormControl>
            <FormLabel>WABA ID</FormLabel>
            <Input
              value={credentials.pageId}
              onChange={(e) => setCredentials({ ...credentials, pageId: e.target.value })}
              placeholder="Ej: 257579519530927"
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
              ID de la cuenta de WhatsApp Business (Meta Business Suite → WhatsApp Accounts)
            </Typography>
          </FormControl>

          <FormControl>
            <FormLabel>Token Meta (System User)</FormLabel>
            <Stack direction="row" spacing={1}>
              <Input
                type={showToken ? "text" : "password"}
                value={credentials.accessToken}
                onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
                placeholder="EAA... (System User Token)"
                sx={{ flex: 1 }}
              />
              <IconButton onClick={() => setShowToken(!showToken)}>
                {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </Stack>
            <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
              Token del System User con permisos whatsapp_business_management y business_management
            </Typography>
          </FormControl>

          <Alert color="neutral" variant="soft" size="sm">
            Estos datos son necesarios solo si quieres trackear conversiones de anuncios CTWA.
            El número seguirá funcionando normalmente con WhatsApp sin estos campos.
          </Alert>
        </Stack>
      );

    case "meta":
      return (
        <Stack spacing={2}>
          <Typography level="title-md">Credenciales de Meta Cloud API</Typography>
          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
            Conecta tu número de WhatsApp Business usando la API oficial de Meta Cloud.
            Necesitas obtener estos datos desde tu cuenta de Meta Business.
          </Typography>

          <Divider />

          <FormControl>
            <FormLabel>Access Token (Meta)</FormLabel>
            <Stack direction="row" spacing={1}>
              <Input
                type={showToken ? "text" : "password"}
                value={credentials.accessToken}
                onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
                placeholder="EAAG... (System/User token)"
                sx={{ flex: 1 }}
              />
              <IconButton onClick={() => setShowToken(!showToken)}>
                {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </Stack>
            <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
              Obtén el token desde Meta Business Suite &gt; API Configuration
            </Typography>
          </FormControl>

          <FormControl>
            <FormLabel>Phone Number ID</FormLabel>
            <Input
              value={credentials.phoneNumberId}
              onChange={(e) => setCredentials({ ...credentials, phoneNumberId: e.target.value })}
              placeholder="Ej: 123456789012345"
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
              ID del número de teléfono en WhatsApp Business Platform
            </Typography>
          </FormControl>

          {credentials.displayPhoneNumber && (
            <FormControl>
              <FormLabel>Número de Teléfono</FormLabel>
              <Input value={credentials.displayPhoneNumber} disabled />
              <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
                Número asociado a esta conexión (solo lectura)
              </Typography>
            </FormControl>
          )}

          <Alert color="warning" variant="soft">
            Asegúrate de que el token tenga los permisos necesarios: whatsapp_business_messaging, whatsapp_business_management
          </Alert>
        </Stack>
      );

    case "telegram":
      return (
        <Stack spacing={2}>
          <Typography level="title-md">Credenciales del Bot de Telegram</Typography>
          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
            Conecta un bot de Telegram para recibir y enviar mensajes.
            Obtén el token desde @BotFather en Telegram.
          </Typography>

          <Divider />

          <FormControl>
            <FormLabel>Bot Token</FormLabel>
            <Stack direction="row" spacing={1}>
              <Input
                type={showBotToken ? "text" : "password"}
                value={credentials.botToken}
                onChange={(e) => setCredentials({ ...credentials, botToken: e.target.value })}
                placeholder="1234567890:AAEhBOweik6ad2r..."
                sx={{ flex: 1 }}
              />
              <IconButton onClick={() => setShowBotToken(!showBotToken)}>
                {showBotToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </Stack>
            <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
              Token del bot obtenido desde @BotFather
            </Typography>
          </FormControl>

          <FormControl>
            <FormLabel>Bot Username</FormLabel>
            <Input
              value={credentials.botUsername}
              onChange={(e) => setCredentials({ ...credentials, botUsername: e.target.value })}
              placeholder="@mi_bot"
              startDecorator="@"
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: "text.tertiary" }}>
              Nombre de usuario del bot (sin @)
            </Typography>
          </FormControl>

          <Alert color="neutral" variant="soft">
            El formato del token debe ser: números:letras_y_números (ej: 123456789:ABCdefGHI...)
          </Alert>
        </Stack>
      );

    case "facebook":
      return (
        <Stack spacing={2}>
          <Typography level="title-md">Conexión de Facebook Messenger</Typography>
          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
            Estado de la conexión con tu página de Facebook para recibir mensajes en Messenger.
          </Typography>

          <Divider />

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <FacebookIcon sx={{ fontSize: 40, color: "#1877F2" }} />
            <Box>
              <Typography level="title-md">
                {credentials.pageName || "Página de Facebook"}
              </Typography>
              <Chip
                variant="soft"
                color={credentials.oauthStatus === "connected" ? "success" : "danger"}
                startDecorator={
                  credentials.oauthStatus === "connected" ? <ConnectedIcon /> : <DisconnectedIcon />
                }
              >
                {credentials.oauthStatus === "connected" ? "Conectado" : "Desconectado"}
              </Chip>
            </Box>
          </Box>

          {credentials.pageId && (
            <FormControl>
              <FormLabel>Page ID</FormLabel>
              <Input value={credentials.pageId} disabled />
            </FormControl>
          )}

          {!facebookAppId ? (
            <Alert color="warning" variant="soft">
              Facebook App ID no configurado. Ve a Settings &gt; Facebook Ads para configurarlo.
            </Alert>
          ) : sdkError ? (
            <Alert color="danger" variant="soft">
              {sdkError}
            </Alert>
          ) : sdkLoading ? (
            <Stack direction="row" spacing={2} alignItems="center">
              <CircularProgress size="sm" />
              <Typography level="body-sm">Cargando SDK de Facebook...</Typography>
            </Stack>
          ) : (
            <>
              {facebookConnectError && (
                <Alert color="danger" variant="soft">
                  {facebookConnectError}
                </Alert>
              )}
              <Button
                variant="outlined"
                color="primary"
                startDecorator={facebookConnectLoading ? <CircularProgress size="sm" /> : <FacebookIcon />}
                onClick={handleFacebookReconnect}
                disabled={!sdkLoaded || facebookConnectLoading}
              >
                {facebookConnectLoading
                  ? "Conectando..."
                  : credentials.oauthStatus === "connected" ? "Reconectar" : "Conectar con Facebook"}
              </Button>
            </>
          )}

          <Alert color="neutral" variant="soft">
            Al reconectar se actualizaran los permisos de la pagina. Asegurate de seleccionar todas las paginas necesarias.
          </Alert>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-sm">
            Configuracion de Facebook Ads (Opcional)
          </Typography>
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            Si deseas ver metricas de campanas publicitarias, ingresa los IDs de tu cuenta.
            El token de Facebook ya conectado se reutilizara automaticamente.
          </Typography>

          <FormControl>
            <FormLabel>Ad Account ID</FormLabel>
            <Input
              value={credentials.facebookAdAccountId || ""}
              onChange={(e) => setCredentials({ ...credentials, facebookAdAccountId: e.target.value })}
              placeholder="123456789"
            />
            <FormHelperText>
              ID de la cuenta publicitaria (sin el prefijo "act_")
            </FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>Business Manager ID (Opcional)</FormLabel>
            <Input
              value={credentials.facebookBusinessId || ""}
              onChange={(e) => setCredentials({ ...credentials, facebookBusinessId: e.target.value })}
              placeholder="123456789"
            />
            <FormHelperText>
              ID del Business Manager
            </FormHelperText>
          </FormControl>

          <Alert color="neutral" variant="soft" size="sm">
            Encuentra estos IDs en Facebook Business Manager - Configuracion - Informacion de la cuenta
          </Alert>
        </Stack>
      );

    case "instagram":
      return (
        <Stack spacing={2}>
          <Typography level="title-md">Conexión de Instagram Direct</Typography>
          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
            Estado de la conexión con tu cuenta de Instagram Business para recibir mensajes directos.
          </Typography>

          <Divider />

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <InstagramIcon sx={{ fontSize: 40, color: "#E4405F" }} />
            <Box>
              <Typography level="title-md">
                {credentials.pageName || "Cuenta de Instagram"}
              </Typography>
              <Chip
                variant="soft"
                color={credentials.oauthStatus === "connected" ? "success" : "danger"}
                startDecorator={
                  credentials.oauthStatus === "connected" ? <ConnectedIcon /> : <DisconnectedIcon />
                }
              >
                {credentials.oauthStatus === "connected" ? "Conectado" : "Desconectado"}
              </Chip>
            </Box>
          </Box>

          {credentials.pageId && (
            <FormControl>
              <FormLabel>Instagram ID</FormLabel>
              <Input value={credentials.pageId} disabled />
            </FormControl>
          )}

          {!instagramAppId && !facebookAppId ? (
            <Alert color="warning" variant="soft">
              Instagram/Facebook App ID no configurado. Ve a Settings &gt; Facebook Ads para configurarlo.
            </Alert>
          ) : (
            <Button
              variant="outlined"
              color="primary"
              startDecorator={<InstagramIcon />}
              onClick={handleInstagramReconnect}
            >
              {credentials.oauthStatus === "connected" ? "Reconectar" : "Conectar con Instagram"}
            </Button>
          )}

          <Alert color="neutral" variant="soft">
            Requiere una cuenta de Instagram Business o Creator vinculada a una pagina de Facebook.
          </Alert>
        </Stack>
      );

    default:
      return (
        <Typography level="body-md">
          Tipo de conexión no reconocido.
        </Typography>
      );
  }
};

export default CredentialsTab;
