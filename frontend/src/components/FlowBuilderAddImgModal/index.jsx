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
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
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
  background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
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
    borderColor: "#43e97b",
    background: theme.palette.mode === "dark" ? "rgba(67,233,123,0.08)" : "rgba(67,233,123,0.04)",
  },
}));

const UploadIconWrapper = styled("div")(({ theme }) => ({
  width: 56,
  height: 56,
  borderRadius: 14,
  background: theme.palette.mode === "dark" ? "rgba(67,233,123,0.15)" : "rgba(67,233,123,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 14,
  "& svg": { fontSize: 28, color: "#43e97b" },
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
  "& img": {
    width: "100%",
    maxHeight: 350,
    objectFit: "contain",
    display: "block",
  },
}));

const RemoveBtn = styled(IconButton)({
  position: "absolute",
  top: 8,
  right: 8,
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  padding: 6,
  "&:hover": { background: "rgba(0,0,0,0.7)" },
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
  background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(67,233,123,0.3)",
  "&:hover": {
    background: "linear-gradient(135deg, #38d66c 0%, #30e5c5 100%)",
    boxShadow: "0 4px 12px rgba(67,233,123,0.4)",
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

const FlowBuilderAddImgModal = ({ open, onSave, onUpdate, data, close }) => {
  const isMounted = useRef(true);
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [activeModal, setActiveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState();
  const [labels, setLabels] = useState({
    title: "Añadir imagen al flujo",
    btn: "Añadir"
  });
  const [medias, setMedias] = useState([]);

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar imagen", btn: "Guardar" });
      setPreview(`${import.meta.env.VITE_API_URL}/public/company${companyId}/flowbuilder/${data.data.url}`);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir imagen al flujo", btn: "Añadir" });
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
        data: { url: "" }
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
        const res = await api.post("/flowbuilder/img", formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        handleClose();
        onSave({ url: res.data.name });
        toast.success("¡Imagen añadida correctamente!");
        setLoading(false);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Error al subir la imagen");
        setLoading(false);
      }
    }
  };

  const handleChangeMedias = e => {
    if (!e.target.files) return;
    if (e.target.files[0].size > 2000000) {
      toast.error("El archivo es demasiado grande. Máximo 2 MB");
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
            <ImageOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>PNG / JPG · Máximo 2 MB</HeaderSubtitle>
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
            <CircularProgress size={40} style={{ color: "#43e97b" }} />
            <LoadingText>Subiendo imagen...</LoadingText>
          </LoadingBox>
        ) : preview ? (
          <PreviewContainer>
            <img src={preview} alt="Preview" />
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
              Haz clic para seleccionar una imagen
            </UploadText>
            <UploadHint>
              Archivos PNG o JPG · Máximo 2 MB
            </UploadHint>
            <input
              type="file"
              accept="image/png, image/jpg, image/jpeg"
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
          {open !== "edit" && (
            <SaveBtn
              onClick={handleSaveContact}
              disabled={!preview}
            >
              {labels.btn}
            </SaveBtn>
          )}
        </Actions>
      )}
    </StyledDialog>
  );
};

export default FlowBuilderAddImgModal;
