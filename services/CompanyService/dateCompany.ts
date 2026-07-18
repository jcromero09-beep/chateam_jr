import { addDays, differenceInCalendarDays, format, isAfter } from "date-fns";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import sequelize from "../../database";

// Mapeo de días por tipo de recurrencia
const recurrenceDaysMap: Record<string, number> = {
  Day: 1,
  MENSUAL: 30,
  BIMESTRAL: 60,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
  ANUAL: 365,
};

export const updateDueDateByCompanyId = async (
  companyId: number,
  planId: number,
  detail: string,
  recurrence: string
): Promise<Company> => {
  const transaction = await sequelize.transaction();

  try {
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new AppError("Company not found");
    }

    const daysToAdd = recurrenceDaysMap[recurrence];
    if (!daysToAdd) {
      throw new AppError(`Invalid recurrence value: ${recurrence}`);
    }

    const today = new Date();
    const dueDate = company.dueDate ? new Date(company.dueDate) : today;

    let remainingDays = 0;

    if (isAfter(dueDate, today)) {
      remainingDays = differenceInCalendarDays(dueDate, today);
    }

    const totalDays = daysToAdd + remainingDays;
    const newDueDate = format(addDays(today, totalDays), 'yyyy-MM-dd');

    await company.update(
      {
        dueDate: newDueDate,
        planId: planId,
        planDetail: detail,
        recurrence: recurrence,
      },
      { transaction }
    );

    await transaction.commit();
    console.log(`✅ Company ${companyId}: nuevo dueDate ${newDueDate} (incluye ${remainingDays} días restantes)`);

    return company;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
