import ContactTag from "../../models/ContactTag";
import Contact from "../../models/Contact";

type Param = {
    contactId: string;
    companyId: number | string;
  };

const FindContactTags = async ({
    contactId,
    companyId
  }: Param): Promise<ContactTag[]> => {
    const where: any = {
        contactId
      };
  const contactsTags = await ContactTag.findAll({
    where,
    // [W1-SEC-IDOR] el contacto dueño debe pertenecer a la empresa.
    include: [
      {
        model: Contact,
        as: "contact",
        where: { companyId },
        attributes: [],
        required: true
      }
    ]
  });
  return contactsTags;
};

export default FindContactTags;
