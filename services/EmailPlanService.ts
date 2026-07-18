import { Op } from "sequelize";
import EmailPlan from "../models/EmailPlan";
import CompanyEmailPlan from "../models/CompanyEmailPlan";
import Company from "../models/Company";

class EmailPlanService {
  /**
   * Lista planes de email disponibles públicamente
   */
  async listEmailPlans(includePrivate = false): Promise<EmailPlan[]> {
    const where = includePrivate ? {} : { isPublic: true, isActive: true };
    return EmailPlan.findAll({
      where,
      order: [["price", "ASC"]]
    });
  }

  /**
   * Obtiene un plan de email por ID
   */
  async getEmailPlanById(id: number): Promise<EmailPlan | null> {
    return EmailPlan.findByPk(id);
  }

  /**
   * Crea un nuevo plan de email (superadmin)
   */
  async createEmailPlan(data: {
    name: string;
    description?: string;
    emailCreditsPerCycle?: number;
    maxEmailSendsPerDay?: number;
    maxTemplates?: number;
    price: string;
    recurrence?: string;
    isPublic?: boolean;
    isActive?: boolean;
  }): Promise<EmailPlan> {
    // Check if plan with same name exists
    const existing = await EmailPlan.findOne({ where: { name: data.name } });
    if (existing) {
      throw new Error("Ya existe un plan con este nombre");
    }

    return EmailPlan.create(data);
  }

  /**
   * Actualiza un plan de email (superadmin)
   */
  async updateEmailPlan(
    id: number,
    data: Partial<{
      name: string;
      description: string;
      emailCreditsPerCycle: number;
      maxEmailSendsPerDay: number;
      maxTemplates: number;
      price: string;
      recurrence: string;
      isPublic: boolean;
      isActive: boolean;
    }>
  ): Promise<EmailPlan> {
    const plan = await EmailPlan.findByPk(id);
    if (!plan) {
      throw new Error("Plan de email no encontrado");
    }

    await plan.update(data);
    return plan;
  }

  /**
   * Elimina un plan de email (superadmin)
   */
  async deleteEmailPlan(id: number): Promise<void> {
    const plan = await EmailPlan.findByPk(id);
    if (!plan) {
      throw new Error("Plan de email no encontrado");
    }

    // Check if any company has this plan active
    const activeCompanies = await CompanyEmailPlan.count({
      where: { emailPlanId: id, isActive: true }
    });

    if (activeCompanies > 0) {
      throw new Error(
        "No se puede eliminar el plan porque hay empresas usándolo"
      );
    }

    await plan.destroy();
  }

  /**
   * Obtiene el balance de créditos de email de una company
   */
  async getEmailBalance(companyId: number): Promise<{
    emailCreditsUsed: number;
    emailCreditsTotal: number;
    remainingCredits: number;
    maxEmailSendsPerDay: number;
    maxTemplates: number;
    dueDate: Date | null;
    emailCreditsResetAt: Date | null;
    planName: string | null;
    isActive: boolean;
  }> {
    const companyEmailPlan = await CompanyEmailPlan.findOne({
      where: { companyId, isActive: true },
      include: [
        {
          model: EmailPlan,
          as: "emailPlan"
        }
      ]
    });

    if (!companyEmailPlan) {
      return {
        emailCreditsUsed: 0,
        emailCreditsTotal: 0,
        remainingCredits: 0,
        maxEmailSendsPerDay: 0,
        maxTemplates: 0,
        dueDate: null,
        emailCreditsResetAt: null,
        planName: null,
        isActive: false
      };
    }

    const remainingCredits =
      (companyEmailPlan.emailCreditsTotal || 0) -
      (companyEmailPlan.emailCreditsUsed || 0);

    return {
      emailCreditsUsed: companyEmailPlan.emailCreditsUsed || 0,
      emailCreditsTotal: companyEmailPlan.emailCreditsTotal || 0,
      remainingCredits,
      maxEmailSendsPerDay:
        (companyEmailPlan.emailPlan as any)?.maxEmailSendsPerDay || 0,
      maxTemplates: (companyEmailPlan.emailPlan as any)?.maxTemplates || 0,
      dueDate: companyEmailPlan.dueDate,
      emailCreditsResetAt: companyEmailPlan.emailCreditsResetAt,
      planName: (companyEmailPlan.emailPlan as any)?.name || null,
      isActive: companyEmailPlan.isActive
    };
  }

  /**
   * Obtiene el uso de créditos de email de una company
   */
  async getEmailUsage(companyId: number): Promise<{
    currentCycle: {
      used: number;
      total: number;
      percentage: number;
    };
    dailyUsage: {
      sent: number;
      limit: number;
      remaining: number;
    };
  }> {
    const balance = await this.getEmailBalance(companyId);

    // Calculate daily usage (in a real app, you'd track this separately)
    // For now, we'll use the cycle usage as reference
    const dailySent = Math.min(
      balance.emailCreditsUsed,
      balance.maxEmailSendsPerDay
    );

    return {
      currentCycle: {
        used: balance.emailCreditsUsed,
        total: balance.emailCreditsTotal,
        percentage:
          balance.emailCreditsTotal > 0
            ? Math.round(
                (balance.emailCreditsUsed / balance.emailCreditsTotal) * 100
              )
            : 0
      },
      dailyUsage: {
        sent: dailySent,
        limit: balance.maxEmailSendsPerDay,
        remaining: Math.max(0, balance.maxEmailSendsPerDay - dailySent)
      }
    };
  }

