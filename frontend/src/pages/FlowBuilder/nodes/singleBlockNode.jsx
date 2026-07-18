/**
 * singleBlockNode — Componente de nodo "Bloque Único" para React Flow.
 *
 * Renderiza un bloque que agrupa varios elementos secuenciales (mensajes,
 * imágenes, PDFs, audios, videos, intervalos, randomizer) en el orden definido
 * por `data.seq` y `data.elements`.
 *
 * Usado por el flujo demo (creado por `CreateCompanyService.ts`) y por
 * cualquier nodo que use `type: "singleBlock"`.
 *
 * Estructura esperada:
 *   data: {
 *     seq: ["message0", "message1", ...],
 *     elements: [
 *       { type: "message", value: "Hola", number: "message0" },
 *       { type: "image", value: "url", number: "message1" },
 *       ...
 *     ]
 *   }
 */
import {
  ArrowForwardIos,
  Message,
  Image,
  PictureAsPdf,
  MicNone,
  Videocam,
  Shuffle,
  AccessTime,
  Dashboard,
  Link as LinkIcon,
} from "@mui/icons-material";
import React, { memo } from "react";
import { Handle } from "reactflow";

const ELEMENT_META = {
  message: { icon: Message, label: "Mensaje", color: "#3b82f6" },
  text: { icon: Message, label: "Texto", color: "#3b82f6" },
  image: { icon: Image, label: "Imagen", color: "#4CAF50" },
  pdf: { icon: PictureAsPdf, label: "PDF", color: "#FF9800" },
  audio: { icon: MicNone, label: "Audio", color: "#5AC2D2" },
  video: { icon: Videocam, label: "Video", color: "#9C27B0" },
  url: { icon: LinkIcon, label: "URL", color: "#2196F3" },
  interval: { icon: AccessTime, label: "Intervalo", color: "#FF5722" },
  randomizer: { icon: Shuffle, label: "Aleatorio", color: "#E91E63" },
};

const truncate = (text, max = 60) => {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
};

export default memo(({ data, isConnectable }) => {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const totalElements = elements.length;

  // Ordenar por `seq` si existe; si no, usar el orden del array.
  const orderedElements = Array.isArray(data?.seq) && data.seq.length > 0
    ? data.seq
        .map((key) => elements.find((el) => el?.number === key))
        .filter(Boolean)
    : elements;

  // Tomar hasta los 3 primeros elementos para la vista previa
  const previewItems = orderedElements.slice(0, 3);
  const remaining = Math.max(0, orderedElements.length - previewItems.length);

  return (
    <div
      style={{
        backgroundColor: "#FAFBFF",
        padding: "10px 12px",
        borderRadius: "10px",
        width: 210,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        border: "1.5px solid #5AC2D230",
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: "#5AC2D2",
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#fff",
            width: "10px",
            height: "10px",
            marginLeft: "3.5px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>

      {/* Encabezado */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "6px",
            backgroundColor: "#ECEFF1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Dashboard sx={{ width: "16px", height: "16px", color: "#607D8B" }} />
        </div>
        <div style={{ color: "#333", fontSize: "13px", fontWeight: 600 }}>
          Bloque ({totalElements})
        </div>
      </div>

      {/* Lista de elementos en preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {previewItems.map((el, idx) => {
          const meta = ELEMENT_META[el?.type] || ELEMENT_META.message;
          const Icon = meta.icon;
          return (
            <div
              key={`el-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "11px",
                color: "#555",
                lineHeight: 1.3,
              }}
            >
              <Icon
                sx={{
                  width: "12px",
                  height: "12px",
                  color: meta.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {truncate(el?.value, 38) || meta.label}
              </span>
            </div>
          );
        })}
        {remaining > 0 && (
          <div
            style={{
              fontSize: "10px",
              color: "#999",
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            +{remaining} más…
          </div>
        )}
        {totalElements === 0 && (
          <div style={{ fontSize: "11px", color: "#999", fontStyle: "italic" }}>
            Bloque vacío
          </div>
        )}
      </div>

      <Handle
        type="source"
        position="right"
        id="a"
        style={{
          background: "#5AC2D2",
          width: "18px",
          height: "18px",
          top: "70%",
          right: "-11px",
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#fff",
            width: "10px",
            height: "10px",
            marginLeft: "2.9px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>
    </div>
  );
});
