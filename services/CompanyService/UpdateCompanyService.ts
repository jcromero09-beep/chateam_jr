import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Setting from "../../models/Setting";
import User from "../../models/User";
import Invoices from "../../models/Invoices";
import Plan from "../../models/Plan";

interface CompanyData {
  name?: string;
  id?: number | string;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  dueDate?: string;
  recurrence?: string;
  document?: string;
  paymentMethod?: string;
  password?: string;
  // Payment API keys
  paypalClientId?: string;
  paypalSecretKey?: string;
  stripePublicKey?: string;
  stripeSecretKey?: string;
  // AI fields
  aiTokenBalance?: number;
  activeAISubplanId?: number | null;
}

const UpdateCompanyService = async (
  companyData: CompanyData
): Promise<Company> => {

  const company = await Company.findByPk(companyData.id);
  const {
    name,
    phone,
    email,
    status,
    planId,
    campaignsEnabled,
    dueDate,
    recurrence,
    document,
    paymentMethod,
    password,
    paypalClientId,
    paypalSecretKey,
    stripePublicKey,
    stripeSecretKey,
    aiTokenBalance,
    activeAISubplanId
  } = companyData;

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  // Solo procesar lógica de plan/invoices si se envía planId
  if (planId) {
    const openInvoices = await Invoices.findAll({
      where: {
        status: "open",
        companyId: company.id,
      },
    });
    if (openInvoices.length > 1) {
      for (const invoice of openInvoices.slice(1)) {
        await invoice.update({ status: "cancelled" });
      }
    }
    const plan = await Plan.findByPk(planId);

    if (!plan) {
      throw new Error("Plan no encontrado.");
    }
    // 5. Atualizar a única invoice com status "open" existente, baseada no companyId.
    const openInvoice = openInvoices[0];
    const valuePlan = Number(plan.amount.replace(",", ".")) || 0;
    if (openInvoice) {
      await openInvoice.update({
        value: valuePlan,
        detail: plan.name,
        users: plan.users,
        connections: plan.connections,
        queues: plan.queues,
        dueDate: dueDate,
      });

    } else {
      // Obtener el valor del plan y normalizarlo si es necesario
      const valuePlanNormalized = Number(plan.amount.replace ? plan.amount.replace(",", ".") : plan.amount) || 0;

      // No hay facturas abiertas: Crear una nueva
      await Invoices.create({
        companyId: company.id,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        detail: plan.name,
        status: 'open',
        value: valuePlanNormalized,
        users: plan.users,
        connections: plan.connections,
        queues: plan.queues
      });
    }
  }

  // Solo actualizar usuario si se envía email
  if (email) {
    const existUser = await User.findOne({
      where: {
        companyId: company.id,
        email: email
      }
    });

    if (existUser && existUser.email !== company.email) {
      throw new AppError("¡El usuario ya existe con este e-mail!", 404)
    }

    const user = await User.findOne({
      where: {
        companyId: company.id,
        email: company.email
      }
    });

    if (user) {
      await user.update({ email, password });
    }
  }

  // Construir objeto de actualización solo con campos definidos
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (status !== undefined) updateData.status = status;
  if (planId !== undefined) updateData.planId = planId;
  if (dueDate !== undefined) updateData.dueDate = dueDate;
  if (recurrence !== undefined) updateData.recurrence = recurrence;
  if (document !== undefined) updateData.document = document;
  if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
  // Payment keys
  if (paypalClientId !== undefined) updateData.paypalClientId = paypalClientId;
  if (paypalSecretKey !== undefined) updateData.paypalSecretKey = paypalSecretKey;
  if (stripePublicKey !== undefined) updateData.stripePublicKey = stripePublicKey;
  if (stripeSecretKey !== undefined) updateData.stripeSecretKey = stripeSecretKey;
  // AI fields
  if (aiTokenBalance !== undefined) updateData.aiTokenBalance = aiTokenBalance;
  if (activeAISubplanId !== undefined) updateData.activeAISubplanId = activeAISubplanId;

  await company.update(updateData);

  if (companyData.campaignsEnabled !== undefined) {
    const [setting, created] = await Setting.findOrCreate({
      where: {
        companyId: company.id,
        key: "campaignsEnabled"
      },
      defaults: {
        companyId: company.id,
        key: "campaignsEnabled",
        value: `${campaignsEnabled}`
      }
    });
    if (!created) {
      await setting.update({ value: `${campaignsEnabled}` });
    }
  }

  return company;
};

export default UpdateCompanyService;
