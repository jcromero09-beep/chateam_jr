import {
  ArrowForwardIos,
  Message,
  Image,
  PictureAsPdf,
  MicNone,
  Videocam
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
        return { icon: PictureAsPdf, label: 'PDF', color: '#FF9800', name: data.url };
      } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return { icon: Image, label: 'Imagen', color: '#4CAF50', name: data.url };
      } else if (url.match(/\.(mp3|ogg|wav|opus)$/)) {
        return { icon: MicNone, label: 'Audio', color: '#5AC2D2', name: data.url };
      } else if (url.match(/\.(mp4|webm|avi)$/)) {
        return { icon: Videocam, label: 'Video', color: '#9C27B0', name: data.url };
      }
    }

    // Si tiene type especificado
    if (data.type) {
      switch(data.type) {
        case 'image':
          return { icon: Image, label: 'Imagen', color: '#4CAF50', name: data.url || 'Imagen' };
        case 'pdf':
          return { icon: PictureAsPdf, label: 'PDF', color: '#FF9800', name: data.url || 'PDF' };
        case 'audio':
          return { icon: MicNone, label: 'Audio', color: '#5AC2D2', name: data.url || 'Audio' };
        case 'video':
          return { icon: Videocam, label: 'Video', color: '#9C27B0', name: data.url || 'Video' };
        default:
          break;
      }
    }

    // Por defecto es un mensaje de texto
    return { icon: Message, label: 'Mensagem', color: '#ededed', name: data.label };
  };

  const contentInfo = getContentInfo();
  const IconComponent = contentInfo.icon;

  return (
    <div
      style={{ backgroundColor: "#555", padding: "8px", borderRadius: "8px" }}
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
            color: "#ffff",
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
          color: "#ededed",
          fontSize: "16px",
          flexDirection: "row",
          display: "flex"
        }}
      >
        <IconComponent
          sx={{
            width: "16px",
            height: "16px",
            marginRight: "4px",
            marginTop: "4px",
            color: contentInfo.color
          }}
        />
        <div style={{ color: "#ededed", fontSize: "16px" }}>{contentInfo.label}</div>
      </div>
      <div style={{ color: "#ededed", fontSize: "12px", width: 180, wordBreak: "break-word" }}>
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
            color: "#ffff",
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