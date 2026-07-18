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
import MessageOutlinedIcon from "@mui/icons-material/MessageOutlined";

const StyledDialog = styled(Dialog)({
  "& .MuiDialog-paper": {
    borderRadius: 16,
    overflow: "hidden",
    maxWidth: 520,
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
  background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
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
      borderColor: "#4facfe",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#4facfe",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#4facfe",
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
  background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(79,172,254,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #3d9be8 0%, #00dde8 100%)",
    boxShadow: "0 4px 12px rgba(79,172,254,0.4)",
  },
});

const FlowBuilderAddTextModal = ({ open, onSave, onUpdate, data, close }) => {
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);
  const [labels, setLabels] = useState({
    title: "Añadir mensaje al flujo",
    btn: "Añadir"
  });
  const [textDig, setTextDig] = useState();

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar mensaje", btn: "Guardar" });
      setTextDig(data.data.label);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir mensaje al flujo", btn: "Añadir" });
      setTextDig("");
      setActiveModal(true);
    } else {
      setActiveModal(false);
    }
  }, [open]);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleSaveContact = async () => {
    if (open === "edit") {
      handleClose();
      onUpdate({ ...data, data: { label: textDig } });
      return;
    } else if (open === "create") {
      handleClose();
      onSave({ text: textDig });
    }
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
            <MessageOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>Escribe el mensaje de texto</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      {/* Content */}
      <Content>
        <StyledTextField
          label="Mensaje"
          multiline
          rows={7}
          name="text"
          variant="outlined"
          value={textDig}
          onChange={e => setTextDig(e.target.value)}
          autoFocus
        />
      </Content>

      {/* Actions */}
      <Actions>
        <CancelBtn onClick={handleClose}>
          Cancelar
        </CancelBtn>
        <SaveBtn onClick={handleSaveContact}>
          {labels.btn}
        </SaveBtn>
      </Actions>
    </StyledDialog>
  );
};

export default FlowBuilderAddTextModal;
