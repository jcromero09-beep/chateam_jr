import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import CloseIcon from "@mui/icons-material/Close";
import ShuffleOutlinedIcon from "@mui/icons-material/ShuffleOutlined";

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
  background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
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
  padding: "20px 24px 24px",
});

const SliderContainer = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 20,
  padding: "16px 0",
});

const PercentText = styled(Typography)(({ theme }) => ({
  fontSize: 20,
  fontWeight: 700,
  color: theme.palette.mode === "dark" ? "#f6d365" : "#e8a020",
  minWidth: 50,
  textAlign: "center",
}));

const StyledSlider = styled(Slider)(({ theme }) => ({
  color: "#fda085",
  "& .MuiSlider-thumb": {
    width: 20,
    height: 20,
    background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    boxShadow: "0 2px 8px rgba(253,160,133,0.4)",
  },
  "& .MuiSlider-track": {
    background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    border: "none",
  },
  "& .MuiSlider-rail": {
    background: theme.palette.mode === "dark" ? "#444" : "#e0e0e0",
  },
  "& .MuiSlider-mark": {
    background: theme.palette.mode === "dark" ? "#555" : "#ccc",
  },
}));

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
  background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(253,160,133,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #e8c358 0%, #e89078 100%)",
    boxShadow: "0 4px 12px rgba(253,160,133,0.4)",
  },
});

const FlowBuilderRandomizerModal = ({ open, onSave, data, onUpdate, close }) => {
  const isMounted = useRef(true);

  const [percent, setPercent] = useState(0);
  const [activeModal, setActiveModal] = useState(false);

  useEffect(() => {
    if (open === "edit") {
      setPercent(data.data.percent);
      setActiveModal(true);
    } else if (open === "create") {
      setPercent(0);
      setActiveModal(true);
    }
    return () => { isMounted.current = false; };
  }, [open]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleValue = (event, newValue) => {
    setPercent(newValue);
  };

  const handleSaveContact = async () => {
    if (!percent || parseInt(percent) <= 0) {
      return toast.error("Añadir el valor del intervalo");
    }
    if (parseInt(percent) > 120) {
      return toast.error("Tiempo máximo alcanzado 120 segundos");
    }
    if (open === "edit") {
      onUpdate({ ...data, data: { percent: percent } });
    } else if (open === "create") {
      onSave({ percent: percent });
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
            <ShuffleOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>
              {open === "create" ? "Añadir aleatorizador" : "Editar aleatorizador"}
            </HeaderTitle>
            <HeaderSubtitle>Configura el porcentaje de distribución</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      {/* Content */}
      <Content>
        <SliderContainer>
          <PercentText>{percent}%</PercentText>
          <StyledSlider
            defaultValue={percent}
            valueLabelDisplay="auto"
            onChange={handleValue}
            step={10}
            marks
            min={0}
            max={100}
          />
          <PercentText>{100 - percent}%</PercentText>
        </SliderContainer>
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

export default FlowBuilderRandomizerModal;
