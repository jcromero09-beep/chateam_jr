import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import Slider from "@material-ui/core/Slider";
import CloseIcon from "@material-ui/icons/Close";
import ShuffleOutlinedIcon from "@material-ui/icons/ShuffleOutlined";
import { Stack } from "@mui/material";

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
    background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
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
    padding: "20px 24px 24px",
  },
  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    padding: "16px 0",
  },
  percentText: {
    fontSize: 20,
    fontWeight: 700,
    color: theme.palette.type === "dark" ? "#f6d365" : "#e8a020",
    minWidth: 50,
    textAlign: "center",
  },
  slider: {
    color: "#fda085",
    "& .MuiSlider-thumb": {
      width: 20,
      height: 20,
      background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
      boxShadow: "0 2px 8px rgba(253,160,133,0.4)",
    },
    "& .MuiSlider-track": {
      background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
      border: "none",
    },
    "& .MuiSlider-rail": {
      background: theme.palette.type === "dark" ? "#444" : "#e0e0e0",
    },
    "& .MuiSlider-mark": {
      background: theme.palette.type === "dark" ? "#555" : "#ccc",
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
    background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(253,160,133,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #e8c358 0%, #e89078 100%)",
      boxShadow: "0 4px 12px rgba(253,160,133,0.4)",
    },
  },
}));

const FlowBuilderRandomizerModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [percent, setPercent] = useState(0);
  const [activeModal, setActiveModal] = useState(false);

  useEffect(() => {
    if (open === "edit") {
      setPercent(data.data.percent);
      setActiveModal(true);
    } else if (open === "create") {
      setPercent(0);
      setActiveModal(true);
    }
    return () => { isMounted.current = false; };
  }, [open]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleValue = (event, newValue) => {
    setPercent(newValue);
  };

  const handleSaveContact = async () => {
    if (!percent || parseInt(percent) <= 0) {
      return toast.error("Añadir el valor del intervalo");
    }
    if (parseInt(percent) > 120) {
      return toast.error("Tiempo máximo alcanzado 120 segundos");
    }
    if (open === "edit") {
      onUpdate({ ...data, data: { percent: percent } });
    } else if (open === "create") {
      onSave({ percent: percent });
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
            <ShuffleOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>
              {open === "create" ? "Añadir aleatorizador" : "Editar aleatorizador"}
            </Typography>
            <Typography className={classes.headerSubtitle}>Configura el porcentaje de distribución</Typography>
          </div>
        </div>
        <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent className={classes.content}>
        <div className={classes.sliderContainer}>
          <Typography className={classes.percentText}>{percent}%</Typography>
          <Slider
            className={classes.slider}
            defaultValue={percent}
            valueLabelDisplay="auto"
            onChange={handleValue}
            step={10}
            marks
            min={0}
            max={100}
          />
          <Typography className={classes.percentText}>{100 - percent}%</Typography>
        </div>
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

export default FlowBuilderRandomizerModal;
