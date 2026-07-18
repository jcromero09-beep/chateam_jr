/**
 * TikTokCommentDrawer — Drawer lateral con comentarios de un video
 * Muestra video info + comentarios tipo thread + input de reply
 */
import { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import { useAuth } from "../hooks/useAuth";
import { toast } from "react-toastify";
import {
  Drawer,
  Box,
  Typography,
  Stack,
  Divider,
  Chip,
  CircularProgress,
  Input,
  IconButton,
  Sheet,
  Avatar,
} from "@mui/joy";
import {
  Close as CloseIcon,
  ThumbUp as ThumbUpIcon,
  ChatBubble as ChatBubbleIcon,
  Send as SendIcon,
  SmartToy as SmartToyIcon,
  Visibility as VisibilityIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";

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
  metadata?: Record<string, any>;
}

interface CommentReply {
  id: number;
  content: string;
  authorUsername: string;
  fromMe: boolean;
  likeCount: number;
  postedAt: string;
  autoReplyStatus: string;
  assignedAgent?: { id: number; name: string };
}

interface Comment {
  id: number;
  platformCommentId: string;
  content: string;
  authorUsername: string;
  authorDisplayName?: string;
  fromMe: boolean;
  likeCount: number;
  replyCount: number;
  postedAt: string;
  commentType: string;
  sentiment: string;
  autoReplyStatus: string;
  autoReplyContent?: string;
  assignedAgent?: { id: number; name: string };
  replies: CommentReply[];
}

interface TikTokCommentDrawerProps {
  open: boolean;
  onClose: () => void;
  post: SocialPost;
  tiktokId: number;
  businessConnected: boolean;
}

export default function TikTokCommentDrawer({
  open,
  onClose,
  post,
  tiktokId,
  businessConnected,
}: TikTokCommentDrawerProps) {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open && post) {
      fetchComments();
    }
  }, [open, post]);

  // Socket listener
  useEffect(() => {
    if (!companyId || !open) return;
    const eventName = `company-${companyId}-tiktok-comments`;
    const handler = (data: any) => {
      if (data.postId === post.id) {
        if (data.action === "new_comment") {
          setComments((prev) => {
            if (data.comment.parentCommentId) {
              return prev.map((c) =>
                c.id === data.comment.parentCommentId
                  ? { ...c, replies: [...(c.replies || []), data.comment] }
                  : c
              );
            }
            return [data.comment, ...prev];
          });
        } else if (data.action === "reply_sent") {
          fetchComments(); // Reload to get full thread
        }
      }
    };
    socketService.on(eventName, handler);
    return () => {
      socketService.off(eventName, handler);
    };
  }, [companyId, open, post?.id]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await api.get(
        `/tiktok/${tiktokId}/posts/${post.id}/comments`
      );
      const data = response.data;
      setComments(data.data || data.comments || []);
    } catch (error) {
      toast.error("Error al cargar comentarios");
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (commentId: number, useAI: boolean = false) => {
    if (!useAI && !replyText.trim()) return;

    try {
      setSending(true);
      await api.post(
        `/tiktok/${tiktokId}/comments/${commentId}/reply`,
        useAI ? { useAI: true } : { replyText: replyText.trim() }
      );
      toast.success(
        useAI ? "Respuesta IA generada y enviada" : "Respuesta enviada"
      );
      setReplyText("");
      setReplyingTo(null);
      fetchComments();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Error al enviar respuesta"
      );
    } finally {
      setSending(false);
    }
  };

  const toggleReplies = (commentId: number) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const formatTimeAgo = (dateString: string): string => {
    if (!dateString) return "";
    const now = Date.now();
    const date = new Date(dateString).getTime();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return new Date(dateString).toLocaleDateString("es-ES");
  };

  const getCommentTypeChip = (type: string) => {
    const config: Record<string, { color: any; label: string }> = {
      purchase_intent: { color: "success", label: "Compra" },
      question: { color: "primary", label: "Pregunta" },
      praise: { color: "warning", label: "Elogio" },
      complaint: { color: "danger", label: "Queja" },
      spam: { color: "neutral", label: "Spam" },
    };
    const c = config[type];
    if (!c || type === "neutral") return null;
    return (
      <Chip size="sm" variant="soft" color={c.color}>
        {c.label}
      </Chip>
    );
  };

  const renderComment = (comment: Comment | CommentReply, isReply: boolean = false) => {
    const isOwn = comment.fromMe;
    return (
      <Box
        key={comment.id}
        sx={{
          ml: isReply ? 4 : 0,
          pl: isReply ? 2 : 0,
          borderLeft: isReply ? "2px solid" : "none",
          borderColor: "divider",
          mb: 1.5,
        }}
      >
        <Stack spacing={0.5}>
          {/* Header: avatar + username + time */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Avatar
              size="sm"
              sx={{
                width: 28,
                height: 28,
                bgcolor: isOwn ? "primary.softBg" : "#00000010",
                fontSize: 12,
              }}
            >
              {isOwn ? "Tu" : comment.authorUsername?.charAt(0)?.toUpperCase() || "?"}
            </Avatar>
            <Typography
              level="body-xs"
              fontWeight={600}
              sx={{ color: isOwn ? "primary.600" : "text.primary" }}
            >
              {isOwn ? "Tu respuesta" : comment.authorUsername}
            </Typography>
            <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
              {formatTimeAgo(comment.postedAt)}
            </Typography>
            {isOwn && (
              <Chip size="sm" variant="soft" color="primary">
                Enviado
              </Chip>
            )}
            {comment.autoReplyStatus === "sent" && !isOwn && (
              <Chip
                size="sm"
                variant="soft"
                color="success"
                startDecorator={<SmartToyIcon sx={{ fontSize: 12 }} />}
              >
                IA
              </Chip>
            )}
          </Stack>

          {/* Content */}
          <Typography level="body-sm" sx={{ pl: 4.5 }}>
            {comment.content}
          </Typography>

          {/* Footer: likes + type chip + reply button */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 4.5 }}>
            {comment.likeCount > 0 && (
              <Stack direction="row" spacing={0.25} alignItems="center">
                <ThumbUpIcon sx={{ fontSize: 12, color: "text.tertiary" }} />
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                  {comment.likeCount}
                </Typography>
              </Stack>
            )}
            {!isReply && "commentType" in comment && getCommentTypeChip(comment.commentType)}
            {businessConnected && !isReply && !isOwn && (
              <Typography
                level="body-xs"
                sx={{
                  color: "primary.600",
                  cursor: "pointer",
                  fontWeight: 600,
                  "&:hover": { textDecoration: "underline" },
                }}
                onClick={() =>
                  setReplyingTo(
                    replyingTo === comment.id ? null : comment.id
                  )
                }
              >
                Responder
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>
    );
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      size="lg"
      slotProps={{
        content: {
          sx: { width: { xs: "100%", sm: 520 }, p: 0 },
        },
      }}
    >
      {/* Header con info del video */}
      <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
            {post.thumbnailUrl && (
              <Box
                sx={{
                  width: 70,
                  height: 90,
                  borderRadius: "8px",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <img
                  src={post.thumbnailUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                level="title-sm"
                fontWeight={700}
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {post.caption || "Sin titulo"}
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                <Stack direction="row" spacing={0.25} alignItems="center">
                  <VisibilityIcon sx={{ fontSize: 13, color: "text.tertiary" }} />
                  <Typography level="body-xs">{post.views || 0}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.25} alignItems="center">
                  <ThumbUpIcon sx={{ fontSize: 13, color: "text.tertiary" }} />
                  <Typography level="body-xs">{post.likes || 0}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.25} alignItems="center">
                  <ChatBubbleIcon sx={{ fontSize: 13, color: "text.tertiary" }} />
                  <Typography level="body-xs">{post.comments || 0}</Typography>
                </Stack>
              </Stack>
              {businessConnected && (
                <Chip
                  size="sm"
                  variant="soft"
                  color="success"
                  startDecorator={<CheckCircleIcon sx={{ fontSize: 12 }} />}
                  sx={{ mt: 0.5 }}
                >
                  Business API
                </Chip>
              )}
            </Box>
          </Stack>
          <IconButton size="sm" variant="plain" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Lista de comentarios */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
        }}
      >
        {loading ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <CircularProgress size="md" />
            <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
              Cargando comentarios...
            </Typography>
          </Stack>
        ) : comments.length === 0 ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <ChatBubbleIcon
              sx={{ fontSize: 40, color: "text.tertiary", opacity: 0.4 }}
            />
            <Typography level="body-md" fontWeight={600}>
              Sin comentarios
            </Typography>
            <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
              Los comentarios apareceran aqui despues del polling
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={0}>
            <Typography level="title-sm" fontWeight={700} sx={{ mb: 1.5 }}>
              Comentarios ({comments.length})
            </Typography>
            {comments.map((comment) => (
              <Box key={comment.id}>
                {/* Comentario principal */}
                {renderComment(comment)}

                {/* Botón Ver respuestas */}
                {comment.replies && comment.replies.length > 0 && (
                  <Box sx={{ ml: 4.5, mb: 1 }}>
                    <Typography
                      level="body-xs"
                      sx={{
                        color: "text.tertiary",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        "&:hover": { color: "primary.600" },
                      }}
                      onClick={() => toggleReplies(comment.id)}
                    >
                      {expandedReplies.has(comment.id) ? (
                        <ExpandLessIcon sx={{ fontSize: 16 }} />
                      ) : (
                        <ExpandMoreIcon sx={{ fontSize: 16 }} />
                      )}
                      {expandedReplies.has(comment.id)
                        ? "Ocultar respuestas"
                        : `Ver ${comment.replies.length} respuesta${comment.replies.length > 1 ? "s" : ""}`}
                    </Typography>
                  </Box>
                )}

                {/* Replies expandidos */}
                {expandedReplies.has(comment.id) &&
                  comment.replies?.map((reply) =>
                    renderComment(reply, true)
                  )}

                {/* Input de reply */}
                {replyingTo === comment.id && businessConnected && (
                  <Box sx={{ ml: 4, mb: 2, mt: 0.5 }}>
                    <Stack direction="row" spacing={1}>
                      <Input
                        size="sm"
                        placeholder="Escribe una respuesta..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleReply(comment.id);
                          }
                        }}
                        disabled={sending}
                        sx={{ flex: 1 }}
                      />
                      <IconButton
                        size="sm"
                        variant="solid"
                        color="primary"
                        onClick={() => handleReply(comment.id)}
                        disabled={sending || !replyText.trim()}
                      >
                        {sending ? (
                          <CircularProgress size="sm" />
                        ) : (
                          <SendIcon />
                        )}
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="soft"
                        color="success"
                        onClick={() => handleReply(comment.id, true)}
                        disabled={sending}
                        title="IA Responde"
                      >
                        <SmartToyIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                )}

                <Divider sx={{ my: 1 }} />
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Footer info */}
      {!businessConnected && (
        <Box
          sx={{
            p: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "warning.softBg",
          }}
        >
          <Typography level="body-xs" sx={{ color: "warning.700" }}>
            Conecta Business API desde la tab "Conexiones" para responder
            comentarios directamente.
          </Typography>
        </Box>
      )}
    </Drawer>
  );
}
