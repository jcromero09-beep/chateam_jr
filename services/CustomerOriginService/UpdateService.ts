import * as Yup from "yup";
import AppError from "../../errors/AppError";
import CustomerOrigin from "../../models/CustomerOrigin";
import { Op } from "sequelize";

interface UpdateData {
  id: number | string;
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  companyId: number;
}

const UpdateCustomerOriginService = async (data: UpdateData): Promise<CustomerOrigin> => {
  const { id, name, description, color, isActive, companyId } = data;

  const schema = Yup.object().shape({
    id: Yup.number().required("El ID es obligatorio"),
    companyId: Yup.number().required("La empresa es obligatoria")
  });

  try {
    await schema.validate({ id, companyId });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const customerOrigin = await CustomerOrigin.findOne({
    where: {
      id,
      companyId
    }
  });

  if (!customerOrigin) {
    throw new AppError("Origen de cliente no encontrado", 404);
  }

  // Si se cambia el nombre, verificar que no exista otro con el mismo nombre
  if (name && name !== customerOrigin.name) {
    const existingOrigin = await CustomerOrigin.findOne({
      where: {
        name,
        companyId,
        id: { [Op.ne]: id }
      }
    });

    if (existingOrigin) {
      throw new AppError("Ya existe un origen con este nombre");
    }
  }

  await customerOrigin.update({
    name: name !== undefined ? name : customerOrigin.name,
    description: description !== undefined ? description : customerOrigin.description,
    color: color !== undefined ? color : customerOrigin.color,
    isActive: isActive !== undefined ? isActive : customerOrigin.isActive
  });

  return customerOrigin;
};

export default UpdateCustomerOriginService;
