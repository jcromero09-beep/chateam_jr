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
  ListAlt,
  MoveToInbox,
  LocalOffer,
} from "@mui/icons-material";
import React, { memo } from "react";

import { Handle } from "reactflow";

export default memo(({ data, isConnectable, id }) => {
  // Detectar el tipo de contenido basado en data
  const getContentInfo = () => {
    // Si tiene URL, es un archivo multimedia
    if (data.url) {
      const url = data.url.toLowerCase();

      if (url.endsWith('.pdf')) {
        return { icon: PictureAsPdf, label: 'PDF', color: '#FF9800', name: data.url, accent: '#FFF3E0' };
      } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return { icon: Image, label: 'Imagen', color: '#4CAF50', name: data.url, accent: '#E8F5E9' };
      } else if (url.match(/\.(mp3|ogg|wav|opus)$/)) {
        return { icon: MicNone, label: 'Audio', color: '#5AC2D2', name: data.url, accent: '#E0F7FA' };
      } else if (url.match(/\.(mp4|webm|avi)$/)) {
        return { icon: Videocam, label: 'Video', color: '#9C27B0', name: data.url, accent: '#F3E5F5' };
      }
    }

    // Si tiene type especificado
    if (data.type) {
      switch(data.type) {
        case 'image':
          return { icon: Image, label: 'Imagen', color: '#4CAF50', name: data.url || 'Imagen', accent: '#E8F5E9' };
        case 'pdf':
          return { icon: PictureAsPdf, label: 'PDF', color: '#FF9800', name: data.url || 'PDF', accent: '#FFF3E0' };
        case 'audio':
          return { icon: MicNone, label: 'Audio', color: '#5AC2D2', name: data.url || 'Audio', accent: '#E0F7FA' };
        case 'video':
          return { icon: Videocam, label: 'Video', color: '#9C27B0', name: data.url || 'Video', accent: '#F3E5F5' };
        case 'randomizer':
          return { icon: Shuffle, label: 'Aleatorio', color: '#E91E63', name: data.percent ? `${data.percent}%` : 'Aleatorio', accent: '#FCE4EC' };
        case 'interval':
          return { icon: AccessTime, label: 'Intervalo', color: '#FF5722', name: data.sec ? `${data.sec}s` : 'Intervalo', accent: '#FBE9E7' };
        case 'content':
          return { icon: Dashboard, label: 'Contenido', color: '#607D8B', name: `${data.seq?.length || 0} elementos`, accent: '#ECEFF1' };
        case 'url':
          return { icon: LinkIcon, label: 'URL', color: '#2196F3', name: data.url || 'Enlace', accent: '#E3F2FD' };
        case 'list':
          return { icon: ListAlt, label: 'Lista', color: '#009688', name: 'Lista de opciones', accent: '#E0F2F1' };
        case 'ticket':
          return { icon: MoveToInbox, label: 'Cola', color: '#7C3AED', name: data.queueName || 'Asignar cola', accent: '#EDE9FE' };
        case 'tag':
          return { icon: LocalOffer, label: 'Etiqueta', color: '#DB2777', name: data.tagName || 'Asignar etiqueta', accent: '#FCE7F3' };
        default:
          break;
      }
    }

    // Por defecto es un mensaje de texto
    return { icon: Message, label: 'Mensaje', color: '#3b82f6', name: data.label, accent: '#EFF6FF' };
  };

  const contentInfo = getContentInfo();
  const IconComponent = contentInfo.icon;

  return (
    <div
      style={{
        backgroundColor: "#FAFBFF",
        padding: "10px 12px",
        borderRadius: "10px",
        width: 190,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        border: `1.5px solid ${contentInfo.color}30`,
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
          cursor: 'pointer'
        }}
        onConnect={params => console.log("handle onConnect", params)}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#fff",
            width: "10px",
            height: "10px",
            marginLeft: "3.5px",
            marginBottom: "1px",
            pointerEvents: "none"
          }}
        />
      </Handle>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "6px",
        }}
      >
        <div style={{
          width: 26,
          height: 26,
          borderRadius: "6px",
          backgroundColor: contentInfo.accent || '#f0f0f0',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <IconComponent
            sx={{
              width: "16px",
              height: "16px",
              color: contentInfo.color,
            }}
          />
        </div>
        <div style={{ color: "#333", fontSize: "13px", fontWeight: 600 }}>{contentInfo.label}</div>
      </div>
      <div style={{
        color: "#666",
        fontSize: "11px",
        width: "100%",
        wordBreak: "break-word",
        lineHeight: 1.4,
        maxHeight: "40px",
        overflow: "hidden",
      }}>
        {contentInfo.name || data.label}
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
          cursor: 'pointer'
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
            pointerEvents: "none"
          }}
        />
      </Handle>
    </div>
  );
});