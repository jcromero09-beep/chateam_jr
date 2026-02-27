import { Request, Response } from "express";
import * as Yup from "yup";
import { Op } from "sequelize";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";

interface ConnectRequest {
  email: string;
  password: string;
}

/**
 * POST /api/connect
 * Endpoint público para obtener credenciales de conexión WhatsApp
 * Recibe: email y password de un usuario Chateam
 * Devuelve: whatsappId, token, companyId y datos de la conexión por defecto
 */
export const connect = async (req: Request, res: Response): Promise<Response> => {
  const { email, password }: ConnectRequest = req.body;

  // 1. Validación de entrada con Yup
  const schema = Yup.object().shape({
    email: Yup.string()
      .email("ERR_INVALID_EMAIL_FORMAT")
      .required("ERR_EMAIL_REQUIRED"),
    password: Yup.string()
      .required("ERR_PASSWORD_REQUIRED")
      .min(1, "ERR_PASSWORD_REQUIRED")
  });

  try {
    await schema.validate({ email, password });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message,
      code: "VALIDATION_ERROR"
    });
  }

  // 2. Buscar usuario por email
  const user = await User.findOne({
    where: { email: email.toLowerCase().trim() }
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Usuario no encontrado",
      code: "USER_NOT_FOUND"
    });
  }

  // 3. Validar password
  const isPasswordValid = await user.checkPassword(password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: "Contraseña incorrecta",
      code: "INVALID_PASSWORD"
    });
  }

  // 4. Obtener conexión por defecto de la empresa
  // Prioridad: 1) WhatsApp asignado al usuario, 2) Default de la empresa, 3) Cualquier CONNECTED
  const companyId = user.companyId;
  let defaultWhatsapp: Whatsapp | null = null;

  // Condición: debe tener al menos uno de los tokens (token o tokenMeta)
  const hasToken = {
    [Op.or]: [
      { token: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] } },
      { tokenMeta: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] } }
    ]
  };

  const whatsappInclude = [{ model: Queue, as: "queues", attributes: ["id", "name"] }];

  // 4a. Verificar si el usuario tiene WhatsApp asignado
  if (user.whatsappId) {
    defaultWhatsapp = await Whatsapp.findOne({
      where: {
        id: user.whatsappId,
        companyId,
        status: "CONNECTED",
        ...hasToken
      },
      include: whatsappInclude
    });
  }

  // 4b. Si no, buscar el default de la empresa
  if (!defaultWhatsapp) {
    defaultWhatsapp = await Whatsapp.findOne({
      where: {
        companyId,
        isDefault: true,
        status: "CONNECTED",
        ...hasToken
      },
      include: whatsappInclude
    });
  }

  // 4c. Si no hay default, buscar cualquier conexión CONNECTED con token
  if (!defaultWhatsapp) {
    defaultWhatsapp = await Whatsapp.findOne({
      where: {
        companyId,
        status: "CONNECTED",
        ...hasToken
      },
      include: whatsappInclude
    });
  }

  // 5. Validar que exista conexión disponible
  if (!defaultWhatsapp) {
    return res.status(404).json({
      success: false,
      error: "No hay conexión WhatsApp disponible para esta empresa",
      code: "NO_WHATSAPP_CONNECTION"
    });
  }

  // 6. Determinar el token correcto (token para Baileys, tokenMeta para META)
  const apiToken = defaultWhatsapp.token || defaultWhatsapp.tokenMeta;

  // 7. Obtener el queueId de la primera queue asignada al WhatsApp
  const firstQueue = defaultWhatsapp.queues?.[0] || null;

  // 8. Retornar credenciales completas para /api/send
  return res.status(200).json({
    success: true,
    data: {
      userId: user.id,
      token: apiToken,
      whatsappId: defaultWhatsapp.id,
      queueId: firstQueue?.id || null,
      companyId: defaultWhatsapp.companyId,
      whatsappName: defaultWhatsapp.name,
      whatsappNumber: defaultWhatsapp.number || null,
      queueName: firstQueue?.name || null,
      status: defaultWhatsapp.status,
      channel: defaultWhatsapp.channel || "whatsapp"
    }
  });
};
