import AppError from "../../errors/AppError";
import CompaniesSettings from "../../models/CompaniesSettings";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import logger from "../../utils/logger";
import ContactWallet from "../../models/ContactWallet";

interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}

interface Wallet {
  walletId: number;
  contactId: number;
  companyId: number;
}
interface Request {
  name: string;
  number: string;
  email?: string;
  profilePicUrl?: string;
  acceptAudioMessage?: boolean;
  active?: boolean;
  companyId: number;
  extraInfo?: ExtraInfo[];
  remoteJid?: string;
  wallets?: null | number[] | string[];
}

const CreateContactService = async ({
  name,
  number: rawNumber,
  email = "",
  acceptAudioMessage,
  active,
  companyId,
  extraInfo = [],
  remoteJid = "",
  wallets
}: Request): Promise<Contact> => {

  // Normalize number: remove all non-numeric characters
  const number = rawNumber.replace(/[^0-9]/g, "");

  const numberExists = await Contact.findOne({ where: { number, companyId } });
  if (numberExists) {

    throw new AppError("ERR_DUPLICATED_CONTACT");
  }

  const settings = await CompaniesSettings.findOne({
    where: {
      companyId
    }
  })

  const { acceptAudioMessageContact } = settings;

  const contact = await Contact.create(
    {
      name,
      number,
      email,
      acceptAudioMessage: acceptAudioMessageContact === 'enabled' ? true : false,
      active,
      extraInfo,
      companyId,
      remoteJid
    },
    {
      include: ["extraInfo",
        {
          association: "wallets",
          attributes: ["id", "name"]
        }]
    }
  );

  if (wallets) {
    await ContactWallet.destroy({
      where: {
        companyId,
        contactId: contact.id
      }
    });

    const contactWallets: Wallet[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallets.forEach((wallet: any) => {
      contactWallets.push({
        walletId: Number(!wallet.id ? wallet : wallet.id),
        contactId: Number(contact.id),
        companyId: Number(companyId)
      });
    });

    await ContactWallet.bulkCreate(contactWallets);
  }
  return contact;

};

export default CreateContactService;
