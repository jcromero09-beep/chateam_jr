import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";

const StyledDialog = styled(Dialog)({
  "& .MuiDialog-paper": {
    borderRadius: 16,
    overflow: "hidden",
    maxWidth: 480,
  },
});

const Header = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 24px 12px",
});

const HeaderLeft = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 12,
});

const HeaderIcon = styled("div")({
  width: 40,
  height: 40,
  borderRadius: 10,
  background: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  "& svg": { fontSize: 22 },
});

const HeaderTitle = styled(Typography)(({ theme }) => ({
  fontSize: 18,
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#fff" : "#1a1a2e",
  lineHeight: 1.3,
}));

const HeaderSubtitle = styled(Typography)(({ theme }) => ({
  fontSize: 12,
  color: theme.palette.mode === "dark" ? "#aaa" : "#888",
  marginTop: 2,
}));

const CloseBtn = styled(IconButton)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? "#aaa" : "#666",
  padding: 8,
  "&:hover": {
    background: theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
  },
}));

const Content = styled(DialogContent)({
  padding: "16px 24px 20px",
});

const StyledTextField = styled(TextField)({
  width: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: 10,
    fontSize: 14,
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "#a18cd1",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#a18cd1",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#a18cd1",
  },
});

const Actions = styled(DialogActions)({
  padding: "12px 24px 20px",
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  borderTop: "none",
});

const CancelBtn = styled(Button)(({ theme }) => ({
  borderRadius: 10,
  padding: "8px 20px",
  textTransform: "none",
  fontWeight: 500,
  fontSize: 14,
  color: theme.palette.mode === "dark" ? "#ccc" : "#555",
  border: `1px solid ${theme.palette.mode === "dark" ? "#444" : "#d0d5dd"}`,
  "&:hover": {
    background: theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "#f9fafb",
  },
}));

const SaveBtn = styled(Button)({
  borderRadius: 10,
  padding: "8px 24px",
  textTransform: "none",
  fontWeight: 600,
  fontSize: 14,
  background: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(161,140,209,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #917dbe 0%, #e8aed8 100%)",
    boxShadow: "0 4px 12px rgba(161,140,209,0.4)",
  },
});

const FlowBuilderIntervalModal = ({ open, onSave, data, onUpdate, close }) => {
  const isMounted = useRef(true);

  const [timerSec, setTimerSec] = useState(0);
  const [activeModal, setActiveModal] = useState(false);

  useEffect(() => {
    if (open === "edit") {
      setTimerSec(data.data.sec);
      setActiveModal(true);
    } else if (open === "create") {
      setTimerSec(0);
      setActiveModal(true);
    }
    return () => { isMounted.current = false; };
  }, [open]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleSaveContact = async () => {
    if (!timerSec || parseInt(timerSec) <= 0) {
      return toast.error("Añadir el valor del intervalo");
    }
    if (parseInt(timerSec) > 120) {
      return toast.error("Tiempo máximo alcanzado 120 segundos");
    }
    if (open === "edit") {
      onUpdate({ ...data, data: { sec: timerSec } });
    } else if (open === "create") {
      onSave({ sec: timerSec });
    }
    handleClose();
  };

  return (
    <StyledDialog
      open={activeModal}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
    >
      {/* Header */}
      <Header>
        <HeaderLeft>
          <HeaderIcon>
            <TimerOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>
              {open === "create" ? "Añadir intervalo" : "Editar intervalo"}
            </HeaderTitle>
            <HeaderSubtitle>Tiempo de espera en segundos (máx. 120)</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      {/* Content */}
      <Content>
        <StyledTextField
          label="Tiempo en segundos"
          name="timer"
          type="number"
          value={timerSec}
          onChange={e => setTimerSec(e.target.value)}
          autoFocus
          variant="outlined"
          InputProps={{ inputProps: { min: 0, max: 120 } }}
        />
      </Content>

      {/* Actions */}
      <Actions>
        <CancelBtn onClick={handleClose}>
          Cancelar
        </CancelBtn>
        <SaveBtn onClick={handleSaveContact}>
          {open === "create" ? "Añadir" : "Guardar"}
        </SaveBtn>
      </Actions>
    </StyledDialog>
  );
};

export default FlowBuilderIntervalModal;
