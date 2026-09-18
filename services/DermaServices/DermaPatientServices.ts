/**
 * CRUD de pacientes Derma. Todas las consultas van scopeadas por companyId
 * (además del guard automático de tenantScope).
 */
import * as Yup from "yup";
import { Op } from "sequelize";
import DermaPatient from "../../models/DermaPatient";
import DermaAnalysis from "../../models/DermaAnalysis";
import AppError from "../../errors/AppError";

export interface PatientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  notes?: string | null;
  contactId?: number | null;
}

const patientSchema = Yup.object().shape({
  name: Yup.string().trim().required("El nombre es obligatorio").max(150),
  email: Yup.string().trim().email("Email no válido").max(150).nullable(),
  phone: Yup.string().trim().max(50).nullable(),
  birthDate: Yup.string()
    .nullable()
    .matches(/^\d{4}-\d{2}-\d{2}$/, "birthDate debe ser YYYY-MM-DD"),
  gender: Yup.string().trim().max(20).nullable(),
  notes: Yup.string().trim().max(4000).nullable(),
  contactId: Yup.number().integer().positive().nullable(),
});

const cleanInput = (data: PatientInput): PatientInput => ({
  name: String(data.name ?? "").trim(),
  email: data.email ? String(data.email).trim() : null,
  phone: data.phone ? String(data.phone).trim() : null,
  birthDate: data.birthDate ? String(data.birthDate).trim() : null,
  gender: data.gender ? String(data.gender).trim() : null,
  notes: data.notes ? String(data.notes).trim() : null,
  contactId: data.contactId ? Number(data.contactId) : null,
});

const validate = async (data: PatientInput): Promise<PatientInput> => {
  const cleaned = cleanInput(data);
  try {
    await patientSchema.validate(cleaned, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.errors?.join(", ") || err.message, 400);
  }
  return cleaned;
};

export const serializePatient = (p: DermaPatient) => ({
  id: p.id,
  companyId: p.companyId,
  userId: p.userId ?? null,
  contactId: p.contactId ?? null,
  name: p.name,
  email: p.email ?? null,
  phone: p.phone ?? null,
  birthDate: p.birthDate ?? null,
  age: p.age,
  gender: p.gender ?? null,
  notes: p.notes ?? null,
  lastScore: p.lastScore ?? null,
  lastAnalysisAt: p.lastAnalysisAt ?? null,
  isActive: p.isActive,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export const CreateDermaPatientService = async (
  companyId: number,
  userId: number,
  data: PatientInput,
): Promise<DermaPatient> => {
  const cleaned = await validate(data);
  return DermaPatient.create({ ...cleaned, companyId, userId } as any);
};

export interface ListPatientsRequest {
  companyId: number;
  searchParam?: string;
  pageNumber?: number | string;
  rowsPerPage?: number | string;
  includeInactive?: boolean;
}

export const ListDermaPatientsService = async ({
  companyId,
  searchParam = "",
  pageNumber = 1,
  rowsPerPage = 20,
  includeInactive = false,
}: ListPatientsRequest) => {
  const page = Math.max(1, Number(pageNumber) || 1);
  const limit = Math.min(100, Math.max(1, Number(rowsPerPage) || 20));
  const offset = (page - 1) * limit;

  const where: any = { companyId };
  if (!includeInactive) where.isActive = true;
  const term = String(searchParam || "").trim();
  if (term) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${term}%` } },
      { email: { [Op.iLike]: `%${term}%` } },
      { phone: { [Op.iLike]: `%${term}%` } },
    ];
  }

  const { rows, count } = await DermaPatient.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
  });

  return {
    patients: rows.map(serializePatient),
    count,
    hasMore: offset + rows.length < count,
  };
};

export const ShowDermaPatientService = async (
  companyId: number,
  id: number,
): Promise<DermaPatient> => {
  const patient = await DermaPatient.findOne({ where: { id, companyId } });
  if (!patient) throw new AppError("ERR_DERMA_PATIENT_NOT_FOUND", 404);
  return patient;
};

export const UpdateDermaPatientService = async (
  companyId: number,
  id: number,
  data: PatientInput,
): Promise<DermaPatient> => {
  const patient = await ShowDermaPatientService(companyId, id);
  const cleaned = await validate({
    ...serializePatient(patient),
    ...data,
  } as PatientInput);
  await patient.update(cleaned as any);
  return patient;
};

/** Borrado lógico: conserva el historial de análisis y sus créditos. */
export const DeleteDermaPatientService = async (
  companyId: number,
  id: number,
): Promise<void> => {
  const patient = await ShowDermaPatientService(companyId, id);
  await patient.update({ isActive: false } as any);
};

/** Recalcula lastScore/lastAnalysisAt a partir del último análisis completado. */
export const RefreshPatientSummary = async (
  companyId: number,
  patientId: number,
): Promise<void> => {
  const last = await DermaAnalysis.findOne({
    where: { companyId, patientId, status: "completed" },
    order: [["createdAt", "DESC"]],
  });
  await DermaPatient.update(
    {
      lastScore: last?.globalScore ?? null,
      lastAnalysisAt: last?.createdAt ?? null,
    } as any,
    { where: { id: patientId, companyId } },
  );
};

export default {
  CreateDermaPatientService,
  ListDermaPatientsService,
  ShowDermaPatientService,
  UpdateDermaPatientService,
  DeleteDermaPatientService,
  RefreshPatientSummary,
  serializePatient,
};
