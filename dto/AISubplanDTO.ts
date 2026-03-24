/**
 * DTOs y Validaciones para AI Subplans (Token Packages)
 * Schemas Yup para validación de entrada
 */

import * as Yup from "yup";
import AppError from "../errors/AppError";

// ============================================================================
// SCHEMAS DE VALIDACIÓN
// ============================================================================

/**
 * Schema para crear un nuevo subplan de tokens
 */
export const createSubplanSchema = Yup.object().shape({
  name: Yup.string()
    .required("El nombre del subplan es requerido")
    .min(1, "El nombre debe tener al menos 1 carácter")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .trim(),

  description: Yup.string()
    .optional()
    .max(500, "La descripción no puede exceder 500 caracteres")
    .trim(),

  tokens: Yup.number()
    .required("La cantidad de tokens es requerida")
    .integer("La cantidad de tokens debe ser un número entero")
    .min(0, "La cantidad de tokens no puede ser negativa")
    .max(1000000, "La cantidad de tokens no puede exceder 1,000,000"),

  priceUsd: Yup.number()
    .required("El precio es requerido")
    .min(0, "El precio no puede ser negativo")
    .max(100000, "El precio no puede exceder $100,000")
    .test(
      'max-decimals',
      'El precio solo puede tener hasta 2 decimales',
      (value) => {
        if (value === undefined || value === null) return true;
        return Number.isInteger(value * 100);
      }
    ),

  isActive: Yup.boolean()
    .optional()
    .default(true),

  isPublic: Yup.boolean()
    .optional()
    .default(false),

  // Integraciones de pago
  stripeProductId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  stripePriceId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  paypalProductId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  paypalPriceId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  companyId: Yup.number()
    .required("El ID de compañía es requerido")
    .integer("El ID de compañía debe ser un número entero")
    .min(1, "El ID de compañía debe ser mayor a 0")
});

/**
 * Schema para actualizar un subplan existente
 * Mismas validaciones que create, pero sin companyId (no se puede cambiar)
 */
export const updateSubplanSchema = Yup.object().shape({
  name: Yup.string()
    .required("El nombre del subplan es requerido")
    .min(1, "El nombre debe tener al menos 1 carácter")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .trim(),

  description: Yup.string()
    .optional()
    .max(500, "La descripción no puede exceder 500 caracteres")
    .trim(),

  tokens: Yup.number()
    .required("La cantidad de tokens es requerida")
    .integer("La cantidad de tokens debe ser un número entero")
    .min(0, "La cantidad de tokens no puede ser negativa")
    .max(1000000, "La cantidad de tokens no puede exceder 1,000,000"),

  priceUsd: Yup.number()
    .required("El precio es requerido")
    .min(0, "El precio no puede ser negativo")
    .max(100000, "El precio no puede exceder $100,000")
    .test(
      'max-decimals',
      'El precio solo puede tener hasta 2 decimales',
      (value) => {
        if (value === undefined || value === null) return true;
        return Number.isInteger(value * 100);
      }
    ),

  isActive: Yup.boolean()
    .optional(),

  isPublic: Yup.boolean()
    .optional(),

  // Integraciones de pago
  stripeProductId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  stripePriceId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  paypalProductId: Yup.string()
    .optional()
    .nullable()
    .default(null),

  paypalPriceId: Yup.string()
    .optional()
    .nullable()
    .default(null)
});

/**
 * Schema para obtener un subplan por ID
 */
export const getSubplanSchema = Yup.object().shape({
  id: Yup.number()
    .required("El ID del subplan es requerido")
    .integer("El ID del subplan debe ser un número entero")
    .min(1, "El ID del subplan debe ser mayor a 0")
});

/**
 * Schema para eliminar un subplan
 */
export const deleteSubplanSchema = Yup.object().shape({
  id: Yup.number()
    .required("El ID del subplan es requerido")
    .integer("El ID del subplan debe ser un número entero")
    .min(1, "El ID del subplan debe ser mayor a 0")
});

/**
 * Schema para listar subplanes con paginación
 */
export const listSubplansSchema = Yup.object().shape({
  companyId: Yup.number()
    .required("El ID de compañía es requerido")
    .integer("El ID de compañía debe ser un número entero")
    .min(1, "El ID de compañía debe ser mayor a 0"),

  includeInactive: Yup.boolean()
    .optional()
    .default(false),

  pageNumber: Yup.number()
    .optional()
    .integer("El número de página debe ser un entero")
    .min(1, "El número de página debe ser mayor a 0")
    .max(1000, "El número de página no puede exceder 1000")
    .default(1),

  pageSize: Yup.number()
    .optional()
    .integer("El tamaño de página debe ser un entero")
    .min(1, "El tamaño de página debe ser mayor a 0")
    .max(100, "El tamaño de página no puede exceder 100")
    .default(20)
});

// ============================================================================
// TIPOS TYPESCRIPT INFERIDOS DE LOS SCHEMAS
// ============================================================================

export type CreateSubplanDTO = Yup.InferType<typeof createSubplanSchema>;
export type UpdateSubplanDTO = Yup.InferType<typeof updateSubplanSchema>;
export type GetSubplanDTO = Yup.InferType<typeof getSubplanSchema>;
export type DeleteSubplanDTO = Yup.InferType<typeof deleteSubplanSchema>;
export type ListSubplansDTO = Yup.InferType<typeof listSubplansSchema>;

// ============================================================================
// FUNCIÓN HELPER PARA VALIDAR Y LANZAR ERRORES
// ============================================================================

/**
 * Valida datos contra un schema Yup y lanza AppError si falla
 * @param schema Schema de Yup
 * @param data Datos a validar
 * @returns Datos validados
 * @throws AppError con código 400 si la validación falla
 */
export async function validateOrThrow<T>(
  schema: Yup.Schema<T>,
  data: any
): Promise<T> {
  try {
    return await schema.validate(data, { abortEarly: false, stripUnknown: true });
  } catch (err: any) {
    // Transformar errores de Yup a mensaje legible
    const errors = err.errors?.join(", ") || "Error de validación";
    throw new AppError(errors, 400);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createSubplanSchema,
  updateSubplanSchema,
  getSubplanSchema,
  deleteSubplanSchema,
  listSubplansSchema,
  validateOrThrow
};
