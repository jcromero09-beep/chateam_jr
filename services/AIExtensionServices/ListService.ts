import AIExtension from "../../models/AIExtension";
import AICompanyExtension from "../../models/AICompanyExtension";

interface Request {
  companyId?: number;
  onlyInstalled?: boolean;
}

interface ExtensionWithStatus extends AIExtension {
  installed?: boolean;
  configOverride?: Record<string, unknown>;
  installedAt?: Date;
}

const ListService = async ({
  companyId,
  onlyInstalled = false
}: Request): Promise<ExtensionWithStatus[]> => {
  if (onlyInstalled && companyId) {
    // Solo extensiones instaladas por la company
    const companyExtensions = await AICompanyExtension.findAll({
      where: { companyId, installed: true },
      include: [
        {
          model: AIExtension,
          as: "extension",
          where: { isActive: true }
        }
      ],
      order: [[{ model: AIExtension, as: "extension" }, "name", "ASC"]]
    });

    return companyExtensions.map((ce: any) => {
      const ext = ce.extension.toJSON();
      ext.installed = true;
      ext.configOverride = ce.configOverride;
      ext.installedAt = ce.installedAt;
      return ext;
    });
  }

  // Todas las extensiones activas con estado de instalación
  const extensions = await AIExtension.findAll({
    where: { isActive: true },
    order: [["name", "ASC"]]
  });

  if (!companyId) {
    return extensions;
  }

  // Obtener estado de instalación para la company
  const companyExtensions = await AICompanyExtension.findAll({
    where: { companyId }
  });

  const installedMap = new Map<number, AICompanyExtension>();
  companyExtensions.forEach(ce => {
    installedMap.set(ce.extensionId, ce);
  });

  return extensions.map((ext: any) => {
    const json = ext.toJSON();
    const ce = installedMap.get(ext.id);
    json.installed = ce ? ce.installed : false;
    json.configOverride = ce ? ce.configOverride : {};
    json.installedAt = ce ? ce.installedAt : null;
    return json;
  });
};

export default ListService;
