import React, { useState, useEffect } from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";

const StyledDialog = styled(Dialog)({
  "& .MuiDialog-paper": { borderRadius: 16, overflow: "hidden", maxWidth: 560 },
});

const Header = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 24px 12px",
});

const HeaderLeft = styled("div")({ display: "flex", alignItems: "center", gap: 12 });

const HeaderIcon = styled("div")({
  width: 40,
  height: 40,
  borderRadius: 10,
  background: "linear-gradient(135deg, #00A884 0%, #38f9d7 100%)",
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
  padding: "12px 24px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
});

const Hint = styled(Typography)(({ theme }) => ({
  fontSize: 12,
  color: theme.palette.mode === "dark" ? "#aaa" : "#777",
}));

const Row = styled("div")({ display: "flex", gap: 12 });

const StyledTextField = styled(TextField)({
  width: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: 10,
    fontSize: 14,
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#00A884" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#00A884" },
  },
  "& .MuiInputLabel-root.Mui-focused": { color: "#00A884" },
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
  "&:hover": { background: theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "#f9fafb" },
}));

const SaveBtn = styled(Button)({
  borderRadius: 10,
  padding: "8px 24px",
  textTransform: "none",
  fontWeight: 600,
  fontSize: 14,
  background: "linear-gradient(135deg, #00A884 0%, #38f9d7 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(0,168,132,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #009474 0%, #30e5c5 100%)",
    boxShadow: "0 4px 12px rgba(0,168,132,0.4)",
  },
});

const EMPTY = {
  welcomeMessage: "",
  servicePrompt: "",
  userPrompt: "",
  slotPrompt: "",
  successMessage: "",
  cancelMessage: "",
  slotsLimit: "",
  daysAhead: "",
};

interface FlowBuilderCitasModalProps {
  open: string | null;
  onSave: (data: any) => void;
  onUpdate: (data: any) => void;
  data: any;
  close: (value: any) => void;
}

const FlowBuilderCitasModal = ({ open, onSave, onUpdate, data, close }: FlowBuilderCitasModalProps) => {
  const [activeModal, setActiveModal] = useState(false);
  const [labels, setLabels] = useState({ title: "Agregar nodo de Citas", btn: "Agregar" });
  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar nodo de Citas", btn: "Guardar" });
      const d = data?.data || {};
      setForm({
        welcomeMessage: d.welcomeMessage || "",
        servicePrompt: d.servicePrompt || "",
        userPrompt: d.userPrompt || "",
        slotPrompt: d.slotPrompt || "",
        successMessage: d.successMessage || "",
        cancelMessage: d.cancelMessage || "",
        slotsLimit: d.slotsLimit != null ? String(d.slotsLimit) : "",
        daysAhead: d.daysAhead != null ? String(d.daysAhead) : "",
      });
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Agregar nodo de Citas", btn: "Agregar" });
      setForm({ ...EMPTY });
      setActiveModal(true);
    } else {
      setActiveModal(false);
    }
  }, [open, data]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = () => {
    const cfg: any = {};
    if (form.welcomeMessage.trim()) cfg.welcomeMessage = form.welcomeMessage.trim();
    if (form.servicePrompt.trim()) cfg.servicePrompt = form.servicePrompt.trim();
    if (form.userPrompt.trim()) cfg.userPrompt = form.userPrompt.trim();
    if (form.slotPrompt.trim()) cfg.slotPrompt = form.slotPrompt.trim();
    if (form.successMessage.trim()) cfg.successMessage = form.successMessage.trim();
    if (form.cancelMessage.trim()) cfg.cancelMessage = form.cancelMessage.trim();
    const sl = parseInt(form.slotsLimit, 10);
    if (Number.isFinite(sl) && sl > 0) cfg.slotsLimit = sl;
    const da = parseInt(form.daysAhead, 10);
    if (Number.isFinite(da) && da > 0) cfg.daysAhead = da;

    if (open === "edit") {
      onUpdate({ ...data, data: { ...cfg, type: "citas" } });
    } else {
      onSave(cfg);
    }
    handleClose();
  };

  return (
    <StyledDialog open={activeModal} onClose={handleClose} fullWidth maxWidth="sm">
      <Header>
        <HeaderLeft>
          <HeaderIcon>
            <EventAvailableIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>Agendamiento automático guiado por números</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      <Content>
        <Hint>
          Todos los textos son opcionales: si los dejas vacíos se usan mensajes por defecto. Los
          servicios, profesionales y horarios se listan automáticamente desde la configuración de
          citas de tu empresa.
        </Hint>

        <StyledTextField
          label="Mensaje de bienvenida (opcional)"
          value={form.welcomeMessage}
          onChange={set("welcomeMessage")}
          placeholder="¡Con gusto te ayudo a agendar tu cita! 📅"
          variant="outlined"
          size="small"
          multiline
          minRows={2}
        />
        <StyledTextField
          label="Pregunta de servicio"
          value={form.servicePrompt}
          onChange={set("servicePrompt")}
          placeholder="¿Qué servicio deseas agendar? 📋"
          variant="outlined"
          size="small"
        />
        <StyledTextField
          label="Pregunta de profesional"
          value={form.userPrompt}
          onChange={set("userPrompt")}
          placeholder="¿Con quién deseas la cita? 👤"
          variant="outlined"
          size="small"
        />
        <StyledTextField
          label="Pregunta de horario"
          value={form.slotPrompt}
          onChange={set("slotPrompt")}
          placeholder="Elige un horario disponible: 🕐"
          variant="outlined"
          size="small"
        />
        <StyledTextField
          label="Mensaje de éxito"
          value={form.successMessage}
          onChange={set("successMessage")}
          placeholder="✅ ¡Tu cita quedó agendada! Te enviaremos un recordatorio."
          variant="outlined"
          size="small"
          multiline
          minRows={2}
        />
        <StyledTextField
          label="Mensaje de cancelación"
          value={form.cancelMessage}
          onChange={set("cancelMessage")}
          placeholder="Entendido, no se agendó ninguna cita. 👋"
          variant="outlined"
          size="small"
        />
        <Row>
          <StyledTextField
            label="Nº de horarios a mostrar"
            value={form.slotsLimit}
            onChange={set("slotsLimit")}
            placeholder="8"
            type="number"
            variant="outlined"
            size="small"
          />
          <StyledTextField
            label="Días a futuro"
            value={form.daysAhead}
            onChange={set("daysAhead")}
            placeholder="14"
            type="number"
            variant="outlined"
            size="small"
          />
        </Row>
      </Content>

      <Actions>
        <CancelBtn onClick={handleClose}>Cancelar</CancelBtn>
        <SaveBtn onClick={handleSave}>{labels.btn}</SaveBtn>
      </Actions>
    </StyledDialog>
  );
};

export default FlowBuilderCitasModal;
