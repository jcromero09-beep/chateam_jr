import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import { AddCircle, Delete } from "@mui/icons-material";

const StyledDialog = styled(Dialog)({
  "& .MuiDialog-paper": {
    borderRadius: 16,
    overflow: "hidden",
    maxWidth: 560,
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
  background: "linear-gradient(135deg, #5BC2D2 0%, #43e97b 100%)",
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
  display: "flex",
  flexDirection: "column",
  gap: 16,
});

const StyledTextField = styled(TextField)({
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
});

const OptionRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const OptionLabel = styled(Typography)(({ theme }) => ({
  fontSize: 13,
  fontWeight: 600,
  color: theme.palette.mode === "dark" ? "#ccc" : "#555",
  minWidth: 70,
}));

const AddOptionRow = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 0",
});

const AddOptionText = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  fontWeight: 500,
  color: theme.palette.mode === "dark" ? "#e0e0e0" : "#344054",
}));

const AddBtn = styled(Button)({
  borderRadius: 10,
  minWidth: 40,
  padding: "6px 12px",
  background: "linear-gradient(135deg, #5BC2D2 0%, #43e97b 100%)",
  color: "#fff",
  "&:hover": {
    background: "linear-gradient(135deg, #4db0be 0%, #38d66c 100%)",
  },
});

const DeleteBtn = styled(IconButton)(({ theme }) => ({
  color: theme.palette.mode === "dark" ? "#ff6b6b" : "#e55353",
  padding: 6,
  "&:hover": {
    background: "rgba(229,83,83,0.08)",
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

const SaveBtn = styled(Button)({
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
});

const FlowBuilderMenuModal = ({ open, onSave, onUpdate, data, close }) => {
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
            <ListAltOutlinedIcon />
          </HeaderIcon>
          <div>
            <HeaderTitle>{labels.title}</HeaderTitle>
            <HeaderSubtitle>Configura las opciones del menú</HeaderSubtitle>
          </div>
        </HeaderLeft>
        <CloseBtn onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </CloseBtn>
      </Header>

      {/* Content */}
      <Content>
        <StyledTextField
          label="Mensaje de explicación del menú"
          rows={4}
          name="text"
          multiline
          variant="outlined"
          value={textDig}
          onChange={e => setTextDig(e.target.value)}
        />

        <AddOptionRow>
          <AddOptionText>Añadir opción</AddOptionText>
          <AddBtn
            onClick={() =>
              setArrayOption(old => [
                ...old,
                { number: old.length + 1, value: "" }
              ])
            }
          >
            <AddCircle style={{ fontSize: 20 }} />
          </AddBtn>
        </AddOptionRow>

        {arrayOption.map((item, index) => (
          <div key={item.number}>
            <OptionLabel>Opción {item.number}</OptionLabel>
            <OptionRow>
              <StyledTextField
                placeholder="Introducir opción"
                variant="outlined"
                size="small"
                defaultValue={item.value}
                onChange={event =>
                  setArrayOption(old => {
                    let newArr = [...old];
                    newArr[index].value = event.target.value;
                    return newArr;
                  })
                }
              />
              {arrayOption.length === item.number && (
                <DeleteBtn onClick={() => removeOption(item.number)}>
                  <Delete fontSize="small" />
                </DeleteBtn>
              )}
            </OptionRow>
          </div>
        ))}
      </Content>

      {/* Actions */}
      <Actions>
        <CancelBtn onClick={handleClose}>
          Cancelar
        </CancelBtn>
        <SaveBtn onClick={handleSaveContact}>
          {labels.btn}
        </SaveBtn>
      </Actions>
    </StyledDialog>
  );
};

export default FlowBuilderMenuModal;
