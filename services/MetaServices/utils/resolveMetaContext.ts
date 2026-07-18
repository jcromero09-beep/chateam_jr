import Whatsapp from "../../../models/Whatsapp";

/** Resuelve companyId/whatsappId/canal por phone_number_id de Meta */
export async function resolveMetaContext(value: any) {
  const phoneNumberId = value?.metadata?.phone_number_id as string | undefined;
  const displayPhone  = value?.metadata?.display_phone_number as string | undefined;

  let wapp = null as any;

  if (phoneNumberId) {
    wapp = await Whatsapp.findOne({ where: { provider: "meta", phoneNumberId } });
  }
  if (!wapp && displayPhone) {
    wapp = await Whatsapp.findOne({ where: { provider: "meta", displayPhoneNumber: displayPhone } });
  }
  if (!wapp) {
    // fallback a conexión default si quieres:
    wapp = await Whatsapp.findOne({ where: { isDefault: true } });
  }

  return {
    channel: "meta" as const,
    companyId: wapp?.companyId ?? 1,
    whatsappId: wapp?.id ?? null,
    connection: wapp
  };
}
