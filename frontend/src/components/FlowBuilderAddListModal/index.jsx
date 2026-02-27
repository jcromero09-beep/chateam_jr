import React, { useState, useEffect } from "react";
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
import ViewListOutlinedIcon from "@material-ui/icons/ViewListOutlined";
import { Add, Delete } from "@material-ui/icons";
import toastError from "../../errors/toastError";

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
    background: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
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
        borderColor: "#66a6ff",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#66a6ff",
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#66a6ff",
    },
  },
  optionsLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#e0e0e0" : "#344054",
    marginBottom: 8,
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  deleteBtn: {
    color: theme.palette.type === "dark" ? "#ff6b6b" : "#e55353",
    padding: 6,
    "&:hover": {
      background: "rgba(229,83,83,0.08)",
    },
  },
  addOptionBtn: {
    borderRadius: 10,
    padding: "6px 16px",
    textTransform: "none",
    fontWeight: 500,
    fontSize: 13,
    color: "#66a6ff",
    borderColor: "#66a6ff",
    "&:hover": {
      borderColor: "#5590e8",
      background: "rgba(102,166,255,0.06)",
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
    background: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(102,166,255,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #7ae4eb 0%, #5590e8 100%)",
      boxShadow: "0 4px 12px rgba(102,166,255,0.4)",
    },
  },
}));

const FlowBuilderAddListModal = ({ open, onClose, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState([""]);
  const [activeModal, setActiveModal] = useState(false);
  const [labels, setLabels] = useState({
    title: "Crear lista",
    btn: "Crear"
  });

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar lista", btn: "Actualizar" });
      if (data && data.data) {
        setTitle(data.data.title || "");
        setDescription(data.data.description || "");
        setOptions((data.data.options || []).map(opt => typeof opt === "string" ? opt : opt.text));
      }
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Crear lista", btn: "Crear" });
      setTitle("");
      setDescription("");
      setOptions([""]);
      setActiveModal(true);
    } else {
      setActiveModal(false);
    }
  }, [open]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
    setTitle("");
    setDescription("");
    setOptions([""]);
  };

  const handleSave = () => {
    if (!title.trim()) {
      toastError("El título es requerido");
      return;
    }

    const validOptions = options.map(opt => opt.trim()).filter(opt => opt !== "");
    if (validOptions.length === 0) {
      toastError("Debe tener al menos una opción");
      return;
    }

    const uniqueOptions = new Set(validOptions);
    if (uniqueOptions.size !== validOptions.length) {
      toastError("No se permiten opciones duplicadas");
      return;
    }

    const listData = {
      title: title.trim(),
      description: description.trim(),
      options: validOptions.map(opt => ({ text: opt.trim(), value: opt.trim() }))
    };

    if (open === "edit") {
      onUpdate({ ...data, data: listData });
    } else {
      onSave(listData);
    }
    handleClose();
  };

  const addOption = () => {
    setOptions([...options, ""]);
  };

  const removeOption = (index) => {
    if (options.length > 1) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
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
            <ViewListOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>{labels.title}</Typography>
            <Typography className={classes.headerSubtitle}>Configura título, descripción y opciones</Typography>
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
            <TextField
              fullWidth
              label="Título"
              variant="outlined"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className={classes.textField}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Descripción"
              variant="outlined"
              multiline
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={classes.textField}
            />
          </Grid>
          <Grid item xs={12}>
            <Typography className={classes.optionsLabel}>Opciones</Typography>
            {options.map((option, index) => (
              <div key={index} className={classes.optionRow}>
                <TextField
                  label={`Opción ${index + 1}`}
                  variant="outlined"
                  size="small"
                  value={option}
                  onChange={e => updateOption(index, e.target.value)}
                  style={{ flex: 1 }}
                  className={classes.textField}
                />
                <IconButton
                  className={classes.deleteBtn}
                  onClick={() => removeOption(index)}
                  disabled={options.length === 1}
                  size="small"
                >
                  <Delete fontSize="small" />
                </IconButton>
              </div>
            ))}
            <Button
              startIcon={<Add />}
              onClick={addOption}
              variant="outlined"
              size="small"
              className={classes.addOptionBtn}
            >
              Agregar opción
            </Button>
          </Grid>
        </Grid>
      </DialogContent>

      {/* Actions */}
      <DialogActions className={classes.actions}>
        <Button className={classes.cancelBtn} onClick={handleClose}>
          Cancelar
        </Button>
        <Button className={classes.saveBtn} onClick={handleSave}>
          {labels.btn}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderAddListModal;
