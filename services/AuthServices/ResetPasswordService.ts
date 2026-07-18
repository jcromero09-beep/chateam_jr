import { Op } from "sequelize";
import User from "../../models/User";
import AppError from "../../errors/AppError";

interface Request {
  token: string;
  password: string;
}

const ResetPasswordService = async ({ token, password }: Request): Promise<void> => {
  if (!token || token.length < 10) {
    throw new AppError("Token invalido", 400);
  }

  if (!password || password.length < 6) {
    throw new AppError("La contrasena debe tener al menos 6 caracteres", 400);
  }

  // Buscar usuario con token valido y no expirado
  const user = await User.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: {
        [Op.gt]: new Date() // Token aun no expira
      }
    }
  });

  if (!user) {
    throw new AppError("Token invalido o expirado. Solicita un nuevo enlace de recuperacion.", 400);
  }

  // Actualizar contrasena (el hook BeforeUpdate hashea automaticamente)
  user.password = password;
  user.resetPasswordToken = null as unknown as string;
  user.resetPasswordExpires = null as unknown as Date;
  // Incrementar tokenVersion para invalidar sesiones anteriores
  user.tokenVersion += 1;

  await user.save();

  console.log(`[ResetPassword] Contrasena actualizada para usuario: ${user.email} (id: ${user.id})`);
};

export default ResetPasswordService;
