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
import TimerOutlinedIcon from "@material-ui/icons/TimerOutlined";

const useStyles = makeStyles(theme => ({
  dialog: {
    "& .MuiDialog-paper": {
      borderRadius: 16,
      overflow: "hidden",
      maxWidth: 480,
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
    background: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
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
        borderColor: "#a18cd1",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#a18cd1",
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#a18cd1",
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
    background: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(161,140,209,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #917dbe 0%, #e8aed8 100%)",
      boxShadow: "0 4px 12px rgba(161,140,209,0.4)",
    },
  },
}));

const FlowBuilderIntervalModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [timerSec, setTimerSec] = useState(0);
  const [activeModal, setActiveModal] = useState(false);

  useEffect(() => {
    if (open === "edit") {
      setTimerSec(data.data.sec);
      setActiveModal(true);
    } else if (open === "create") {
      setTimerSec(0);
      setActiveModal(true);
    }
    return () => { isMounted.current = false; };
  }, [open]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleSaveContact = async () => {
    if (!timerSec || parseInt(timerSec) <= 0) {
      return toast.error("Añadir el valor del intervalo");
    }
    if (parseInt(timerSec) > 120) {
      return toast.error("Tiempo máximo alcanzado 120 segundos");
    }
    if (open === "edit") {
      onUpdate({ ...data, data: { sec: timerSec } });
    } else if (open === "create") {
      onSave({ sec: timerSec });
    }
    handleClose();
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
            <TimerOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>
              {open === "create" ? "Añadir intervalo" : "Editar intervalo"}
            </Typography>
            <Typography className={classes.headerSubtitle}>Tiempo de espera en segundos (máx. 120)</Typography>
          </div>
        </div>
        <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent className={classes.content}>
        <TextField
          label="Tiempo en segundos"
          name="timer"
          type="number"
          value={timerSec}
          onChange={e => setTimerSec(e.target.value)}
          autoFocus
          variant="outlined"
          InputProps={{ inputProps: { min: 0, max: 120 } }}
          className={classes.textField}
        />
      </DialogContent>

      {/* Actions */}
      <DialogActions className={classes.actions}>
        <Button className={classes.cancelBtn} onClick={handleClose}>
          Cancelar
        </Button>
        <Button className={classes.saveBtn} onClick={handleSaveContact}>
          {open === "create" ? "Añadir" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderIntervalModal;
