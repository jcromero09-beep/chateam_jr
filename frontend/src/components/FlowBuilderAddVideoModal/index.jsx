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
import Compressor from "compressorjs";
import CloseIcon from "@mui/icons-material/Close";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import api from "../../services/api";
import { useAuth } from "../../hooks/useAuth";

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
  borderBottom: "none",
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
    borderColor: "#667eea",
    background: theme.palette.mode === "dark" ? "rgba(102,126,234,0.08)" : "rgba(102,126,234,0.04)",
  },
}));

const UploadIconWrapper = styled("div")(({ theme }) => ({
  width: 56,
  height: 56,
  borderRadius: 14,
  background: theme.palette.mode === "dark" ? "rgba(102,126,234,0.15)" : "rgba(102,126,234,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 14,
  "& svg": { fontSize: 28, color: "#667eea" },
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

const PreviewContainer = styled("div")({
  borderRadius: 12,
  overflow: "hidden",
  background: "#000",
  position: "relative",
  "& video": {
    width: "100%",
    maxHeight: 300,
    display: "block",
  },
});

const RemoveBtn = styled(IconButton)({
  position: "absolute",
  top: 8,
  right: 8,
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  padding: 6,
  "&:hover": { background: "rgba(0,0,0,0.8)" },
  "& svg": { fontSize: 18 },
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

const SaveBtn = styled(Button)(({ theme }) => ({
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

const FlowBuilderAddVideoModal = ({ open, onSave, onUpdate, data, close }) => {
  const isMounted = useRef(true);
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [activeModal, setActiveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState(false);
  const [preview, setPreview] = useState();
  const [labels, setLabels] = useState({
    title: "Añadir vídeo al flujo",
    btn: "Añadir"
  });
  const [medias, setMedias] = useState([]);

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar vídeo", btn: "Guardar" });
      setPreview(`${import.meta.env.VITE_API_URL}/public/company${companyId}/flowbuilder/${data.data.url}`);
      setRecord(data.data.record);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir vídeo al flujo", btn: "Añadir" });
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
    setMedias([]);
    setPreview();
  };

  const handleSaveContact = async () => {
    if (open === "edit") {
      handleClose();
      onUpdate({
        ...data,
        data: { url: data.data.url, record: record }
      });
      return;
    } else if (open === "create") {
      setLoading(true);
      const formData = new FormData();
      formData.append("fromMe", true);
      formData.append("typeArch", "flowbuilder");

      try {
        const compressionPromises = medias.map((media) => {
          return new Promise((resolve, reject) => {
            if (!media) { resolve(); return; }
            if (media?.type.split("/")[0] === "image") {
              new Compressor(media, {
                quality: 0.7,
                success(compressedMedia) {
                  formData.append("medias", compressedMedia);
                  formData.append("body", compressedMedia.name);
                  resolve();
                },
                error(err) { reject(err); }
              });
            } else {
              formData.append("medias", media);
              formData.append("body", media.name);
              resolve();
            }
          });
        });

        await Promise.all(compressionPromises);
        const res = await api.post("/flowbuilder/audio", formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        handleClose();
        onSave({ url: res.data.name });
        toast.success("¡Video añadido correctamente!");
        setLoading(false);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Error al subir el video");
        setLoading(false);
      }
    }
  };

  const handleChangeMedias = e => {
    if (!e.target.files) return;
    if (e.target.files[0].size > 20000000) {
      toast.error("El archivo es demasiado grande. Máximo 20 MB");
      return;
    }
    const selectedMedias = Array.from(e.target.files);
    setPreview(URL.createObjectURL(e.target.files[0]));
    setMedias(selectedMedias);
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
            <VideocamOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>Formato MP4 · Máximo 20 MB</HeaderSubtitle>
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
            <CircularProgress size={40} style={{ color: "#667eea" }} />
            <LoadingText>Subiendo vídeo...</LoadingText>
          </LoadingBox>
        ) : preview ? (
          <PreviewContainer>
            <video controls>
              <source src={preview} type="video/mp4" />
              Tu navegador no soporta HTML5
            </video>
            {open !== "edit" && (
              <RemoveBtn
                onClick={() => { setPreview(); setMedias([]); }}
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
              Haz clic para seleccionar un vídeo
            </UploadText>
            <UploadHint>
              Solo archivos MP4 · Máximo 20 MB
            </UploadHint>
            <input
              type="file"
              accept="video/mp4"
              hidden
              onChange={handleChangeMedias}
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
          <SaveBtn
            onClick={handleSaveContact}
            disabled={!preview && open !== "edit"}
          >
            {labels.btn}
          </SaveBtn>
        </Actions>
      )}
    </StyledDialog>
  );
};

export default FlowBuilderAddVideoModal;
