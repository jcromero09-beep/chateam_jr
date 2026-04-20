import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CircularProgress from "@material-ui/core/CircularProgress";
import Compressor from "compressorjs";
import CloseIcon from "@material-ui/icons/Close";
import ImageOutlinedIcon from "@material-ui/icons/ImageOutlined";
import CloudUploadOutlinedIcon from "@material-ui/icons/CloudUploadOutlined";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";

import api from "../../services/api";
import { useAuth } from "../../hooks/useAuth";

const useStyles = makeStyles(theme => ({
  dialog: {
    "& .MuiDialog-paper": {
      borderRadius: 16,
      overflow: "hidden",
      maxWidth: 520,
    },
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 12px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    "& svg": { fontSize: 22 },
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#fff" : "#1a1a2e",
    lineHeight: 1.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.palette.type === "dark" ? "#aaa" : "#888",
    marginTop: 2,
  },
  closeBtn: {
    color: theme.palette.type === "dark" ? "#aaa" : "#666",
    padding: 8,
    "&:hover": {
      background: theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
    },
  },
  content: {
    padding: "16px 24px 20px",
  },
  uploadZone: {
    border: `2px dashed ${theme.palette.type === "dark" ? "#555" : "#d0d5dd"}`,
    borderRadius: 12,
    padding: "36px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    background: theme.palette.type === "dark" ? "rgba(255,255,255,0.02)" : "#fafbfc",
    "&:hover": {
      borderColor: "#43e97b",
      background: theme.palette.type === "dark" ? "rgba(67,233,123,0.08)" : "rgba(67,233,123,0.04)",
    },
  },
  uploadIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: theme.palette.type === "dark" ? "rgba(67,233,123,0.15)" : "rgba(67,233,123,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    "& svg": { fontSize: 28, color: "#43e97b" },
  },
  uploadText: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#e0e0e0" : "#344054",
    marginBottom: 4,
  },
  uploadHint: {
    fontSize: 12,
    color: theme.palette.type === "dark" ? "#999" : "#98a2b3",
  },
  previewContainer: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    border: `1px solid ${theme.palette.type === "dark" ? "#333" : "#e8ecf0"}`,
    background: theme.palette.type === "dark" ? "#1a1a2e" : "#f8f9fb",
    "& img": {
      width: "100%",
      maxHeight: 350,
      objectFit: "contain",
      display: "block",
    },
  },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    background: "rgba(0,0,0,0.5)",
    color: "#fff",
    padding: 6,
    "&:hover": { background: "rgba(0,0,0,0.7)" },
    "& svg": { fontSize: 18 },
  },
  actions: {
    padding: "12px 24px 20px",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    borderTop: "none",
  },
  cancelBtn: {
    borderRadius: 10,
    padding: "8px 20px",
    textTransform: "none",
    fontWeight: 500,
    fontSize: 14,
    color: theme.palette.type === "dark" ? "#ccc" : "#555",
    border: `1px solid ${theme.palette.type === "dark" ? "#444" : "#d0d5dd"}`,
    "&:hover": {
      background: theme.palette.type === "dark" ? "rgba(255,255,255,0.05)" : "#f9fafb",
    },
  },
  saveBtn: {
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
      background: theme.palette.type === "dark" ? "#444" : "#e0e0e0",
      color: theme.palette.type === "dark" ? "#777" : "#999",
      boxShadow: "none",
    },
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "24px 0",
  },
  loadingText: {
    fontSize: 13,
    color: theme.palette.type === "dark" ? "#aaa" : "#666",
  },
}));

const FlowBuilderAddImgModal = ({ open, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
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
    <Dialog
      open={activeModal}
      onClose={handleClose}
      className={classes.dialog}
      fullWidth
      maxWidth="sm"
    >
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerLeft}>
          <div className={classes.headerIcon}>
            <ImageOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>{labels.title}</Typography>
            <Typography className={classes.headerSubtitle}>PNG / JPG · Máximo 2 MB</Typography>
          </div>
        </div>
        <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent className={classes.content}>
        {loading ? (
          <div className={classes.loadingBox}>
            <CircularProgress size={40} style={{ color: "#43e97b" }} />
            <Typography className={classes.loadingText}>Subiendo imagen...</Typography>
          </div>
        ) : preview ? (
          <div className={classes.previewContainer}>
            <img src={preview} alt="Preview" />
            {open !== "edit" && (
              <IconButton
                className={classes.removeBtn}
                onClick={() => { setPreview(); setMedias([]); }}
                size="small"
              >
                <DeleteOutlineIcon />
              </IconButton>
            )}
          </div>
        ) : (
          <label className={classes.uploadZone}>
            <div className={classes.uploadIconWrapper}>
              <CloudUploadOutlinedIcon />
            </div>
            <Typography className={classes.uploadText}>
              Haz clic para seleccionar una imagen
            </Typography>
            <Typography className={classes.uploadHint}>
              Archivos PNG o JPG · Máximo 2 MB
            </Typography>
            <input
              type="file"
              accept="image/png, image/jpg, image/jpeg"
              hidden
              onChange={handleChangeMedias}
            />
          </label>
        )}
      </DialogContent>

      {/* Actions */}
      {!loading && (
        <DialogActions className={classes.actions}>
          <Button className={classes.cancelBtn} onClick={handleClose}>
            Cancelar
          </Button>
          {open !== "edit" && (
            <Button
              className={classes.saveBtn}
              onClick={handleSaveContact}
              disabled={!preview}
            >
              {labels.btn}
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
};

export default FlowBuilderAddImgModal;
