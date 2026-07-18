import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";

import api from "../../services/api";

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
  background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
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

const UploadZone = styled("label")(({ theme }) => ({
  border: `2px dashed ${theme.palette.mode === "dark" ? "#555" : "#d0d5dd"}`,
  borderRadius: 12,
  padding: "36px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.2s ease",
  background: theme.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "#fafbfc",
  "&:hover": {
    borderColor: "#ff6b6b",
    background: theme.palette.mode === "dark" ? "rgba(255,107,107,0.08)" : "rgba(255,107,107,0.04)",
  },
}));

const UploadIconWrapper = styled("div")(({ theme }) => ({
  width: 56,
  height: 56,
  borderRadius: 14,
  background: theme.palette.mode === "dark" ? "rgba(255,107,107,0.15)" : "rgba(255,107,107,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 14,
  "& svg": { fontSize: 28, color: "#ff6b6b" },
}));

const UploadText = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#e0e0e0" : "#344054",
  marginBottom: 4,
}));

const UploadHint = styled(Typography)(({ theme }) => ({
  fontSize: 12,
  color: theme.palette.mode === "dark" ? "#999" : "#98a2b3",
}));

const PreviewContainer = styled("div")(({ theme }) => ({
  borderRadius: 12,
  overflow: "hidden",
  position: "relative",
  border: `1px solid ${theme.palette.mode === "dark" ? "#333" : "#e8ecf0"}`,
  background: theme.palette.mode === "dark" ? "#1a1a2e" : "#f8f9fb",
  padding: "20px 24px",
  display: "flex",
  alignItems: "center",
  gap: 16,
}));

const PdfIcon = styled("div")({
  width: 52,
  height: 52,
  borderRadius: 12,
  background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  "& svg": { fontSize: 28, color: "#fff" },
});

const PdfInfo = styled("div")({
  flex: 1,
  minWidth: 0,
});

const PdfName = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#e0e0e0" : "#344054",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}));

const PdfSize = styled(Typography)(({ theme }) => ({
  fontSize: 12,
  color: theme.palette.mode === "dark" ? "#999" : "#98a2b3",
  marginTop: 2,
}));

const RemoveBtn = styled(IconButton)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? "#ff6b6b" : "#e55353",
  padding: 8,
  flexShrink: 0,
  "&:hover": {
    background: "rgba(229,83,83,0.08)",
  },
  "& svg": { fontSize: 20 },
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

const SaveBtn = styled(Button)(({ theme }) => ({
  borderRadius: 10,
  padding: "8px 24px",
  textTransform: "none",
  fontWeight: 600,
  fontSize: 14,
  background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(255,107,107,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #e85d5d 0%, #d94f1e 100%)",
    boxShadow: "0 4px 12px rgba(255,107,107,0.4)",
  },
  "&:disabled": {
    background: theme.palette.mode === "dark" ? "#444" : "#e0e0e0",
    color: theme.palette.mode === "dark" ? "#777" : "#999",
    boxShadow: "none",
  },
}));

const LoadingBox = styled("div")({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  padding: "24px 0",
});

const LoadingText = styled(Typography)(({ theme }) => ({
  fontSize: 13,
  color: theme.palette.mode === "dark" ? "#aaa" : "#666",
}));

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const FlowBuilderAddPdfModal = ({ open, onSave, onUpdate, data, close }) => {
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [labels, setLabels] = useState({
    title: "Añadir PDF al flujo",
    btn: "Añadir"
  });

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar PDF", btn: "Guardar" });
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir PDF al flujo", btn: "Añadir" });
      setSelectedFile(null);
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
    setSelectedFile(null);
  };

  const handleSaveContact = async () => {
    if (open === "edit") {
      handleClose();
      onUpdate({
        ...data,
        data: { url: "" }
      });
      return;
    } else if (open === "create") {
      if (!selectedFile) return;
      setLoading(true);

      const formData = new FormData();
      formData.append("fromMe", true);
      formData.append("medias", selectedFile);
      formData.append("body", selectedFile.name);

      try {
        const res = await api.post("/flowbuilder/img", formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        handleClose();
        onSave({ url: res.data.name });
        toast.success("¡PDF añadido correctamente!");
        if (isMounted.current) setLoading(false);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Error al subir el PDF");
        if (isMounted.current) setLoading(false);
      }
    }
  };

  const handleChangeFile = e => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande. Máximo 5 MB");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Solo se permiten archivos PDF");
      return;
    }

    setSelectedFile(file);
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
            <DescriptionOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>PDF · Máximo 5 MB</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      {/* Content */}
      <Content>
        {loading ? (
          <LoadingBox>
            <CircularProgress size={40} style={{ color: "#ff6b6b" }} />
            <LoadingText>Subiendo PDF...</LoadingText>
          </LoadingBox>
        ) : selectedFile ? (
          <PreviewContainer>
            <PdfIcon>
              <InsertDriveFileOutlinedIcon />
            </PdfIcon>
            <PdfInfo>
              <PdfName>{selectedFile.name}</PdfName>
              <PdfSize>{formatFileSize(selectedFile.size)}</PdfSize>
            </PdfInfo>
            {open !== "edit" && (
              <RemoveBtn
                onClick={() => setSelectedFile(null)}
                size="small"
              >
                <DeleteOutlineIcon />
              </RemoveBtn>
            )}
          </PreviewContainer>
        ) : (
          <UploadZone>
            <UploadIconWrapper>
              <CloudUploadOutlinedIcon />
            </UploadIconWrapper>
            <UploadText>
              Haz clic para seleccionar un PDF
            </UploadText>
            <UploadHint>
              Archivos PDF · Máximo 5 MB
            </UploadHint>
            <input
              type="file"
              accept=".pdf,application/pdf"
              hidden
              onChange={handleChangeFile}
            />
          </UploadZone>
        )}
      </Content>

      {/* Actions */}
      {!loading && (
        <Actions>
          <CancelBtn onClick={handleClose}>
            Cancelar
          </CancelBtn>
          {open !== "edit" && (
            <SaveBtn
              onClick={handleSaveContact}
              disabled={!selectedFile}
            >
              {labels.btn}
            </SaveBtn>
          )}
        </Actions>
      )}
    </StyledDialog>
  );
};

export default FlowBuilderAddPdfModal;
