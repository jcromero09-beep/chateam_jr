import ContactTag from "../../models/ContactTag";

type Param = {
    contactId: string
  };

const FindContactTags = async ({
    contactId
  }: Param): Promise<ContactTag[]> => {
    const where: any = {
        contactId
      };
  const contactsTags = await ContactTag.findAll({
    where
  });
  return contactsTags;
};

export default FindContactTags;
