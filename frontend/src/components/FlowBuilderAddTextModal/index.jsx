import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import MessageOutlinedIcon from "@material-ui/icons/MessageOutlined";

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
    background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
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
    width: "100%",
    "& .MuiOutlinedInput-root": {
      borderRadius: 10,
      fontSize: 14,
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: "#4facfe",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#4facfe",
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#4facfe",
    },
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
    background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(79,172,254,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #3d9be8 0%, #00dde8 100%)",
      boxShadow: "0 4px 12px rgba(79,172,254,0.4)",
    },
  },
}));

const FlowBuilderAddTextModal = ({ open, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);
  const [labels, setLabels] = useState({
    title: "Añadir mensaje al flujo",
    btn: "Añadir"
  });
  const [textDig, setTextDig] = useState();

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar mensaje", btn: "Guardar" });
      setTextDig(data.data.label);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir mensaje al flujo", btn: "Añadir" });
      setTextDig("");
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
  };

  const handleSaveContact = async () => {
    if (open === "edit") {
      handleClose();
      onUpdate({ ...data, data: { label: textDig } });
      return;
    } else if (open === "create") {
      handleClose();
      onSave({ text: textDig });
    }
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
            <MessageOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>{labels.title}</Typography>
            <Typography className={classes.headerSubtitle}>Escribe el mensaje de texto</Typography>
          </div>
        </div>
        <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent className={classes.content}>
        <TextField
          label="Mensaje"
          multiline
          rows={7}
          name="text"
          variant="outlined"
          value={textDig}
          onChange={e => setTextDig(e.target.value)}
          className={classes.textField}
          autoFocus
        />
      </DialogContent>

      {/* Actions */}
      <DialogActions className={classes.actions}>
        <Button className={classes.cancelBtn} onClick={handleClose}>
          Cancelar
        </Button>
        <Button className={classes.saveBtn} onClick={handleSaveContact}>
          {labels.btn}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderAddTextModal;