  /**
   * Provisiona créditos de email al comprar/renovar un plan
   */
  async provisionEmailCredits(
    companyId: number,
    emailPlanId: number,
    mode: "initialize" | "renew" | "upgrade" = "initialize"
  ): Promise<CompanyEmailPlan> {
    const emailPlan = await EmailPlan.findByPk(emailPlanId);
    if (!emailPlan) {
      throw new Error("Plan de email no encontrado");
    }

    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new Error("Empresa no encontrada");
    }

    // Calculate due date based on recurrence
    const dueDate = this.calculateDueDate(emailPlan.recurrence);

    // Find existing CompanyEmailPlan or create new one
    let companyEmailPlan = await CompanyEmailPlan.findOne({
      where: { companyId }
    });

    if (companyEmailPlan && mode === "initialize") {
      // If already has a plan, this would be an upgrade
      mode = "upgrade";
    }

    if (companyEmailPlan && companyEmailPlan.isActive) {
      if (mode === "renew") {
        // Reset credits for new cycle
        await companyEmailPlan.update({
          emailCreditsUsed: 0,
          emailCreditsTotal: emailPlan.emailCreditsPerCycle,
          emailCreditsResetAt: new Date(),
          dueDate,
          emailPlanId
        });
      } else if (mode === "upgrade" || mode === "initialize") {
        // Upgrade: update to new plan
        await companyEmailPlan.update({
          emailCreditsUsed: 0,
          emailCreditsTotal: emailPlan.emailCreditsPerCycle,
          emailCreditsResetAt: new Date(),
          dueDate,
          emailPlanId,
          isActive: true
        });
      }
    } else {
      // Create new CompanyEmailPlan
      companyEmailPlan = await CompanyEmailPlan.create({
        companyId,
        emailPlanId,
        emailCreditsUsed: 0,
        emailCreditsTotal: emailPlan.emailCreditsPerCycle,
        emailCreditsResetAt: new Date(),
        dueDate,
        isActive: true
      });
    }

    return companyEmailPlan;
  }

  /**
   * Resta 1 crédito por cada email enviado
   */
  async deductEmailCredit(companyId: number): Promise<boolean> {
    const companyEmailPlan = await CompanyEmailPlan.findOne({
      where: { companyId, isActive: true }
    });

    if (!companyEmailPlan) {
      throw new Error("La empresa no tiene un plan de email activo");
    }

    const remainingCredits =
      (companyEmailPlan.emailCreditsTotal || 0) -
      (companyEmailPlan.emailCreditsUsed || 0);

    if (remainingCredits <= 0) {
      throw new Error("No tienes créditos de email disponibles");
    }

    await companyEmailPlan.increment("emailCreditsUsed");
    await companyEmailPlan.reload();

    return true;
  }

  /**
   * Verifica si la company puede enviar emails
   */
  async canSendEmail(companyId: number): Promise<{
    canSend: boolean;
    reason?: string;
    remainingCredits: number;
    maxDailySends: number;
  }> {
    const balance = await this.getEmailBalance(companyId);

    if (!balance.isActive) {
      return {
        canSend: false,
        reason: "No tienes un plan de email activo",
        remainingCredits: 0,
        maxDailySends: 0
      };
    }

    if (balance.remainingCredits <= 0) {
      return {
        canSend: false,
        reason: "Has agotado tus créditos de email",
        remainingCredits: 0,
        maxDailySends: balance.maxEmailSendsPerDay
      };
    }

    return {
      canSend: true,
      remainingCredits: balance.remainingCredits,
      maxDailySends: balance.maxEmailSendsPerDay
    };
  }

  /**
   * Resetea créditos de email vencidos (para CronJob)
   */
  async resetEmailCredits(): Promise<{
    renewed: number;
    errors: string[];
  }> {
    const result = { renewed: 0, errors: [] as string[] };

    try {
      // Find all active plans that are due
      const expiredPlans = await CompanyEmailPlan.findAll({
        where: {
          isActive: true,
          dueDate: {
            [Op.lt]: new Date()
          }
        },
        include: [
          {
            model: EmailPlan,
            as: "emailPlan"
          }
        ]
      });

      for (const companyEmailPlan of expiredPlans) {
        try {
          const emailPlan = companyEmailPlan.emailPlan as EmailPlan;
          const newDueDate = this.calculateDueDate(emailPlan.recurrence);

          await companyEmailPlan.update({
            emailCreditsUsed: 0,
            emailCreditsTotal: emailPlan.emailCreditsPerCycle,
            emailCreditsResetAt: new Date(),
            dueDate: newDueDate
          });

          result.renewed++;
        } catch (error: any) {
          result.errors.push(
            `Error renew credits for company ${companyEmailPlan.companyId}: ${error.message}`
          );
        }
      }
    } catch (error: any) {
      result.errors.push(`Error in reset process: ${error.message}`);
    }

    return result;
  }

  /**
   * Calcula la fecha de vencimiento basada en la recurrencia
   */
  private calculateDueDate(recurrence: string): Date {
    const now = new Date();
    switch (recurrence) {
      case "Day":
        now.setDate(now.getDate() + 1);
        break;
      case "MENSUAL":
        now.setMonth(now.getMonth() + 1);
        break;
      case "BIMESTRAL":
        now.setMonth(now.getMonth() + 2);
        break;
      case "TRIMESTRAL":
        now.setMonth(now.getMonth() + 3);
        break;
      case "SEMESTRAL":
        now.setMonth(now.getMonth() + 6);
        break;
      case "ANUAL":
        now.setFullYear(now.getFullYear() + 1);
        break;
      default:
        now.setMonth(now.getMonth() + 1);
    }
    return now;
  }
}

export default new EmailPlanService();
