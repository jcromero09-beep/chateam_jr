import React, { useState, useEffect, useRef } from "react";

import * as Yup from "yup";
import { Formik, FieldArray, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import IconButton from "@material-ui/core/IconButton";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import CircularProgress from "@material-ui/core/CircularProgress";
import Compressor from "compressorjs";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import {
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import {
  AccessTime,
  AddCircle,
  Delete,
  Image,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Message,
  PictureAsPdf,
  MicNone,
  Videocam,
} from "@mui/icons-material";
import CloseIcon from "@material-ui/icons/Close";
import DashboardOutlinedIcon from "@material-ui/icons/DashboardOutlined";
import { capitalize } from "../../utils/capitalize";
import { Box, Divider } from "@material-ui/core";

const useStyles = makeStyles((theme) => ({
  dialog: {
    "& .MuiDialog-paper": {
      borderRadius: 16,
      overflow: "hidden",
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
    background: "linear-gradient(135deg, #5BC2D2 0%, #667eea 100%)",
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
  typeBtn: {
    borderRadius: 20,
    padding: "6px 16px",
    textTransform: "none",
    fontWeight: 600,
    fontSize: 13,
    background: "linear-gradient(135deg, #5BC2D2 0%, #667eea 100%)",
    color: "#fff",
    boxShadow: "0 2px 6px rgba(91,194,210,0.25)",
    "&:hover": {
      background: "linear-gradient(135deg, #4db0be 0%, #5a6fd6 100%)",
      boxShadow: "0 3px 10px rgba(91,194,210,0.35)",
    },
    "& svg": { width: 16, height: 16, marginRight: 4 },
  },
  elementCard: {
    border: `1px solid ${theme.palette.type === "dark" ? "#444" : "#e0e5ec"}`,
    borderRadius: 12,
    padding: 12,
    position: "relative",
    background: theme.palette.type === "dark" ? "rgba(255,255,255,0.02)" : "#fafbfc",
    transition: "border-color 0.2s",
    "&:hover": {
      borderColor: "#5BC2D2",
    },
  },
  elementTitle: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.type === "dark" ? "#ccc" : "#555",
    marginBottom: 8,
  },
  deleteIcon: {
    cursor: "pointer",
    fontSize: 20,
    color: theme.palette.type === "dark" ? "#999" : "#bbb",
    "&:hover": { color: "#f5576c" },
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
    background: "linear-gradient(135deg, #5BC2D2 0%, #667eea 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(91,194,210,0.3)",
    "&:hover": {
      background: "linear-gradient(135deg, #4db0be 0%, #5a6fd6 100%)",
      boxShadow: "0 4px 12px rgba(91,194,210,0.4)",
    },
  },
  textField: {
    marginRight: theme.spacing(1),
    flex: 1,
  },
  btnWrapper: {
    position: "relative",
  },
  uploadBtn: {
    borderRadius: 10,
    padding: "8px 16px",
    textTransform: "none",
    fontWeight: 500,
    fontSize: 13,
    background: theme.palette.type === "dark" ? "rgba(91,194,210,0.15)" : "rgba(91,194,210,0.08)",
    color: "#5BC2D2",
    border: "1px dashed #5BC2D2",
    "&:hover": {
      background: theme.palette.type === "dark" ? "rgba(91,194,210,0.25)" : "rgba(91,194,210,0.12)",
    },
  },
  variablesSection: {
    textAlign: "center",
    padding: "8px 0",
    "& .MuiTypography-root": {
      fontSize: 13,
      color: theme.palette.type === "dark" ? "#aaa" : "#888",
    },
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    height: "70vh",
    padding: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.type === "dark" ? "#ccc" : "#555",
  },
}));

const FlowBuilderSingleBlockModal = ({
  open,
  onSave,
  onUpdate,
  data,
  close,
  type,
}) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);

  const [rule, setRule] = useState();

  const [medias, setMedias] = useState([]);

  const [textDig, setTextDig] = useState();

  const [elements, setElements] = useState([]);

  const [elementsSeq, setElementsSeq] = useState([]);

  const [elementsSeqEdit, setElementsSeqEdit] = useState([]);

  const [elementsEdit, setElementsEdit] = useState([]);

  const [numberMessages, setNumberMessages] = useState(0);

  const [numberMessagesLast, setNumberMessagesLast] = useState(0);

  const [numberInterval, setNumberInterval] = useState(0);

  const [numberIntervalLast, setNumberIntervalLast] = useState(0);

  const [numberAudio, setNumberAudio] = useState(0);

  const [numberAudioLast, setNumberAudioLast] = useState(0);

  const [numberVideo, setNumberVideo] = useState(0);

  const [numberVideoLast, setNumberVideoLast] = useState(0);

  const [numberImg, setNumberImg] = useState(0);

  const [numberImgLast, setNumberImgLast] = useState(0);


  const [numberPdf, setNumberPdf] = useState(0);

  const [numberPdfLast, setNumberPdfLast] = useState(0);

  
  const [loading, setLoading] = useState(false);

  const [previewImg, setPreviewImg] = useState([]);

  const [previewPdf, setPreviewPdf] = useState([]);
  const [previewAudios, setPreviewAudios] = useState([]);

  const [previewVideos, setPreviewVideos] = useState([]);

  const [arrayOption, setArrayOption] = useState([]);

  const [variables, setVariables] = useState([]);

  const [labels, setLabels] = useState({
    title: "Añadir contenido al flujo",
    btn: "Añadir",
  });

  const handleElements = (newNameFiles) => {
    let elementsSequence = [];

    const newArrMessage = elementsSeq.filter((item) =>
      item.includes("message")
    );
    const newArrInterval = elementsSeq.filter((item) =>
      item.includes("interval")
    );
    const newArrImg = elementsSeq.filter((item) => item.includes("img"));
    const newArrAudio = elementsSeq.filter((item) => item.includes("audio"));
    const newArrVideo = elementsSeq.filter((item) => item.includes("video"));
    const newArrPdf = elementsSeq.filter((item) => item.includes("pdf"));

    //Todas as mensagens
    for (let i = 0; i < numberMessages; i++) {
      const value = document
        .querySelector(`.${newArrMessage[i]}`)
        .querySelector(".MuiInputBase-input").value;
      if (!value) {
        toast.error("Campos de mensaje vacíos");
        setLoading(false);
        throw "";
      }
      elementsSequence.push({
        type: "message",
        value: value,
        number: newArrMessage[i],
      });
      console.log("text");
    }
    //Todos os intervalos
    for (let i = 0; i < numberInterval; i++) {
      const value = document
        .querySelector(`.${newArrInterval[i]}`)
        .querySelector(".MuiInputBase-input").value;
      if (parseInt(value) === 0 || parseInt(value) > 120) {
        toast.error("El intervalo no puede ser 0 ni superior a 120.");
        setLoading(false);
        throw "";
      }
      elementsSequence.push({
        type: "interval",
        value: value,
        number: newArrInterval[i],
      });
      console.log("int");
    }

    //Todas as imagens
    for (let i = 0; i < numberImg; i++) {
      const onlyImg =
        newNameFiles !== null &&
        newNameFiles.filter(
          (file) =>
            file.includes("png") ||
            file.includes("jpg") ||
            file.includes("jpeg")
        );
      const onlyImgNameOriginal = medias.filter(
        (file) =>
          file.name.includes("png") ||
          file.name.includes("jpg") ||
          file.name.includes("jpeg")
      );
      if (elementsSeqEdit.includes(newArrImg[i])) {
        const itemSelectedEdit = elementsEdit.filter(
          (item) => item.number === newArrImg[i]
        )[0];
        elementsSequence.push({
          type: "img",
          value: itemSelectedEdit.value,
          original: itemSelectedEdit.original,
          number: itemSelectedEdit.number,
        });
      } else {
        let indexElem = 0;
        if (elementsSeqEdit.filter((item) => item.includes("img")).length > 0) {
          indexElem =
            elementsSeqEdit.filter((item) => item.includes("img")).length - i;
        } else {
          indexElem = i;
        }
        elementsSequence.push({
          type: "img",
          value: onlyImg[indexElem],
          original: onlyImgNameOriginal[indexElem].name,
          number: newArrImg[i],
        });
      }
    }

    // Todos los PDFs
    for (let i = 0; i < numberPdf; i++) {
      const onlyPdf =
        newNameFiles !== null &&
        newNameFiles.filter((file) => file.includes("pdf"));

      const onlyPdfNameOriginal = medias.filter((file) =>
        file.name.includes("pdf")
      );

      if (elementsSeqEdit.includes(newArrPdf[i])) {
        const itemSelectedEdit = elementsEdit.filter(
          (item) => item.number === newArrPdf[i]
        )[0];
        elementsSequence.push({
          type: "pdf",
          value: itemSelectedEdit.value,       // URL del PDF
          original: itemSelectedEdit.original, // nombre original
          number: itemSelectedEdit.number,
        });
      } else {
        let indexElem = 0;
        if (elementsSeqEdit.filter((item) => item.includes("pdf")).length > 0) {
          indexElem =
            elementsSeqEdit.filter((item) => item.includes("pdf")).length - i;
        } else {
          indexElem = i;
        }
        elementsSequence.push({
          type: "pdf",
          value: onlyPdf[indexElem],                        // URL del PDF
          original: onlyPdfNameOriginal[indexElem].name,    // nombre original
          number: newArrPdf[i],
        });
      }
    }

    //Todos os audios
    for (let i = 0; i < numberAudio; i++) {
      const onlyAudio =
        newNameFiles !== null &&
        newNameFiles.filter(
          (file) =>
            file.includes("mp3") ||
            file.includes("ogg") ||
            file.includes("mpeg") ||
            file.includes("opus")
        );
      const onlyAudioNameOriginal = medias.filter(
        (file) =>
          file.name.includes("mp3") ||
          file.name.includes("ogg") ||
          file.name.includes("mpeg") ||
          file.name.includes("opus")
      );

      if (elementsSeqEdit.includes(newArrAudio[i])) {
        const itemSelectedEdit = elementsEdit.filter(
          (item) => item.number === newArrAudio[i]
        )[0];
        elementsSequence.push({
          type: "audio",
          value: itemSelectedEdit.value,
          original: itemSelectedEdit.original,
          number: itemSelectedEdit.number,
          record: document
            .querySelector(`.check${newArrAudio[i]}`)
            .querySelector(".PrivateSwitchBase-input").checked,
        });
      } else {
        let indexElem = 0;
        if (
          elementsSeqEdit.filter((item) => item.includes("audio")).length > 0
        ) {
          indexElem =
            elementsSeqEdit.filter((item) => item.includes("audio")).length - i;
        } else {
          indexElem = i;
        }
        elementsSequence.push({
          type: "audio",
          value: onlyAudio[indexElem],
          original: onlyAudioNameOriginal[indexElem].name,
          number: newArrAudio[i],
          record: document
            .querySelector(`.check${newArrAudio[i]}`)
            .querySelector(".PrivateSwitchBase-input").checked,
        });
      }
    }
    //Todos os videos
    for (let i = 0; i < numberVideo; i++) {
      const onlyVideo =
        newNameFiles !== null &&
        newNameFiles.filter(
          (file) => file.includes("mp4") || file.includes("avi")
        );
      const onlyVideoNameOriginal = medias.filter(
        (file) => file.name.includes("mp4") || file.name.includes("avi")
      );
      if (elementsSeqEdit.includes(newArrVideo[i])) {
        const itemSelectedEdit = elementsEdit.filter(
          (item) => item.number === newArrVideo[i]
        )[0];
        elementsSequence.push({
          type: "video",
          value: itemSelectedEdit.value,
          original: itemSelectedEdit.original,
          number: itemSelectedEdit.number,
        });
      } else {
        let indexElem = 0;
        if (
          elementsSeqEdit.filter((item) => item.includes("video")).length > 0
        ) {
          indexElem =
            elementsSeqEdit.filter((item) => item.includes("video")).length - i;
        } else {
          indexElem = i;
        }
        elementsSequence.push({
          type: "video",
          value: onlyVideo[indexElem],
          original: onlyVideoNameOriginal[indexElem].name,
          number: newArrVideo[i],
        });
      }
    }

    console.log(elementsSequence);

    return elementsSequence;
  };

  const deleteElementsTypeOne = (id, type) => {
    if (type === "message") {
      setNumberMessages((old) => old - 1);
      setElementsSeq((old) => old.filter((item) => item !== `message${id}`));
      setElementsSeqEdit((old) =>
        old.filter((item) => item !== `message${id}`)
      );
      document.querySelector(`.stackMessage${id}`).remove();
    }
    if (type === "interval") {
      setNumberInterval((old) => old - 1);
      setElementsSeq((old) => old.filter((item) => item !== `interval${id}`));
      setElementsSeqEdit((old) =>
        old.filter((item) => item !== `interval${id}`)
      );
      document.querySelector(`.stackInterval${id}`).remove();
    }
    if (type === "img") {
      setNumberImg((old) => old - 1);
      setPreviewImg((old) => {
        setMedias((oldMedia) => {
          try {
            return oldMedia.filter(
              (mediaItem) =>
                mediaItem.name !==
                old.filter((item) => item.number === id)[0].name
            );
          } catch (e) {
            return oldMedia;
          }
        });
        return old.filter((item) => item.number !== id);
      });
      setElementsSeq((old) => old.filter((item) => item !== `img${id}`));
      setElementsSeqEdit((old) => old.filter((item) => item !== `img${id}`));
      document.querySelector(`.stackImg${id}`).remove();
    }
    if (type === "audio") {
      setNumberAudio((old) => old - 1);
      setPreviewAudios((old) => {
        setMedias((oldMedia) => {
          try {
            return oldMedia.filter(
              (mediaItem) =>
                mediaItem.name !==
                old.filter((item) => item.number === id)[0].name
            );
          } catch (e) {
            return oldMedia;
          }
        });
        return old.filter((item) => item.number !== id);
      });
      setElementsSeq((old) => old.filter((item) => item !== `audio${id}`));
      setElementsSeqEdit((old) => old.filter((item) => item !== `audio${id}`));
      document.querySelector(`.stackAudio${id}`).remove();
    }
    if (type === "pdf") {
      setNumberPdf((old) => old - 1);
      setPreviewPdf((old) => {
        setMedias((oldMedia) => {
          try {
            return oldMedia.filter(
              (mediaItem) =>
                mediaItem.name !==
                old.filter((item) => item.number === id)[0].name
            );
          } catch (e) {
            return oldMedia;
          }
        });
        return old.filter((item) => item.number !== id);
      });
      setElementsSeq((old) => old.filter((item) => item !== `pdf${id}`));
      setElementsSeqEdit((old) => old.filter((item) => item !== `pdf${id}`));
      document.querySelector(`.stackPdf${id}`).remove(); // usamos optional chaining por seguridad
    }

    if (type === "video") {
      setNumberVideo((old) => old - 1);
      setPreviewVideos((old) => {
        setMedias((oldMedia) => {
          try {
            return oldMedia.filter(
              (mediaItem) =>
                mediaItem.name !==
                old.filter((item) => item.number === id)[0].name
            );
          } catch (e) {
            return oldMedia;
          }
        });
        return old.filter((item) => item.number !== id);
      });
      setElementsSeq((old) => old.filter((item) => item !== `video${id}`));
      setElementsSeqEdit((old) => old.filter((item) => item !== `video${id}`));
      document.querySelector(`.stackVideo${id}`).remove();
    }
  };

  const moveElementDown = (id) => {
    setElementsSeq((old) => {
      const array = old;
      const index = array.indexOf(id);
      moveItemParaFrente(index);
      console.log("id", id);
      if (index !== -1 && index < array.length - 1) {
        // Verifica se o elemento foi encontrado no array e não está na última posição
        const novoArray = [...array]; // Cria uma cópia do array original
        const elementoMovido = novoArray.splice(index, 1)[0];
        novoArray.splice(index + 1, 0, elementoMovido);
        return novoArray;
      }
      return array;
    });
  };

  const moveElementUp = (id) => {
    setElementsSeq((old) => {
      const array = old;
      const index = array.indexOf(id);
      moveItemParaTras(index);

      if (index !== -1 && index > 0) {
        // Verifica se o elemento foi encontrado no array e não está na primeira posição
        const novoArray = [...array]; // Cria uma cópia do array original
        const elementoMovido = novoArray.splice(index, 1)[0];
        novoArray.splice(index - 1, 0, elementoMovido);
        return novoArray;
      }
      return array;
    });
  };

  function moveItemParaFrente(posicao) {
    setElements((old) => {
      const array = old;

      if (posicao >= 0 && posicao < array.length - 1) {
        const novoArray = [...array]; // Cria uma cópia do array original
        const elementoMovido = novoArray.splice(posicao, 1)[0];
        novoArray.splice(posicao + 1, 0, elementoMovido);
        return novoArray;
      }

      return array; // Retorna o array original se a movimentação não for possível
    });
  }

  function moveItemParaTras(posicao) {
    setElements((old) => {
      const array = old;
      if (posicao > 0 && posicao < array.length) {
        const novoArray = [...array]; // Cria uma cópia do array original
        const elementoMovido = novoArray.splice(posicao, 1)[0];
        novoArray.splice(posicao - 1, 0, elementoMovido);
        return novoArray;
      }

      return array; // Retorna o array original se a movimentação não for possível
    });
  }

  const handleChangeMediasImg = (e, number) => {
    if (!e.target.files) {
      return;
    }

    if (e.target.files[0].size > 2000000) {
      toast.error("El archivo es demasiado grande! 2MB máximo");
      return;
    }
    const imgBlob = URL.createObjectURL(e.target.files[0]);
    setPreviewImg((old) => [
      ...old,
      {
        number: number,
        url: imgBlob,
        name: e.target.files[0].name,
      },
    ]);
    const selectedMedias = Array.from(e.target.files);
    setMedias((old) => [...old, selectedMedias[0]]);

    document.querySelector(`.img${number}`).src = imgBlob;
    document.querySelector(`.btnImg${number}`).remove();
  };

  const handleChangeMediasPdf = (e, number) => {
    if (!e.target.files) {
      return;
    }
  
    const file = e.target.files[0];
  
    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten archivos PDF");
      return;
    }
  
    if (file.size > 5000000) {
      // Puedes ajustar el límite si quieres
      toast.error("El archivo es demasiado grande. Máximo 5MB");
      return;
    }
  
    const fileUrl = URL.createObjectURL(file);
  
    setPreviewPdf((old) => [
      ...old,
      {
        number: number,
        url: fileUrl,
        name: file.name,
      },
    ]);
  
    setMedias((old) => [...old, file]);
  
    // Opcional: puedes actualizar el texto del enlace o mostrar algo dinámico
    const linkEl = document.querySelector(`.pdf${number}`);
    if (linkEl) {
      linkEl.href = fileUrl;
      linkEl.textContent = "Ver PDF cargado";
      linkEl.style.textDecoration = "underline";
      linkEl.style.color = "#FF9800";
    }
  
    // Remover el botón de carga si se desea
    const btn = document.querySelector(`.btnPdf${number}`);
    if (btn) {
      btn.remove();
    }
  };
  
  const handleChangeAudios = (e, number) => {
    if (!e.target.files) {
      return;
    }

    if (e.target.files[0].size > 5000000) {
      toast.error("El archivo es demasiado grande. 5MB máximo");
      return;
    }

    const audioBlob = URL.createObjectURL(e.target.files[0]);
    setPreviewAudios((old) => [
      ...old,
      {
        number: number,
        url: audioBlob,
        name: e.target.files[0].name,
      },
    ]);

    const selectedMedias = Array.from(e.target.files);
    setMedias((old) => [...old, selectedMedias[0]]);

    document.querySelector(
      `.audio${number}`
    ).innerHTML = `<audio controls="controls">
    <source src="${audioBlob}" type="audio/mp3" />
    tu navegador no soporta HTML5
  </audio>`;
    document.querySelector(`.btnAudio${number}`).remove();
  };

  const handleChangeVideos = (e, number) => {
    if (!e.target.files) {
      return;
    }

    if (e.target.files[0].size > 20000000) {
      toast.error("El archivo es demasiado grande! 20MB máximo");
      return;
    }
    const videoBlob = URL.createObjectURL(e.target.files[0]);
    setPreviewVideos((old) => [
      ...old,
      {
        number: number,
        url: videoBlob,
        name: e.target.files[0].name,
      },
    ]);

    var divConteudo = document.createElement("div");

    const selectedMedias = Array.from(e.target.files);
    setMedias((old) => [...old, selectedMedias[0]]);

    divConteudo.innerHTML = `<video controls="controls" style="width: 200px;">
    <source src="${videoBlob}" type="video/mp4" />
    tu navegador no soporta HTML5
  </video>`;

    document.querySelector(`.video${number}`).appendChild(divConteudo);
    document.querySelector(`.btnVideo${number}`).remove();
  };

  const imgLayout = (number, valueDefault = "") => {
    return (
      <Stack
        className={`stackImg${number} ${classes.elementCard}`}
        key={`stackImg${number}`}
      >
        <Stack sx={{ position: "absolute", right: 8, top: 8 }}>
          <Delete className={classes.deleteIcon} onClick={() => deleteElementsTypeOne(number, "img")} />
        </Stack>
        <Typography className={classes.elementTitle}>Imagen</Typography>
        <Stack direction={"row"} justifyContent={"center"}>
          <img
            src={
              valueDefault.length > 0
                ? process.env.REACT_APP_BACKEND_URL + "/public/" + valueDefault
                : ""
            }
            className={`img${number}`}
            style={{ width: "200px" }}
          />
        </Stack>
        {valueDefault.length === 0 && (
          <Button
            component="label"
            className={`btnImg${number} ${classes.uploadBtn}`}
          >
            Subir imagen
            <input
              type="file"
              accept="image/png, image/jpg, image/jpeg"
              hidden
              onChange={(e) => handleChangeMediasImg(e, number)}
            />
          </Button>
        )}
      </Stack>
    );
  };

  const pdfLayout = (number, valueDefault = "") => {
    return (
      <Stack
        className={`stackPdf${number} ${classes.elementCard}`}
        key={`stackPdf${number}`}
      >
        <Stack sx={{ position: "absolute", right: 8, top: 8 }}>
          <Delete className={classes.deleteIcon} onClick={() => deleteElementsTypeOne(number, "pdf")} />
        </Stack>
        <Typography className={classes.elementTitle}>PDF</Typography>
        <Stack direction={"row"} justifyContent={"center"}>
          {valueDefault.length > 0 ? (
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/public/${valueDefault}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`pdf${number}`}
              style={{
                color: "#FF9800",
                fontWeight: "bold",
                textDecoration: "underline",
              }}
            >
              Ver PDF
            </a>
          ) : (
            <Typography className={`pdf${number}`} color="text.secondary">
              Aún no se ha subido ningún PDF
            </Typography>
          )}
        </Stack>
        {valueDefault.length === 0 && (
          <Button
            component="label"
            className={`btnPdf${number} ${classes.uploadBtn}`}
          >
            Subir PDF
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => handleChangeMediasPdf(e, number)}
            />
          </Button>
        )}
      </Stack>
    );
  };
  

  const audioLayout = (number, valueDefault = "", valueRecordDefault = "") => {
    return (
      <Stack
        className={`stackAudio${number} ${classes.elementCard}`}
        key={`stackAudio${number}`}
      >
        <Stack sx={{ position: "absolute", right: 8, top: 8 }} direction={"row"} gap={1}>
          <Delete className={classes.deleteIcon} onClick={() => deleteElementsTypeOne(number, "audio")} />
        </Stack>
        <Typography className={classes.elementTitle}>Audio</Typography>
        <div
          className={`audio${number}`}
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          {valueDefault.length > 0 && (
            <audio controls="controls">
              <source
                src={
                  process.env.REACT_APP_BACKEND_URL + "/public/" + valueDefault
                }
                type="audio/mp3"
              />
              tu navegador no soporta HTML5
            </audio>
          )}
        </div>
        {valueDefault.length === 0 && (
          <Button
            component="label"
            className={`btnAudio${number} ${classes.uploadBtn}`}
          >
            Subir audio
            <input
              type="file"
              accept="audio/ogg, audio/mp3, audio/opus"
              hidden
              onChange={(e) => handleChangeAudios(e, number)}
            />
          </Button>
        )}
        <Stack direction={"row"} justifyContent={"center"}>
          <Checkbox
            className={`checkaudio${number}`}
            defaultChecked={valueRecordDefault === "ok" ? false : true}
          />
          <Stack justifyContent={"center"}>
            <Typography>Enviar como audio grabado</Typography>
          </Stack>
        </Stack>
      </Stack>
    );
  };

  const videoLayout = (number, valueDefault = "") => {
    return (
      <Stack
        className={`stackVideo${number} ${classes.elementCard}`}
        key={`stackVideo${number}`}
      >
        <Stack sx={{ position: "absolute", right: 8, top: 8 }}>
          <Delete className={classes.deleteIcon} onClick={() => deleteElementsTypeOne(number, "video")} />
        </Stack>
        <Typography className={classes.elementTitle}>Video</Typography>
        <div
          className={`video${number}`}
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          {valueDefault.length > 0 && (
            <video controls="controls" style={{ width: "200px" }}>
              <source
                src={
                  process.env.REACT_APP_BACKEND_URL + "/public/" + valueDefault
                }
                type="video/mp4"
              />
              tu navegador no soporta HTML5
            </video>
          )}
        </div>
        {valueDefault.length === 0 && (
          <Button
            component="label"
            className={`btnVideo${number} ${classes.uploadBtn}`}
          >
            Subir video
            <input
              type="file"
              accept="video/mp4"
              hidden
              onChange={(e) => handleChangeVideos(e, number)}
            />
          </Button>
        )}
      </Stack>
    );
  };

  const messageLayout = (number, valueDefault = "") => {
    return (
      <Stack
        className={`stackMessage${number} ${classes.elementCard}`}
        key={`stackMessage${number}`}
      >
        <Stack sx={{ position: "absolute", right: 8, top: 8 }}>
          <Delete className={classes.deleteIcon} onClick={() => deleteElementsTypeOne(number, "message")} />
        </Stack>
        <Typography className={classes.elementTitle}>Texto</Typography>
        <TextField
          label={"Mensagem"}
          defaultValue={valueDefault}
          multiline
          rows={7}
          className={`message${number}`}
          name="text"
          variant="outlined"
          margin="dense"
          style={{ width: "100%" }}
        />
      </Stack>
    );
  };

  const intervalLayout = (number, valueDefault = 0) => {
    return (
      <Stack
        className={`stackInterval${number} ${classes.elementCard}`}
        key={`stackInterval${number}`}
      >
        <Stack sx={{ position: "absolute", right: 8, top: 8 }}>
          <Delete className={classes.deleteIcon} onClick={() => deleteElementsTypeOne(number, "interval")} />
        </Stack>
        <Typography className={classes.elementTitle}>Intervalo</Typography>
        <TextField
          label={"Tempo em segundos"}
          className={`interval${number}`}
          defaultValue={valueDefault}
          type="number"
          InputProps={{ inputProps: { min: 0, max: 120 } }}
          variant="outlined"
          margin="dense"
          style={{ width: "100%" }}
        />
      </Stack>
    );
  };

  useEffect(() => {
    const localVariables = localStorage.getItem("variables");
    if (localVariables) {
      setVariables(JSON.parse(localVariables));
    }

    if (open === "edit") {
      setLabels({
        title: "Editar contenidos",
        btn: "Guardar",
      });

      setElementsSeq(data.data.seq);

      setElementsSeqEdit(data.data.seq);
      setElementsEdit(data.data.elements);
      if (data) {
        const elementsEditLoc = data.data.elements;
        const sequence = data.data.seq;

        sequence.map((item) => {
          const itemNode = elementsEditLoc.filter(
            (inode) => inode.number === item
          )[0];
          if (itemNode.type === "message") {
            const numberLoc = parseInt(item.replace("message", ""));
            setElements((elm) => [
              ...elm,
              messageLayout(numberLoc, itemNode.value),
            ]);
            setNumberMessages((old) => {
              const arsOnly = sequence.filter((item) =>
                item.includes("message")
              );
              const arrNumberMax = arsOnly.map((item) =>
                parseInt(item.replace("message", ""))
              );
              setNumberMessagesLast(Math.max.apply(null, arrNumberMax) + 1);
              return old + 1;
            });
          }
          if (itemNode.type === "interval") {
            const numberLoc = parseInt(item.replace("interval", ""));
            setElements((elm) => [
              ...elm,
              intervalLayout(numberLoc, itemNode.value),
            ]);
            setNumberInterval((old) => {
              const arsOnly = sequence.filter((item) =>
                item.includes("interval")
              );
              const arrNumberMax = arsOnly.map((item) =>
                parseInt(item.replace("interval", ""))
              );
              setNumberIntervalLast(Math.max.apply(null, arrNumberMax) + 1);
              return old + 1;
            });
          }
          if (itemNode.type === "audio") {
            const numberLoc = parseInt(item.replace("audio", ""));
            setElements((elm) => [
              ...elm,
              audioLayout(
                numberLoc,
                itemNode.value,
                itemNode.record ? "" : "ok"
              ),
            ]);
            setNumberAudio((old) => {
              const arsOnly = sequence.filter((item) => item.includes("audio"));
              const arrNumberMax = arsOnly.map((item) =>
                parseInt(item.replace("audio", ""))
              );
              setNumberAudioLast(Math.max.apply(null, arrNumberMax) + 1);
              return old + 1;
            });
          }
          if (itemNode.type === "img") {
            const numberLoc = parseInt(item.replace("img", ""));
            setElements((elm) => [
              ...elm,
              imgLayout(numberLoc, itemNode.value),
            ]);
            setNumberImg((old) => {
              const arsOnly = sequence.filter((item) => item.includes("img"));
              const arrNumberMax = arsOnly.map((item) =>
                parseInt(item.replace("img", ""))
              );
              setNumberImgLast(Math.max.apply(null, arrNumberMax) + 1);
              return old + 1;
            });
          }

          if (itemNode.type === "pdf") {
            const numberLoc = parseInt(item.replace("pdf", ""));
            setElements((elm) => [
              ...elm,
              pdfLayout(numberLoc, itemNode.value), // Asume que tienes una función como imgLayout
            ]);
            setNumberPdf((old) => {
              const arsOnly = sequence.filter((item) => item.includes("pdf"));
              const arrNumberMax = arsOnly.map((item) =>
                parseInt(item.replace("pdf", ""))
              );
              setNumberPdfLast(Math.max.apply(null, arrNumberMax) + 1);
              return old + 1;
            });
          }


          if (itemNode.type === "video") {
            const numberLoc = parseInt(item.replace("video", ""));
            setElements((elm) => [
              ...elm,
              videoLayout(numberLoc, itemNode.value),
            ]);
            setNumberVideo((old) => {
              const arsOnly = sequence.filter((item) => item.includes("video"));
              const arrNumberMax = arsOnly.map((item) =>
                parseInt(item.replace("video", ""))
              );
              setNumberVideoLast(Math.max.apply(null, arrNumberMax) + 1);
              return old + 1;
            });
          }
        });
      }
      setActiveModal(true);
    }
    if (open === "create") {
      setLabels({
        title: "Añadir contenidos al flujo",
        btn: "Añadir",
      });
      setTextDig();
      setArrayOption([]);
      setActiveModal(true);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleClose = async () => {
    close(null);
    setActiveModal(false);
    setTimeout(() => {
      setMedias([]);
      setPreviewImg([]);
      setPreviewAudios([]);
      setPreviewVideos([]);
      setArrayOption([]);
      setElements([]);
      setElementsSeq([]);
      setElementsEdit([]);
      setElementsSeqEdit([]);
      setNumberMessages(0);
      setNumberMessagesLast(0);
      setNumberInterval(0);
      setNumberIntervalLast(0);
      setNumberAudio(0);
      setNumberAudioLast(0);
      setNumberVideo(0);
      setNumberVideoLast(0);
      setNumberImg(0);
      setNumberPdf(0);
      setNumberPdfLast(0);
      setNumberImgLast(0);
    }, 500);
  };

  const verifyButtonsUpload = () => {
    const newArrImg = elementsSeq.filter((item) => item.includes("img"));
    const newArrAudio = elementsSeq.filter((item) => item.includes("audio"));
    const newArrVideo = elementsSeq.filter((item) => item.includes("video"));
    const newArrPdf = elementsSeq.filter((item) => item.includes("pdf"));

    for (let i = 0; i < numberImg; i++) {
      const imgVerify = document.querySelector(
        `.btn${capitalize(newArrImg[i])}`
      );
      if (imgVerify) {
        return true;
      }
    }
    for (let i = 0; i < numberPdf; i++) {
      const pdfVerify = document.querySelector(
        `.btn${capitalize(newArrPdf[i])}`
      );
      if (pdfVerify) {
        return true;
      }
    }

    for (let i = 0; i < numberAudio; i++) {
      const audioVerify = document.querySelector(
        `.btn${capitalize(newArrAudio[i])}`
      );
      if (audioVerify) {
        return true;
      }
    }
    for (let i = 0; i < numberVideo; i++) {
      const videoVerify = document.querySelector(
        `.btn${capitalize(newArrVideo[i])}`
      );
      if (videoVerify) {
        return true;
      }
    }
  };

  const handleSaveNode = async () => {
    if (open === "edit") {
      setLoading(true);
      const formData = new FormData();

      try {
        // Process all media files and wait for compression
        const compressionPromises = medias.map((media) => {
          return new Promise((resolve, reject) => {
            const file = media;

            if (!file) {
              resolve();
              return;
            }

            if (media?.type.split("/")[0] === "image") {
              new Compressor(file, {
                quality: 0.7,
                success(compressedMedia) {
                  formData.append("medias", compressedMedia);
                  formData.append("body", compressedMedia.name);
                  resolve();
                },
                error(err) {
                  console.error("Compression error:", err);
                  reject(err);
                }
              });
            } else if (media?.type === "application/pdf") {
              // PDF
              formData.append("medias", media);
              formData.append("body", media.name);
              resolve();
            } else {
              // OTROS TIPOS: audio, video, etc.
              formData.append("medias", media);
              formData.append("body", media.name);
              resolve();
            }
          });
        });

        // Wait for all compressions to complete
        await Promise.all(compressionPromises);

        if (
          (numberAudio === 0 && numberVideo === 0 && numberImg === 0 && numberPdf === 0) ||
          medias.length === 0
        ) {
          try {
            const mountData = {
              seq: elementsSeq,
              elements: handleElements(null),
            };
            console.log("QUI", mountData);
            onUpdate({
              ...data,
              data: mountData,
            });
            toast.success("¡Contenido añadido correctamente!");
            handleClose();
            setLoading(false);
            return;
          } catch (e) {
            console.log(e);
            setLoading(false);
            return;
          }
        }

        const verify = verifyButtonsUpload();
        if (verify) {
          setLoading(false);
          return toast.error("Borrar las tarjetas vacías (Imagen, Audio y Vídeo)");
        }

        console.log("FormData ready, uploading content...");
        const res = await api.post("/flowbuilder/content", formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        const mountData = {
          seq: elementsSeq,
          elements: handleElements(res.data),
        };
        onUpdate({
          ...data,
          data: mountData,
        });
        toast.success("¡Contenido añadido correctamente!");
        await handleClose();
        setLoading(false);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Error al subir el contenido");
        setLoading(false);
      }
    } else if (open === "create") {
      setLoading(true);
      const formData = new FormData();

      try {
        // Process all media files and wait for compression
        const compressionPromises = medias.map((media) => {
          return new Promise((resolve, reject) => {
            const file = media;

            if (!file) {
              resolve();
              return;
            }

            if (media?.type.split("/")[0] === "image") {
              new Compressor(file, {
                quality: 0.7,
                success(compressedMedia) {
                  formData.append("medias", compressedMedia);
                  formData.append("body", compressedMedia.name);
                  resolve();
                },
                error(err) {
                  console.error("Compression error:", err);
                  reject(err);
                }
              });
            } else if (media?.type === "application/pdf") {
              // PDF
              formData.append("medias", media);
              formData.append("body", media.name);
              resolve();
            } else {
              formData.append("medias", media);
              formData.append("body", media.name);
              resolve();
            }
          });
        });

        // Wait for all compressions to complete
        await Promise.all(compressionPromises);

        if (numberAudio === 0 && numberVideo === 0 && numberImg === 0 && numberPdf === 0) {
          try {
            const mountData = {
              seq: elementsSeq,
              elements: handleElements(null),
            };
            onSave({
              ...mountData,
            });
            toast.success("¡Contenido añadido correctamente!");
            handleClose();
            setLoading(false);
            return;
          } catch (e) {
            setLoading(false);
            return;
          }
        }

        const verify = verifyButtonsUpload();
        if (verify) {
          setLoading(false);
          return toast.error("Borrar las tarjetas vacías (Imagen, Audio y Vídeo)");
        }

        console.log("FormData ready, uploading content...");
        const res = await api.post("/flowbuilder/content", formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        const mountData = {
          seq: elementsSeq,
          elements: handleElements(res.data),
        };
        onSave({
          ...mountData,
        });
        toast.success("¡Contenido añadido correctamente!");
        handleClose();
        setLoading(false);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Error al subir el contenido");
        setLoading(false);
      }
    }
  };

  const scrollToBottom = (className) => {
    const element = document.querySelector(className);
    element.scrollTop = element.scrollHeight;
  };

  const variableFormatter = (item) => {
    return "{{" + item + "}}";
  };
  return (
    <div>
      <Dialog open={activeModal} fullWidth maxWidth="md" scroll="paper" className={classes.dialog}>
        {!loading && (
          <div className={classes.header}>
            <div className={classes.headerLeft}>
              <div className={classes.headerIcon}>
                <DashboardOutlinedIcon />
              </div>
              <div>
                <Typography className={classes.headerTitle}>{labels.title}</Typography>
                <Typography className={classes.headerSubtitle}>Texto, audio, video, imagen, PDF e intervalos</Typography>
              </div>
            </div>
            <IconButton className={classes.closeBtn} onClick={handleClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>
        )}
        <Stack>
          <Stack
            className="body-card"
            style={{
              gap: "8px",
              padding: "16px",
              overflow: "auto",
              height: "70vh",
              scrollBehavior: "smooth",
              display: loading && "none",
            }}
          >
            {elements.map((item) => (
              <>{item}</>
            ))}
            <Stack direction={"row"} gap={1} flexWrap="wrap">
              <Button className={classes.typeBtn} onClick={() => {
                  setElements((old) => [...old, messageLayout(numberMessagesLast)]);
                  setNumberMessages((old) => { setElementsSeq((oldEleme) => [...oldEleme, `message${numberMessagesLast}`]); return old + 1; });
                  setNumberMessagesLast((old) => old + 1);
                  setTimeout(() => { scrollToBottom(".body-card"); }, 100);
                }}><Message /> Texto</Button>
              <Button className={classes.typeBtn} onClick={() => {
                  setElements((old) => [...old, intervalLayout(numberIntervalLast)]);
                  setNumberInterval((old) => { setElementsSeq((oldEleme) => [...oldEleme, `interval${numberIntervalLast}`]); return old + 1; });
                  setNumberIntervalLast((old) => old + 1);
                  setTimeout(() => { scrollToBottom(".body-card"); }, 100);
                }}><AccessTime /> Intervalo</Button>
              <Button className={classes.typeBtn} onClick={() => {
                  setElements((old) => [...old, imgLayout(numberImgLast)]);
                  setNumberImg((old) => { setElementsSeq((oldEleme) => [...oldEleme, `img${numberImgLast}`]); return old + 1; });
                  setNumberImgLast((old) => old + 1);
                  setTimeout(() => { scrollToBottom(".body-card"); }, 100);
                }}><Image /> Imagen</Button>
              <Button className={classes.typeBtn} onClick={() => {
                  setElements((old) => [...old, audioLayout(numberAudioLast)]);
                  setNumberAudio((old) => { setElementsSeq((oldEleme) => [...oldEleme, `audio${numberAudioLast}`]); return old + 1; });
                  setNumberAudioLast((old) => old + 1);
                  setTimeout(() => { scrollToBottom(".body-card"); }, 100);
                }}><MicNone /> Audio</Button>
              <Button className={classes.typeBtn} onClick={() => {
                  setElements((old) => [...old, videoLayout(numberVideoLast)]);
                  setNumberVideo((old) => { setElementsSeq((oldEleme) => [...oldEleme, `video${numberVideoLast}`]); return old + 1; });
                  setNumberVideoLast((old) => old + 1);
                  setTimeout(() => { scrollToBottom(".body-card"); }, 100);
                }}><Videocam /> Video</Button>
              <Button className={classes.typeBtn} onClick={() => {
                  setElements((old) => [...old, pdfLayout(numberPdfLast)]);
                  setNumberPdf((old) => { setElementsSeq((oldEleme) => [...oldEleme, `pdf${numberPdfLast}`]); return old + 1; });
                  setNumberPdfLast((old) => old + 1);
                  setTimeout(() => { scrollToBottom(".body-card"); }, 100);
                }}><PictureAsPdf /> PDF</Button>
            </Stack>
            <Divider style={{ margin: "8px 0" }} />
            <Box className={classes.variablesSection}>
              <Typography style={{ fontWeight: 600 }}>Variables</Typography>
              {variables && variables.map((item, idx) => (
                <Typography key={idx}>{variableFormatter(item)}</Typography>
              ))}
            </Box>
          </Stack>

          <DialogActions className={classes.actions} style={{ display: loading ? "none" : "flex" }}>
            <Button className={classes.cancelBtn} onClick={handleClose}>
              Cancelar
            </Button>
            <Button className={classes.saveBtn} onClick={() => handleSaveNode()}>
              {labels.btn}
            </Button>
          </DialogActions>
        </Stack>
        {loading && (
          <div className={classes.loadingBox}>
            <CircularProgress size={44} style={{ color: "#5BC2D2" }} />
            <Typography className={classes.loadingText}>
              Cargando archivos y creando contenido...
            </Typography>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default FlowBuilderSingleBlockModal;
