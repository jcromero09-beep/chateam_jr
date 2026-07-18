import Setting from "../../models/Setting";

interface Request {
  key: string;
}

const publicSettingsKeys = [
  "allowSignup",
  "primaryColorLight",
  "primaryColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appName",
  // Términos y condiciones públicos
  "terms_conditions_content",
  "terms_conditions_version",
  "terms_conditions_active",
  "terms_conditions_last_updated",
  "privacy_policy_content",
  "privacy_policy_version",
  "privacy_policy_active",
  "privacy_policy_last_updated",
  "legal_company_name",
  "legal_contact_email"
]

const GetPublicSettingService = async ({
  key
}: Request): Promise<string | undefined> => {
  

  console.log("|======== GetPublicSettingService ========|")
  console.log("key", key)
  console.log("|=========================================|")

  if (!publicSettingsKeys.includes(key)) {
    return null;
  }
  
  const setting = await Setting.findOne({
    where: {
      companyId: 1,
      key
    }
  });

  return setting?.value;
};

export default GetPublicSettingService;
