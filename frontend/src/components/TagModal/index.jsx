import React, { useState, useEffect } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Checkbox from "@material-ui/core/Checkbox";
import { Colorize } from "@material-ui/icons";
import { ColorBox } from 'material-ui-color';

import api from "../../services/api";
import { FormControl, IconButton, InputAdornment, InputLabel, MenuItem, Select } from "@material-ui/core";
import { Grid } from "@material-ui/core";

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		flexWrap: "wrap",
	},
	multFieldLine: {
		display: "flex",
		"& > *:not(:last-child)": {
			marginRight: theme.spacing(1),
		},
	},

	btnWrapper: {
		position: "relative",
	},

	buttonProgress: {
		color: green[500],
		position: "absolute",
		top: "50%",
		left: "50%",
		marginTop: -12,
		marginLeft: -12,
	},
	formControl: {
		margin: theme.spacing(1),
		minWidth: 120,
	},
	colorAdorment: {
		width: 20,
		height: 20,
	},
}));

const TagSchema = Yup.object().shape({
	name: Yup.string()
		.min(3, "Mensaje muy corto")
		.required("Requerido")
});

// Helper function to display error toasts
const toastError = (err) => {
	const errorMsg = err?.response?.data?.message || err?.message || "An error occurred";
	toast.error(errorMsg);
};

function getRandomHexColor() {
	const red = Math.floor(Math.random() * 256);
	const green = Math.floor(Math.random() * 256);
	const blue = Math.floor(Math.random() * 256);
	const hexColor = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
	return hexColor;
}

