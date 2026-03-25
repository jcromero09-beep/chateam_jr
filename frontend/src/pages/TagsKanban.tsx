import React, {
  useState,
  useEffect,
  useReducer,
} from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import IconButton from "@material-ui/core/IconButton";
import SearchIcon from "@material-ui/icons/Search";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import CircularProgress from "@material-ui/core/CircularProgress";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";
import { Chip, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from "@material-ui/core";

import api from "../services/api";
// @ts-ignore
import TagModal from "../components/TagModal";

const reducer = (state: any, action: any) => {
  if (action.type === "LOAD_TAGS") {
    const tags = action.payload;
    const newTags: any[] = [];

    tags.forEach((tag: any) => {
      const tagIndex = state.findIndex((s: any) => s.id === tag.id);
      if (tagIndex !== -1) {
        state[tagIndex] = tag;
      } else {
        newTags.push(tag);
      }
    });

    return [...state, ...newTags];
  }

  if (action.type === "UPDATE_TAGS") {
    const tag = action.payload;
    const tagIndex = state.findIndex((s: any) => s.id === tag.id);

    if (tagIndex !== -1) {
      state[tagIndex] = tag;
      return [...state];
    } else {
      return [tag, ...state];
    }
  }

  if (action.type === "DELETE_TAGS") {
    const tagId = action.payload;

    const tagIndex = state.findIndex((s: any) => s.id === tagId);
    if (tagIndex !== -1) {
      state.splice(tagIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }

  return state;
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    margin: theme.spacing(2),
  },
  mainContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: theme.spacing(2),
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing(2),
    flexWrap: "wrap",
    gap: theme.spacing(2),
  },
  buttonsWrapper: {
    display: "flex",
    gap: theme.spacing(1),
    alignItems: "center",
  },
}));

// Helper function to display error toasts
const toastError = (err: any) => {
  const errorMsg = err.response?.data?.message || err.message || "An error occurred";
  toast.error(errorMsg);
};

const TagsKanban = () => {
  const classes = useStyles();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [deletingTag, setDeletingTag] = useState<any>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [searchParam, setSearchParam] = useState("");
  const [tags, dispatch] = useReducer(reducer, []);
  const [tagModalOpen, setTagModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchTags = async () => {
        try {
          const { data } = await api.get("/tags/", {
            params: { searchParam, pageNumber, kanban: 1 },
          });
          dispatch({ type: "LOAD_TAGS", payload: data.tags });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
          setLoading(false);
        }
      };
      fetchTags();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  const reloadTags = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/tags/", {
        params: { searchParam, pageNumber: 1, kanban: 1 },
      });
      dispatch({ type: "LOAD_TAGS", payload: data.tags });
      setHasMore(data.hasMore);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTagModal = () => {
    setSelectedTag(null);
    setTagModalOpen(true);
  };

  const handleCloseTagModal = () => {
    setSelectedTag(null);
    setTagModalOpen(false);
  };

  const handleSaved = () => {
    setSelectedTag(null);
    setTagModalOpen(false);
    reloadTags();
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleEditTag = (tag: any) => {
    setSelectedTag(tag);
    setTagModalOpen(true);
  };

  const handleDeleteTag = async (tagId: number) => {
    try {
      await api.delete(`/tags/${tagId}`);
      toast.success("Etiqueta eliminada con éxito");
      dispatch({ type: "DELETE_TAGS", payload: tagId });
    } catch (err) {
      toastError(err);
    }
    setDeletingTag(null);
    setConfirmModalOpen(false);
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e: any) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  const handleReturnToKanban = () => {
    navigate("/kanban");
  };

  return (
    <div className={classes.mainContainer}>
      {/* Confirmation Modal */}
      <Dialog
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
      >
        <DialogTitle>
          {deletingTag ? `¿Eliminar etiqueta "${deletingTag.name}"?` : "Confirmar"}
        </DialogTitle>
        <DialogContent>
          <Typography>¿Estás seguro de que quieres eliminar esta etiqueta?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmModalOpen(false)} color="default">
            Cancelar
          </Button>
          <Button
            onClick={() => deletingTag && handleDeleteTag(deletingTag.id)}
            color="secondary"
            variant="contained"
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tag Modal */}
      {tagModalOpen && (
        <TagModal
          open={tagModalOpen}
          onClose={handleCloseTagModal}
          onSaved={handleSaved}
          aria-labelledby="form-dialog-title"
          tagId={selectedTag?.id}
          kanban={1}
        />
      )}

      {/* Header */}
      <div className={classes.header}>
        <Typography variant="h5" color="primary">
          Etiquetas Kanban ({tags.length})
        </Typography>
        <div className={classes.buttonsWrapper}>
          <TextField
            placeholder="Buscar etiquetas..."
            type="search"
            value={searchParam}
            onChange={handleSearch}
            variant="outlined"
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon style={{ color: "gray" }} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenTagModal}
          >
            Añadir Etiqueta
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleReturnToKanban}
          >
            Volver a Kanban
          </Button>
        </div>
      </div>

      {/* Table */}
      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell align="center">Nombre</TableCell>
              <TableCell align="center">Tickets</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tags.map((tag: any) => (
              <TableRow key={tag.id}>
                <TableCell align="center">
                  <Chip
                    variant="outlined"
                    style={{
                      backgroundColor: tag.color,
                      textShadow: "1px 1px 1px #000",
                      color: "white",
                    }}
                    label={tag.name}
                    size="small"
                  />
                </TableCell>
                <TableCell align="center">
                  {tag?.ticketTags ? <span>{tag?.ticketTags?.length}</span> : <span>0</span>}
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleEditTag(tag)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setConfirmModalOpen(true);
                      setDeletingTag(tag);
                    }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {loading && (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </div>
  );
};

export default TagsKanban;
