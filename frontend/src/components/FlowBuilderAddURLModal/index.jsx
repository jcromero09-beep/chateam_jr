import React, { useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import Grid from "@material-ui/core/Grid";
import CloseIcon from "@material-ui/icons/Close";
import LinkOutlinedIcon from "@material-ui/icons/LinkOutlined";
import CloudUploadOutlinedIcon from "@material-ui/icons/CloudUploadOutlined";

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
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
  textField: {
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
  },
  uploadBtn: {
    borderRadius: 10,
    padding: "10px 20px",
    textTransform: "none",
    fontWeight: 600,
    fontSize: 14,
    background: theme.palette.type === "dark" ? "rgba(102,126,234,0.15)" : "rgba(102,126,234,0.08)",
    color: "#667eea",
    border: `1px dashed #667eea`,
    width: "100%",
    "&:hover": {
      background: theme.palette.type === "dark" ? "rgba(102,126,234,0.25)" : "rgba(102,126,234,0.12)",
    },
  },
  inputFile: {
    display: "none",
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
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(102,126,234,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #5a6fd6 0%, #6a4299 100%)",
      boxShadow: "0 4px 12px rgba(102,126,234,0.4)",
    },
  },
}));

const FlowBuilderAddURLModal = ({ open, close, onSave, data }) => {
  const classes = useStyles();
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
    <Dialog
      open={open}
      onClose={handleClose}
      className={classes.dialog}
      fullWidth
      maxWidth="sm"
    >
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerLeft}>
          <div className={classes.headerIcon}>
            <LinkOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>Configurar URL</Typography>
            <Typography className={classes.headerSubtitle}>Configura el enlace y su apariencia</Typography>
          </div>
        </div>
        <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent className={classes.content}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <input
              accept="image/*"
              className={classes.inputFile}
              id="url-image-input"
              type="file"
              onChange={handleImageChange}
            />
            <label htmlFor="url-image-input">
              <Button
                className={classes.uploadBtn}
                component="span"
                startIcon={<CloudUploadOutlinedIcon />}
              >
                {imageBase64 ? "Imagen seleccionada" : "Subir imagen"}
              </Button>
            </label>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Título"
              variant="outlined"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={classes.textField}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Descripción"
              variant="outlined"
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={classes.textField}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Texto del botón"
              variant="outlined"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              className={classes.textField}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="URL"
              variant="outlined"
              value={sendURL}
              onChange={(e) => setSendURL(e.target.value)}
              className={classes.textField}
            />
          </Grid>
        </Grid>
      </DialogContent>

      {/* Actions */}
      <DialogActions className={classes.actions}>
        <Button className={classes.cancelBtn} onClick={handleClose}>
          Cancelar
        </Button>
        <Button className={classes.saveBtn} onClick={handleSave}>
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderAddURLModal;