const TagModal = ({ open, onClose, tagId, kanban }) => {
	const classes = useStyles();
	const [colorPickerModalOpen, setColorPickerModalOpen] = useState(false);
	const [lanes, setLanes] = useState([]);
	const [loading, setLoading] = useState(false);
	const [selectedLane, setSelectedLane] = useState(null);
	const [selectedRollbackLane, setSelectedRollbackLane] = useState(null);

	const initialState = {
		id: null,
		name: "",
		color: getRandomHexColor(),
		kanban: kanban,
		timeLane: 0,
		timeLaneUnit: "hours",
		nextLaneId: 0,
		greetingMessageLane: "",
		rollbackLaneId: 0,
		enableFollowup: true,
		followupType: "once",
	};

	const [tag, setTag] = useState(initialState);

	useEffect(() => {
		setLoading(true);
		const delayDebounceFn = setTimeout(() => {
			const fetchTags = async () => {
				try {
					const { data } = await api.get("/tags/", {
						params: { kanban: 1, tagId },
					});
					setLanes(data.tags || []);
				} catch (err) {
					toastError(err);
				}
				setLoading(false);
			};
			fetchTags();
		}, 500);
		return () => clearTimeout(delayDebounceFn);
	}, []);

	useEffect(() => {
		const fetchTag = async () => {
			if (!tagId) return;
			try {
				const { data } = await api.get(`/tags/${tagId}`);

				setTag(prevState => ({ ...prevState, ...data }));
				if (data.nextLaneId) {
					setSelectedLane(data.nextLaneId);
				}
				if (data.rollbackLaneId) {
					setSelectedRollbackLane(data.rollbackLaneId);
				}
			} catch (err) {
				toastError(err);
			}
		};
		fetchTag();
	}, [tagId, open]);

	const handleClose = () => {
		setTag(initialState);
		setColorPickerModalOpen(false);
		onClose();
	};

	const handleSaveTag = async values => {
		const tagData = {
			...values,
			kanban: kanban,
			nextLaneId: selectedLane || null,
			rollbackLaneId: selectedRollbackLane || null
		};

		try {
			if (tagId) {
				await api.put(`/tags/${tagId}`, tagData);
			} else {
				await api.post("/tags", tagData);
			}
			toast.success(kanban === 0 ? "Etiqueta guardada con éxito" : "Columna Kanban guardada con éxito");
		} catch (err) {
			toastError(err);
		}
		handleClose();
	};

	return (
		<div className={classes.root}>
			<Dialog
				open={open}
				onClose={handleClose}
				maxWidth="md"
				fullWidth
				scroll="paper"
			>
				<DialogTitle id="form-dialog-title">
					{tagId
						? (kanban === 0 ? "Editar Etiqueta" : "Editar Columna Kanban")
						: (kanban === 0 ? "Añadir Etiqueta" : "Añadir Columna Kanban")
					}
				</DialogTitle>
				<Formik
					initialValues={tag}
					enableReinitialize={true}
					validationSchema={TagSchema}
					onSubmit={(values, actions) => {
						setTimeout(() => {
							handleSaveTag(values);
							actions.setSubmitting(false);
						}, 400);
					}}
				>
					{({ touched, errors, isSubmitting, values, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								<Grid container spacing={1}>
									<Grid item xs={12} md={12} xl={12}>
										<Field
											as={TextField}
											label="Nombre"
											name="name"
											error={touched.name && Boolean(errors.name)}
											helperText={touched.name && errors.name}
											variant="outlined"
											margin="dense"
											fullWidth
										/>
									</Grid>

									<Grid item xs={12} md={12} xl={12}>
										<Field
											as={TextField}
											fullWidth
											label="Color"
											name="color"
											id="color"
											error={touched.color && Boolean(errors.color)}
											helperText={touched.color && errors.color}
											InputProps={{
												startAdornment: (
													<InputAdornment position="start">
														<div
															style={{ backgroundColor: values.color }}
															className={classes.colorAdorment}
														></div>
													</InputAdornment>
												),
												endAdornment: (
													<IconButton
														size="small"
														color="default"
														onClick={() => setColorPickerModalOpen(!colorPickerModalOpen)}
													>
														<Colorize />
													</IconButton>
												),
											}}
											variant="outlined"
											margin="dense"
										/>

										{colorPickerModalOpen && (
											<div>
												<ColorBox
													disableAlpha={true}
													hslGradient={false}
													style={{ margin: '20px auto 0' }}
													value={values.color}
													onChange={val => {
														setFieldValue("color", `#${val.hex}`);
													}}
												/>
											</div>
										)}
									</Grid>

									{kanban === 1 && (
										<>
											<Grid item xs={12} md={4} xl={4}>
												<Field
													as={TextField}
													label="Tiempo en columna"
													name="timeLane"
													error={touched.timeLane && Boolean(errors.timeLane)}
													helperText={touched.timeLane && errors.timeLane}
													variant="outlined"
													margin="dense"
													fullWidth
												/>
											</Grid>

											<Grid item xs={12} md={2} xl={2}>
												<FormControl
													variant="outlined"
													margin="dense"
													fullWidth
												>
													<InputLabel id="timeLaneUnit-label">Unidad</InputLabel>
													<Select
														labelId="timeLaneUnit-label"
														id="timeLaneUnit"
														name="timeLaneUnit"
														value={values.timeLaneUnit || "hours"}
														label="Unidad"
														onChange={(e) => setFieldValue("timeLaneUnit", e.target.value)}
													>
														<MenuItem value="minutes">Minutos</MenuItem>
														<MenuItem value="hours">Horas</MenuItem>
														<MenuItem value="days">Días</MenuItem>
													</Select>
												</FormControl>
											</Grid>

											<Grid item xs={12} md={6} xl={6}>
												<FormControl
													variant="outlined"
													margin="dense"
													fullWidth
													className={classes.formControl}
												>
													<InputLabel id="nextLaneId-label">
														Siguiente Columna
													</InputLabel>
													<Field
														as={Select}
														labelId="nextLaneId-label"
														id="nextLaneId"
														name="nextLaneId"
														value={selectedLane || ""}
														onChange={(e) => {
															setSelectedLane(e.target.value);
															setFieldValue("nextLaneId", e.target.value);
														}}
														error={touched.nextLaneId && Boolean(errors.nextLaneId)}
													>
														<MenuItem value="">&nbsp;</MenuItem>
														{lanes &&
															lanes.map((lane) => (
																<MenuItem key={lane.id} value={lane.id}>
																	{lane.name}
																</MenuItem>
															))}
													</Field>
												</FormControl>
											</Grid>

											<Grid item xs={12} md={12} xl={12}>
												<Field
													as={TextField}
													label="Mensaje de Saludo"
													name="greetingMessageLane"
													rows={5}
													multiline
													error={touched.greetingMessageLane && Boolean(errors.greetingMessageLane)}
													helperText={touched.greetingMessageLane && errors.greetingMessageLane}
													variant="outlined"
													margin="dense"
													fullWidth
												/>
											</Grid>

											<Grid item xs={12} md={12} xl={12}>
												<FormControl
													variant="outlined"
													margin="dense"
													fullWidth
													className={classes.formControl}
												>
													<InputLabel id="rollbackLaneId-label">
														Columna de Retorno
													</InputLabel>
													<Field
														as={Select}
														labelId="rollbackLaneId-label"
														id="rollbackLaneId"
														name="rollbackLaneId"
														value={selectedRollbackLane || ""}
														onChange={(e) => {
															setSelectedRollbackLane(e.target.value);
															setFieldValue("rollbackLaneId", e.target.value);
														}}
														error={touched.rollbackLaneId && Boolean(errors.rollbackLaneId)}
													>
														<MenuItem value="">&nbsp;</MenuItem>
														{lanes &&
															lanes.map((lane) => (
																<MenuItem key={lane.id} value={lane.id}>
																	{lane.name}
																</MenuItem>
															))}
													</Field>
												</FormControl>
											</Grid>

											<Grid item xs={12} md={12} xl={12}>
												<FormControlLabel
													control={
														<Checkbox
															checked={values.enableFollowup !== false}
															onChange={(e) => setFieldValue("enableFollowup", e.target.checked)}
															color="primary"
														/>
													}
													label="Activar seguimiento automático"
												/>
											</Grid>

											{values.enableFollowup !== false && (
												<Grid item xs={12} md={12} xl={12}>
													<FormControl
														variant="outlined"
														margin="dense"
														fullWidth
														className={classes.formControl}
													>
														<InputLabel id="followupType-label">Tipo de Seguimiento</InputLabel>
														<Select
															labelId="followupType-label"
															id="followupType"
															name="followupType"
															value={values.followupType || "once"}
															label="Tipo de Seguimiento"
															onChange={(e) => setFieldValue("followupType", e.target.value)}
														>
															<MenuItem value="once">Solo 1 vez</MenuItem>
															<MenuItem value="multiple">Múltiples hasta 3</MenuItem>
															<MenuItem value="adaptive">Adaptativo - IA decide</MenuItem>
														</Select>
													</FormControl>
												</Grid>
											)}
										</>
									)}
								</Grid>
							</DialogContent>

							<DialogActions>
								<Button
									onClick={handleClose}
									color="default"
									disabled={isSubmitting}
									variant="contained"
								>
									Cancelar
								</Button>
								<Button
									type="submit"
									color="primary"
									disabled={isSubmitting}
									variant="contained"
									className={classes.btnWrapper}
								>
									{tagId ? "Guardar" : "Añadir"}
									{isSubmitting && (
										<CircularProgress
											size={24}
											className={classes.buttonProgress}
										/>
									)}
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>

			</Dialog>
		</div>
	);
};

export default TagModal;
