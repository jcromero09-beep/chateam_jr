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
import CloseIcon from "@material-ui/icons/Close";
import DescriptionOutlinedIcon from "@material-ui/icons/DescriptionOutlined";
import CloudUploadOutlinedIcon from "@material-ui/icons/CloudUploadOutlined";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import InsertDriveFileOutlinedIcon from "@material-ui/icons/InsertDriveFileOutlined";

import api from "../../services/api";

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
    background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
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
      borderColor: "#ff6b6b",
      background: theme.palette.type === "dark" ? "rgba(255,107,107,0.08)" : "rgba(255,107,107,0.04)",
    },
  },
  uploadIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: theme.palette.type === "dark" ? "rgba(255,107,107,0.15)" : "rgba(255,107,107,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    "& svg": { fontSize: 28, color: "#ff6b6b" },
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
    padding: "20px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  pdfIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    "& svg": { fontSize: 28, color: "#fff" },
  },
  pdfInfo: {
    flex: 1,
    minWidth: 0,
  },
  pdfName: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#e0e0e0" : "#344054",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  pdfSize: {
    fontSize: 12,
    color: theme.palette.type === "dark" ? "#999" : "#98a2b3",
    marginTop: 2,
  },
  removeBtn: {
    color: theme.palette.type === "dark" ? "#ff6b6b" : "#e55353",
    padding: 8,
    flexShrink: 0,
    "&:hover": {
      background: "rgba(229,83,83,0.08)",
    },
    "& svg": { fontSize: 20 },
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
    background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(255,107,107,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #e85d5d 0%, #d94f1e 100%)",
      boxShadow: "0 4px 12px rgba(255,107,107,0.4)",
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

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const FlowBuilderAddPdfModal = ({ open, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
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
            <DescriptionOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>{labels.title}</Typography>
            <Typography className={classes.headerSubtitle}>PDF · Máximo 5 MB</Typography>
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
            <CircularProgress size={40} style={{ color: "#ff6b6b" }} />
            <Typography className={classes.loadingText}>Subiendo PDF...</Typography>
          </div>
        ) : selectedFile ? (
          <div className={classes.previewContainer}>
            <div className={classes.pdfIcon}>
              <InsertDriveFileOutlinedIcon />
            </div>
            <div className={classes.pdfInfo}>
              <Typography className={classes.pdfName}>{selectedFile.name}</Typography>
              <Typography className={classes.pdfSize}>{formatFileSize(selectedFile.size)}</Typography>
            </div>
            {open !== "edit" && (
              <IconButton
                className={classes.removeBtn}
                onClick={() => setSelectedFile(null)}
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
              Haz clic para seleccionar un PDF
            </Typography>
            <Typography className={classes.uploadHint}>
              Archivos PDF · Máximo 5 MB
            </Typography>
            <input
              type="file"
              accept=".pdf,application/pdf"
              hidden
              onChange={handleChangeFile}
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
              disabled={!selectedFile}
            >
              {labels.btn}
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
};

export default FlowBuilderAddPdfModal;
