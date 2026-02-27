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
import ListAltOutlinedIcon from "@material-ui/icons/ListAltOutlined";
import { AddCircle, Delete } from "@mui/icons-material";
import { Stack } from "@mui/material";

const useStyles = makeStyles(theme => ({
  dialog: {
    "& .MuiDialog-paper": {
      borderRadius: 16,
      overflow: "hidden",
      maxWidth: 560,
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
    background: "linear-gradient(135deg, #5BC2D2 0%, #43e97b 100%)",
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
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  textField: {
    width: "100%",
    "& .MuiOutlinedInput-root": {
      borderRadius: 10,
      fontSize: 14,
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: "#5BC2D2",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#5BC2D2",
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#5BC2D2",
    },
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#ccc" : "#555",
    minWidth: 70,
  },
  addOptionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
  },
  addOptionText: {
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.type === "dark" ? "#e0e0e0" : "#344054",
  },
  addBtn: {
    borderRadius: 10,
    minWidth: 40,
    padding: "6px 12px",
    background: "linear-gradient(135deg, #5BC2D2 0%, #43e97b 100%)",
    color: "#fff",
    "&:hover": {
      background: "linear-gradient(135deg, #4db0be 0%, #38d66c 100%)",
    },
  },
  deleteBtn: {
    color: theme.palette.type === "dark" ? "#ff6b6b" : "#e55353",
    padding: 6,
    "&:hover": {
      background: "rgba(229,83,83,0.08)",
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
    background: "linear-gradient(135deg, #5BC2D2 0%, #43e97b 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(91,194,210,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #4db0be 0%, #38d66c 100%)",
      boxShadow: "0 4px 12px rgba(91,194,210,0.4)",
    },
  },
}));

const FlowBuilderMenuModal = ({ open, onSave, onUpdate, data, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);
  const [textDig, setTextDig] = useState();
  const [arrayOption, setArrayOption] = useState([]);
  const [labels, setLabels] = useState({
    title: "Añadir menú al flujo",
    btn: "Añadir"
  });

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: "Editar menú", btn: "Guardar" });
      setTextDig(data.data.message);
      setArrayOption(data.data.arrayOption);
      setActiveModal(true);
    } else if (open === "create") {
      setLabels({ title: "Añadir menú al flujo", btn: "Añadir" });
      setTextDig();
      setArrayOption([]);
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
      onUpdate({ ...data, data: { message: textDig, arrayOption: arrayOption } });
      return;
    } else if (open === "create") {
      handleClose();
      onSave({ message: textDig, arrayOption: arrayOption });
    }
  };

  const removeOption = number => {
    setArrayOption(old => old.filter(item => item.number !== number));
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
            <ListAltOutlinedIcon />
          </div>
          <div>
            <Typography className={classes.headerTitle}>{labels.title}</Typography>
            <Typography className={classes.headerSubtitle}>Configura las opciones del menú</Typography>
          </div>
        </div>
        <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent className={classes.content}>
        <TextField
          label="Mensaje de explicación del menú"
          rows={4}
          name="text"
          multiline
          variant="outlined"
          value={textDig}
          onChange={e => setTextDig(e.target.value)}
          className={classes.textField}
        />

        <div className={classes.addOptionRow}>
          <Typography className={classes.addOptionText}>Añadir opción</Typography>
          <Button
            className={classes.addBtn}
            onClick={() =>
              setArrayOption(old => [
                ...old,
                { number: old.length + 1, value: "" }
              ])
            }
          >
            <AddCircle style={{ fontSize: 20 }} />
          </Button>
        </div>

        {arrayOption.map((item, index) => (
          <div key={item.number}>
            <Typography className={classes.optionLabel}>Opción {item.number}</Typography>
            <div className={classes.optionRow}>
              <TextField
                placeholder="Introducir opción"
                variant="outlined"
                size="small"
                defaultValue={item.value}
                className={classes.textField}
                onChange={event =>
                  setArrayOption(old => {
                    let newArr = [...old];
                    newArr[index].value = event.target.value;
                    return newArr;
                  })
                }
              />
              {arrayOption.length === item.number && (
                <IconButton className={classes.deleteBtn} onClick={() => removeOption(item.number)}>
                  <Delete fontSize="small" />
                </IconButton>
              )}
            </div>
          </div>
        ))}
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

export default FlowBuilderMenuModal;
