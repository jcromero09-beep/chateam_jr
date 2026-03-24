/**
 * TikTokPostsTab — Tab de publicaciones/videos de TikTok
 * Muestra tabla de videos con métricas. Click en video abre drawer de comentarios.
 */
import { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import { useAuth } from "../hooks/useAuth";
import { toast } from "react-toastify";
import {
  Box,
  Typography,
  Table,
  Sheet,
  Stack,
  CircularProgress,
  Select,
  Option,
  IconButton,
  Chip,
} from "@mui/joy";
import {
  Visibility as VisibilityIcon,
  ThumbUp as ThumbUpIcon,
  ChatBubble as ChatBubbleIcon,
  Share as ShareIcon,
  PlayCircle as PlayCircleIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import TikTokCommentDrawer from "./TikTokCommentDrawer";

interface TikTokConnection {
  id: number;
  name: string;
  status: string;
  tiktokBusinessConnected?: boolean;
}

interface SocialPost {
  id: number;
  platformPostId: string;
  caption: string;
  thumbnailUrl: string;
  mediaUrl: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  status: string;
  socialAccount?: {
    id: number;
    username: string;
    displayName: string;
  };
}

interface TikTokPostsTabProps {
  connections: TikTokConnection[];
}

export default function TikTokPostsTab({ connections }: TikTokPostsTabProps) {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);

  const connectedConnections = connections.filter((c) => c.status === "CONNECTED");

  useEffect(() => {
    if (connectedConnections.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(connectedConnections[0].id);
    }
  }, [connectedConnections]);

  useEffect(() => {
    if (selectedConnectionId) {
      fetchPosts(selectedConnectionId);
    }
  }, [selectedConnectionId]);

  // Socket listener para nuevos comentarios
  useEffect(() => {
    if (!companyId) return;
    const eventName = `company-${companyId}-tiktok-comments`;
    const handler = (data: any) => {
      if (data.action === "new_comment" && data.postId) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === data.postId ? { ...p, comments: (p.comments || 0) + 1 } : p
          )
        );
      }
    };
    socketService.on(eventName, handler);
    return () => {
      socketService.off(eventName, handler);
    };
  }, [companyId]);

  const fetchPosts = async (tiktokId: number) => {
    try {
      setLoading(true);
      const response = await api.get(`/tiktok/${tiktokId}/posts`);
      const data = response.data;
      setPosts(data.data || data.posts || []);
    } catch (error) {
      toast.error("Error al cargar las publicaciones");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenComments = (post: SocialPost) => {
    setSelectedPost(post);
    setDrawerOpen(true);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num || 0);
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const selectedConnection = connectedConnections.find(
    (c) => c.id === selectedConnectionId
  );

  return (
    <Box>
      {/* Header con selector de conexión */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        {connectedConnections.length > 1 && (
          <Select
            value={selectedConnectionId}
            onChange={(_, val) => setSelectedConnectionId(val as number)}
            size="sm"
            sx={{ minWidth: 200 }}
          >
            {connectedConnections.map((conn) => (
              <Option key={conn.id} value={conn.id}>
                {conn.name}
              </Option>
            ))}
          </Select>
        )}
        <IconButton
          variant="soft"
          color="neutral"
          size="sm"
          onClick={() => selectedConnectionId && fetchPosts(selectedConnectionId)}
          disabled={loading}
        >
          <RefreshIcon />
        </IconButton>
        <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
          {posts.length} publicaciones
        </Typography>
      </Stack>

      {/* Tabla de videos */}
      <Sheet sx={{ overflow: "auto", borderRadius: "md" }} variant="outlined">
        <Table stickyHeader>
          <thead>
            <tr>
              <th style={{ width: 80 }}></th>
              <th style={{ minWidth: 200 }}>Video</th>
              <th style={{ width: 100 }}>Fecha</th>
              <th style={{ width: 90, textAlign: "center" }}>Views</th>
              <th style={{ width: 80, textAlign: "center" }}>Likes</th>
              <th style={{ width: 100, textAlign: "center" }}>Comentarios</th>
              <th style={{ width: 80, textAlign: "center" }}>Shares</th>
              <th style={{ width: 100 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "3rem" }}>
                  <Stack alignItems="center" spacing={1.5}>
                    <CircularProgress size="md" />
                    <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                      Cargando publicaciones...
                    </Typography>
                  </Stack>
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "3rem" }}>
                  <Stack alignItems="center" spacing={1.5}>
                    <PlayCircleIcon
                      sx={{ fontSize: 40, color: "text.tertiary", opacity: 0.4 }}
                    />
                    <Box>
                      <Typography level="body-md" fontWeight={600}>
                        Sin publicaciones
                      </Typography>
                      <Typography
                        level="body-sm"
                        sx={{ color: "text.tertiary", mt: 0.5 }}
                      >
                        Los videos apareceran aqui despues del primer polling
                      </Typography>
                    </Box>
                  </Stack>
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id}>
                  {/* Thumbnail */}
                  <td>
                    <Box
                      sx={{
                        width: 60,
                        height: 80,
                        borderRadius: "8px",
                        overflow: "hidden",
                        bgcolor: "#00000008",
                        position: "relative",
                        cursor: "pointer",
                      }}
                      onClick={() => handleOpenComments(post)}
                    >
                      {post.thumbnailUrl ? (
                        <img
                          src={post.thumbnailUrl}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <PlayCircleIcon
                          sx={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            fontSize: 24,
                            color: "text.tertiary",
                          }}
                        />
                      )}
                    </Box>
                  </td>

                  {/* Caption */}
                  <td>
                    <Typography
                      level="body-sm"
                      fontWeight={500}
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        cursor: "pointer",
                      }}
                      onClick={() => handleOpenComments(post)}
                    >
                      {post.caption || "Sin titulo"}
                    </Typography>
                  </td>

                  {/* Fecha */}
                  <td>
                    <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                      {formatDate(post.publishedAt)}
                    </Typography>
                  </td>

                  {/* Views */}
                  <td style={{ textAlign: "center" }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                      <VisibilityIcon sx={{ fontSize: 14, color: "text.tertiary" }} />
                      <Typography level="body-xs">{formatNumber(post.views)}</Typography>
                    </Stack>
                  </td>

                  {/* Likes */}
                  <td style={{ textAlign: "center" }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                      <ThumbUpIcon sx={{ fontSize: 14, color: "text.tertiary" }} />
                      <Typography level="body-xs">{formatNumber(post.likes)}</Typography>
                    </Stack>
                  </td>

                  {/* Comentarios */}
                  <td style={{ textAlign: "center" }}>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={post.comments > 0 ? "primary" : "neutral"}
                      startDecorator={<ChatBubbleIcon sx={{ fontSize: 13 }} />}
                      onClick={() => handleOpenComments(post)}
                      sx={{ cursor: "pointer" }}
                    >
                      {formatNumber(post.comments)}
                    </Chip>
                  </td>

                  {/* Shares */}
                  <td style={{ textAlign: "center" }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                      <ShareIcon sx={{ fontSize: 14, color: "text.tertiary" }} />
                      <Typography level="body-xs">{formatNumber(post.shares)}</Typography>
                    </Stack>
                  </td>

                  {/* Acciones */}
                  <td>
                    <IconButton
                      size="sm"
                      variant="soft"
                      color="primary"
                      onClick={() => handleOpenComments(post)}
                      title="Ver Comentarios"
                    >
                      <ChatBubbleIcon />
                    </IconButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Sheet>

      {/* Drawer de comentarios */}
      {selectedPost && (
        <TikTokCommentDrawer
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedPost(null);
          }}
          post={selectedPost}
          tiktokId={selectedConnectionId!}
          businessConnected={selectedConnection?.tiktokBusinessConnected || false}
        />
      )}
    </Box>
  );
}
