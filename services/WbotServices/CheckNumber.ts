import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
//import { getWbot } from "../../libs/wbot";

// const CheckContactNumber = async (
//   number: string, companyId: number, isGroup: boolean = false
// ): Promise<string> => {
//   const wahtsappList = await GetDefaultWhatsApp(null, companyId);

// //  const wbot = getWbot(wahtsappList.id);

//   let numberArray;

//   if (isGroup) {
//   //  const grupoMeta = await wbot.groupMetadata(number);
    
//   } else {
//    // numberArray = await wbot.onWhatsApp(`${number}@s.whatsapp.net`);
//   }

//   const isNumberExit = numberArray;

//   if (!isNumberExit[0]?.exists) {
//     throw new AppError("Este número não está cadastrado no whatsapp");
//   }

//   return isGroup ? number.split("@")[0] : isNumberExit[0].jid.split("@")[0];
// };

const CheckContactNumber = async (
  number: string, _companyId: number, isGroup: boolean = false
): Promise<string> => {
  if (isGroup) {
    return number.split("@")[0];
  }

  return number.replace(/\D/g, "");
};

export default CheckContactNumber;
