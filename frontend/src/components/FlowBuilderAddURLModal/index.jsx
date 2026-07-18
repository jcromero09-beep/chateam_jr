import React, { useState } from "react";
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
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";

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
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
      borderColor: "#667eea",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#667eea",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#667eea",
  },
});

const UploadBtn = styled(Button)(({ theme }) => ({
  borderRadius: 10,
  padding: "10px 20px",
  textTransform: "none",
  fontWeight: 600,
  fontSize: 14,
  background: theme.palette.mode === "dark" ? "rgba(102,126,234,0.15)" : "rgba(102,126,234,0.08)",
  color: "#667eea",
  border: `1px dashed #667eea`,
  width: "100%",
  "&:hover": {
    background: theme.palette.mode === "dark" ? "rgba(102,126,234,0.25)" : "rgba(102,126,234,0.12)",
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
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(102,126,234,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #5a6fd6 0%, #6a4299 100%)",
    boxShadow: "0 4px 12px rgba(102,126,234,0.4)",
  },
});

const FlowBuilderAddURLModal = ({ open, close, onSave, data }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [sendURL, setSendURL] = useState("");
  const [imageBase64, setImageBase64] = useState("");

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClose = () => {
    close(null);
  };

  const handleSave = () => {
    const urlData = {
      title,
      description,
      buttonText,
      url: sendURL,
      image: imageBase64
    };
    onSave(urlData);
    close();
  };

  return (
    <StyledDialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
    >
      {/* Header */}
      <Header>
        <HeaderLeft>
          <HeaderIcon>
            <LinkOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>Configurar URL</HeaderTitle>
            <HeaderSubtitle>Configura el enlace y su apariencia</HeaderSubtitle>
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
            <input
              accept="image/*"
              style={{ display: "none" }}
              id="url-image-input"
              type="file"
              onChange={handleImageChange}
            />
            <label htmlFor="url-image-input">
              <UploadBtn
                component="span"
                startIcon={<CloudUploadOutlinedIcon />}
              >
                {imageBase64 ? "Imagen seleccionada" : "Subir imagen"}
              </UploadBtn>
            </label>
          </GridLegacy>
          <GridLegacy item xs={12}>
            <StyledTextField
              fullWidth
              label="Título"
              variant="outlined"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </GridLegacy>
          <GridLegacy item xs={12}>
            <StyledTextField
              fullWidth
              label="Descripción"
              variant="outlined"
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </GridLegacy>
          <GridLegacy item xs={12}>
            <StyledTextField
              fullWidth
              label="Texto del botón"
              variant="outlined"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
            />
          </GridLegacy>
          <GridLegacy item xs={12}>
            <StyledTextField
              fullWidth
              label="URL"
              variant="outlined"
              value={sendURL}
              onChange={(e) => setSendURL(e.target.value)}
            />
          </GridLegacy>
        </GridLegacy>
      </Content>

      {/* Actions */}
      <Actions>
        <CancelBtn onClick={handleClose}>
          Cancelar
        </CancelBtn>
        <SaveBtn onClick={handleSave}>
          Confirmar
        </SaveBtn>
      </Actions>
    </StyledDialog>
  );
};

export default FlowBuilderAddURLModal;
