import React, { useState, useEffect } from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import GridLegacy from "@mui/material/GridLegacy";
import CloseIcon from "@mui/icons-material/Close";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import { Add, Delete } from "@mui/icons-material";
import toastError from "../../errors/toastError";

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
  background: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
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
  "& .MuiOutlinedInput-root": {
    borderRadius: 10,
    fontSize: 14,
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "#66a6ff",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#66a6ff",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#66a6ff",
  },
});

const OptionsLabel = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#e0e0e0" : "#344054",
  marginBottom: 8,
}));

const OptionRow = styled("div")({
  display: "flex",
  alignItems: "center",
  marginBottom: 8,
  gap: 8,
});

const DeleteBtn = styled(IconButton)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? "#ff6b6b" : "#e55353",
  padding: 6,
  "&:hover": {
    background: "rgba(229,83,83,0.08)",
  },
}));

const AddOptionBtn = styled(Button)({
  borderRadius: 10,
  padding: "6px 16px",
  textTransform: "none",
  fontWeight: 500,
  fontSize: 13,
  color: "#66a6ff",
  borderColor: "#66a6ff",
  "&:hover": {
    borderColor: "#5590e8",
    background: "rgba(102,166,255,0.06)",
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
  background: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(102,166,255,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #7ae4eb 0%, #5590e8 100%)",
    boxShadow: "0 4px 12px rgba(102,166,255,0.4)",
  },
});

const FlowBuilderAddListModal = ({ open, onClose, onSave, onUpdate, data, close }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState([""]);
  const [activeModal, setActiveModal] = useState(false);
  const [labels, setLabels] = useState({
    title: "Crear lista",
    btn: "Crear"
  });

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar lista", btn: "Actualizar" });
      if (data && data.data) {
        setTitle(data.data.title || "");
        setDescription(data.data.description || "");
        setOptions((data.data.options || []).map(opt => typeof opt === "string" ? opt : opt.text));
      }
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Crear lista", btn: "Crear" });
      setTitle("");
      setDescription("");
      setOptions([""]);
      setActiveModal(true);
    } else {
      setActiveModal(false);
    }
  }, [open]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
    setTitle("");
    setDescription("");
    setOptions([""]);
  };

  const handleSave = () => {
    if (!title.trim()) {
      toastError("El título es requerido");
      return;
    }

    const validOptions = options.map(opt => opt.trim()).filter(opt => opt !== "");
    if (validOptions.length === 0) {
      toastError("Debe tener al menos una opción");
      return;
    }

    const uniqueOptions = new Set(validOptions);
    if (uniqueOptions.size !== validOptions.length) {
      toastError("No se permiten opciones duplicadas");
      return;
    }

    const listData = {
      title: title.trim(),
      description: description.trim(),
      options: validOptions.map(opt => ({ text: opt.trim(), value: opt.trim() }))
    };

    if (open === "edit") {
      onUpdate({ ...data, data: listData });
    } else {
      onSave(listData);
    }
    handleClose();
  };

  const addOption = () => {
    setOptions([...options, ""]);
  };

  const removeOption = (index) => {
    if (options.length > 1) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
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
            <ViewListOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>Configura título, descripción y opciones</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      {/* Content */}
      <Content>
        <GridLegacy container spacing={2}>
          <GridLegacy item xs={12}>
            <StyledTextField
              fullWidth
              label="Título"
              variant="outlined"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </GridLegacy>
          <GridLegacy item xs={12}>
            <StyledTextField
              fullWidth
              label="Descripción"
              variant="outlined"
              multiline
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </GridLegacy>
          <GridLegacy item xs={12}>
            <OptionsLabel>Opciones</OptionsLabel>
            {options.map((option, index) => (
              <OptionRow key={index}>
                <StyledTextField
                  label={`Opción ${index + 1}`}
                  variant="outlined"
                  size="small"
                  value={option}
                  onChange={e => updateOption(index, e.target.value)}
                  style={{ flex: 1 }}
                />
                <DeleteBtn
                  onClick={() => removeOption(index)}
                  disabled={options.length === 1}
                  size="small"
                >
                  <Delete fontSize="small" />
                </DeleteBtn>
              </OptionRow>
            ))}
            <AddOptionBtn
              startIcon={<Add />}
              onClick={addOption}
              variant="outlined"
              size="small"
            >
              Agregar opción
            </AddOptionBtn>
          </GridLegacy>
        </GridLegacy>
      </Content>

      {/* Actions */}
      <Actions>
        <CancelBtn onClick={handleClose}>
          Cancelar
        </CancelBtn>
        <SaveBtn onClick={handleSave}>
          {labels.btn}
        </SaveBtn>
      </Actions>
    </StyledDialog>
  );
};

export default FlowBuilderAddListModal;
