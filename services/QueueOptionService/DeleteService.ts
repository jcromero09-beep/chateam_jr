import ShowService from "./ShowService";

const DeleteService = async (
  queueOptionId: number | string,
  companyId: number | string
): Promise<void> => {
  const queueOption = await ShowService(queueOptionId, companyId);

  await queueOption.destroy();
};

export default DeleteService;
