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
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Compressor from "compressorjs";
import CloseIcon from "@mui/icons-material/Close";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
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
  background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
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
    borderColor: "#f5576c",
    background: theme.palette.mode === "dark" ? "rgba(245,87,108,0.08)" : "rgba(245,87,108,0.04)",
  },
}));

const UploadIconWrapper = styled("div")(({ theme }) => ({
  width: 56,
  height: 56,
  borderRadius: 14,
  background: theme.palette.mode === "dark" ? "rgba(245,87,108,0.15)" : "rgba(245,87,108,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 14,
  "& svg": { fontSize: 28, color: "#f5576c" },
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
  background: theme.palette.mode === "dark" ? "#1a1a2e" : "#f8f9fb",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 16,
  position: "relative",
  border: `1px solid ${theme.palette.mode === "dark" ? "#333" : "#e8ecf0"}`,
  "& audio": {
    width: "100%",
    maxWidth: 400,
  },
}));

const RemoveBtn = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  top: 8,
  right: 8,
  background: theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
  color: theme.palette.mode === "dark" ? "#ccc" : "#666",
  padding: 6,
  "&:hover": {
    background: theme.palette.mode === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
  },
  "& svg": { fontSize: 18 },
}));

const CheckboxRow = styled(FormControlLabel)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 4,
  "& .MuiFormControlLabel-label": {
    fontSize: 13,
    color: theme.palette.mode === "dark" ? "#ccc" : "#555",
  },
  "& .MuiCheckbox-root.Mui-checked": {
    color: "#f5576c",
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

const SaveBtn = styled(Button)(({ theme }) => ({
  borderRadius: 10,
  padding: "8px 24px",
  textTransform: "none",
  fontWeight: 600,
  fontSize: 14,
  background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(245,87,108,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #e080ea 0%, #e04a60 100%)",
    boxShadow: "0 4px 12px rgba(245,87,108,0.4)",
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

const FlowBuilderAddAudioModal = ({ open, onSave, onUpdate, data, close }) => {
  const isMounted = useRef(true);
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [activeModal, setActiveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState(false);
  const [preview, setPreview] = useState();
  const [labels, setLabels] = useState({
    title: "Añadir audio al flujo",
    btn: "Añadir"
  });
  const [medias, setMedias] = useState([]);

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar audio", btn: "Guardar" });
      setPreview(`${import.meta.env.VITE_API_URL}/public/company${companyId}/flowbuilder/${data.data.url}`);
      setRecord(data.data.record);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir audio al flujo", btn: "Añadir" });
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
    setRecord(false);
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
        onSave({ url: res.data.name, record: record });
        toast.success("¡Audio añadido correctamente!");
        setLoading(false);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Error al subir el audio");
        setLoading(false);
      }
    }
  };

  const handleChangeMedias = e => {
    if (!e.target.files) return;
    if (e.target.files[0].size > 5000000) {
      toast.error("El archivo es demasiado grande. Máximo 5 MB");
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
            <MicNoneOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>Formato OGG / MP3 · Máximo 5 MB</HeaderSubtitle>
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
            <CircularProgress size={40} style={{ color: "#f5576c" }} />
            <LoadingText>Subiendo audio...</LoadingText>
          </LoadingBox>
        ) : preview ? (
          <PreviewContainer>
            <audio controls>
              <source src={preview} type="audio/mp3" />
              Tu navegador no soporta HTML5
            </audio>
            {open !== "edit" && (
              <RemoveBtn
                onClick={() => { setPreview(); setMedias([]); }}
                size="small"
              >
                <DeleteOutlineIcon />
              </RemoveBtn>
            )}
            <CheckboxRow
              control={
                <Checkbox
                  checked={record}
                  onChange={() => setRecord(old => !old)}
                  size="small"
                />
              }
              label="Enviar como audio grabado"
            />
          </PreviewContainer>
        ) : (
          <UploadZone>
            <UploadIconWrapper>
              <CloudUploadOutlinedIcon />
            </UploadIconWrapper>
            <UploadText>
              Haz clic para seleccionar un audio
            </UploadText>
            <UploadHint>
              Archivos OGG o MP3 · Máximo 5 MB
            </UploadHint>
            <input
              type="file"
              accept="audio/ogg, audio/mp3"
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

export default FlowBuilderAddAudioModal;
