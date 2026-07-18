import { ArrowForwardIos, EventAvailable } from "@mui/icons-material";
import React, { memo } from "react";
import { Handle } from "reactflow";

// Nodo "Citas": agenda una cita de forma conversacional (servicio → profesional →
// horario → confirmar). Es TERMINAL (el flujo finaliza al agendar/cancelar), por eso
// solo tiene handle de entrada.
export default memo(({ data, isConnectable }) => {
  return (
    <div
      style={{
        backgroundColor: "#FAFBFF",
        padding: "8px",
        borderRadius: "8px",
        maxWidth: "210px",
        boxShadow: "0px 3px 5px rgba(0,0,0,.05)",
        border: "1px solid rgba(0, 168, 132, 0.4)",
        width: 200
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: "#00A884",
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: "pointer"
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
            pointerEvents: "none"
          }}
        />
      </Handle>
      <div style={{ flexDirection: "row", display: "flex", alignItems: "center" }}>
        <EventAvailable
          sx={{ width: "18px", height: "18px", marginRight: "5px", color: "#00A884" }}
        />
        <div style={{ color: "#232323", fontSize: "15px", fontWeight: 600 }}>Citas</div>
      </div>
      <div style={{ color: "#5a5a5a", fontSize: "11px", marginTop: "6px", lineHeight: 1.35 }}>
        {data?.welcomeMessage
          ? data.welcomeMessage
          : "Agenda una cita paso a paso: servicio → profesional → horario → confirmar."}
      </div>
    </div>
  );
});
