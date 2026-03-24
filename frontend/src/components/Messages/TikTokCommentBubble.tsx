/**
 * Component: TikTokCommentBubble
 * Renderiza un comentario de TikTok dentro de un ticket con preview de video y acciones
 */

import { Box, Typography, Stack, Chip, Button, AspectRatio, Card } from "@mui/joy";
import { OpenInNew as OpenInNewIcon, ThumbUp as ThumbUpIcon, Comment as CommentIcon } from "@mui/icons-material";

interface TikTokCommentData {
  tiktokCommentId: string;
  tiktokVideoId: string;
  tiktokVideoUrl: string;
  tiktokVideoTitle: string;
  tiktokVideoCover: string;
  likeCount: number;
  replyCount: number;
  parentCommentId: string | null;
}

interface TikTokCommentBubbleProps {
  message: {
    id: number;
    body: string;
    dataJson?: string;
    fromMe: boolean;
    createdAt: string;
  };
}

function parseCommentText(body: string): string {
  const separator = "───────────\n";
  const separatorIndex = body.indexOf(separator);
  if (separatorIndex !== -1) {
    return body.substring(separatorIndex + separator.length).trim();
  }
  return body.trim();
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default function TikTokCommentBubble({ message }: TikTokCommentBubbleProps) {
  const isOwn = message.fromMe;

  let data: TikTokCommentData | null = null;
  if (message.dataJson) {
    try {
      data = JSON.parse(message.dataJson) as TikTokCommentData;
    } catch {
      data = null;
    }
  }

  const commentText = parseCommentText(message.body);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        mb: 1,
      }}
    >
      <Card
        variant="outlined"
        sx={{
          maxWidth: 340,
          minWidth: 240,
          p: 0,
          overflow: "hidden",
          borderRadius: "12px",
          borderColor: isOwn ? "#3b82f620" : "divider",
          bgcolor: isOwn ? "#3b82f608" : "background.surface",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        {/* Encabezado TikTok */}
        <Box
          sx={{
            px: 1.5,
            py: 0.75,
            bgcolor: "#00000008",
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
          }}
        >
          {/* Icono TikTok SVG inline */}
          <Box
            component="svg"
            viewBox="0 0 24 24"
            sx={{ width: 14, height: 14, flexShrink: 0 }}
            fill="#000000"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.15a8.16 8.16 0 004.77 1.52V7.23a4.85 4.85 0 01-1-.54z" />
          </Box>
          <Typography
            level="body-xs"
            sx={{ color: "text.tertiary", fontWeight: 600, letterSpacing: 0.3 }}
          >
            Comentario de TikTok
          </Typography>
          {data?.parentCommentId && (
            <Chip size="sm" variant="soft" color="neutral" sx={{ fontSize: "10px", py: 0 }}>
              Respuesta
            </Chip>
          )}
        </Box>

        {/* Thumbnail del video */}
        {data?.tiktokVideoCover && (
          <Box sx={{ position: "relative" }}>
            <AspectRatio
              ratio="16/9"
              sx={{ maxHeight: 150, bgcolor: "#000" }}
              objectFit="cover"
            >
              <img
                src={data.tiktokVideoCover}
                alt={data.tiktokVideoTitle || "Video de TikTok"}
                style={{ objectFit: "cover", width: "100%", height: "100%" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </AspectRatio>
            {/* Overlay play icon */}
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 36,
                height: 36,
                borderRadius: "50%",
                bgcolor: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 0,
                  height: 0,
                  borderTop: "7px solid transparent",
                  borderBottom: "7px solid transparent",
                  borderLeft: "12px solid rgba(255,255,255,0.9)",
                  ml: "2px",
                  display: "block",
                }}
              />
            </Box>
          </Box>
        )}

        {/* Titulo del video */}
        {data?.tiktokVideoTitle && (
          <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
            <Typography
              level="body-xs"
              sx={{
                color: "text.tertiary",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                lineHeight: 1.4,
              }}
            >
              Video: {data.tiktokVideoTitle}
            </Typography>
          </Box>
        )}

        {/* Texto del comentario */}
        <Box sx={{ px: 1.5, pt: data?.tiktokVideoTitle ? 0.5 : 1, pb: 1 }}>
          <Typography
            level="body-md"
            sx={{
              color: "text.primary",
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}
          >
            {commentText}
          </Typography>
        </Box>

        {/* Chips de estadísticas */}
        {data && (
          <Box sx={{ px: 1.5, pb: 1 }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              <Chip
                size="sm"
                variant="soft"
                color="neutral"
                startDecorator={<ThumbUpIcon sx={{ fontSize: 12 }} />}
                sx={{ fontSize: "11px" }}
              >
                {(data.likeCount ?? 0).toLocaleString("es-ES")} likes
              </Chip>
              <Chip
                size="sm"
                variant="soft"
                color="neutral"
                startDecorator={<CommentIcon sx={{ fontSize: 12 }} />}
                sx={{ fontSize: "11px" }}
              >
                {(data.replyCount ?? 0).toLocaleString("es-ES")} respuestas
              </Chip>
            </Stack>
          </Box>
        )}

        {/* Footer: hora y boton TikTok */}
        <Box
          sx={{
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          {data?.tiktokVideoUrl && (
            <Button
              component="a"
              href={data.tiktokVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="solid"
              color="neutral"
              size="sm"
              fullWidth
              endDecorator={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              sx={{
                borderRadius: 0,
                bgcolor: "#000000",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "12px",
                py: 0.875,
                "&:hover": {
                  bgcolor: "#333333",
                },
                "&:active": {
                  bgcolor: "#222222",
                },
              }}
            >
              Abrir en TikTok para Responder
            </Button>
          )}
        </Box>

        {/* Hora del mensaje */}
        <Box sx={{ px: 1.5, py: 0.5, display: "flex", justifyContent: "flex-end" }}>
          <Typography
            sx={{
              fontSize: "10px",
              color: "text.tertiary",
              userSelect: "none",
            }}
          >
            {formatTime(message.createdAt)}
          </Typography>
        </Box>
      </Card>
    </Box>
  );
}
