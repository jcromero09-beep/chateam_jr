import * as Yup from "yup";
import AppError from "../../errors/AppError";
import CustomerOrigin from "../../models/CustomerOrigin";

interface CreateData {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  companyId: number;
}

const CreateCustomerOriginService = async (data: CreateData): Promise<CustomerOrigin> => {
  const { name, description, color, isActive, companyId } = data;

  const schema = Yup.object().shape({
    name: Yup.string().required("El nombre es obligatorio"),
    companyId: Yup.number().required("La empresa es obligatoria")
  });

  try {
    await schema.validate({ name, companyId });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar si ya existe un origen con el mismo nombre en la empresa
  const existingOrigin = await CustomerOrigin.findOne({
    where: {
      name,
      companyId
    }
  });

  if (existingOrigin) {
    throw new AppError("Ya existe un origen con este nombre");
  }

  const customerOrigin = await CustomerOrigin.create({
    name,
    description: description || null,
    color: color || "#6366F1",
    isActive: isActive !== undefined ? isActive : true,
    companyId
  });

  return customerOrigin;
};

export default CreateCustomerOriginService;
