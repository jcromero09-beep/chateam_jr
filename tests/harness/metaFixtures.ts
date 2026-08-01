/**
 * Fixtures del webhook de WhatsApp Cloud API (Meta), hermanas de `baileysFixtures.ts`
 * y `facebookFixtures.ts`.
 *
 * A diferencia de los otros dos listeners, `handleMetaWebhookMessage` recibe el
 * SOBRE COMPLETO del webhook —`{ object, entry: [{ changes: [{ field, value }] }] }`—
 * y él mismo lo desanida. Por eso estas fábricas construyen el sobre entero: el
 * golden-master tiene que entrar por la misma puerta que Meta.
 *
 * La conexión se resuelve por `value.metadata.phone_number_id` contra
 * `Whatsapp.phoneNumberId` con `provider: "meta"`.
 */

export const META_PHONE_NUMBER_ID = "555000111222333";
export const META_DISPLAY_PHONE = "593900000000";
export const META_CONTACT_WAID = "593988888888";

const envelope = (value: any, field = "messages") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID_TEST",
      changes: [{ field, value }]
    }
  ]
});

const baseValue = (extra: any = {}) => ({
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: META_DISPLAY_PHONE,
    phone_number_id: META_PHONE_NUMBER_ID
  },
  contacts: [
    {
      profile: { name: "Cliente Meta" },
      wa_id: META_CONTACT_WAID
    }
  ],
  ...extra
});

export const metaFixtures = {
  /** Texto entrante del contacto. */
  text: (body = "Hola, necesito ayuda", id = "wamid.META.TEXT.001") =>
    envelope(
      baseValue({
        messages: [
          {
            from: META_CONTACT_WAID,
            id,
            timestamp: "1753900000",
            type: "text",
            text: { body }
          }
        ]
      })
    ),

  /** Mismo wamid que `text()`: caracteriza el dedupe del canal. */
  duplicate: (body = "Hola, necesito ayuda") =>
    metaFixtures.text(body, "wamid.META.TEXT.001"),

  /** Imagen entrante (sin descarga real: la red está mockeada). */
  image: (caption = "mira esto") =>
    envelope(
      baseValue({
        messages: [
          {
            from: META_CONTACT_WAID,
            id: "wamid.META.IMG.001",
            timestamp: "1753900001",
            type: "image",
            image: { id: "MEDIA_ID_TEST", mime_type: "image/jpeg", caption }
          }
        ]
      })
    ),

  /** Un `object` que no es de WhatsApp: el handler debe salir sin tocar nada. */
  objetoAjeno: () => ({ object: "page", entry: [] }),

  /** Webhook de estado (ack), no de mensaje. */
  status: (status = "delivered") =>
    envelope(
      baseValue({
        statuses: [
          {
            id: "wamid.META.TEXT.001",
            status,
            timestamp: "1753900002",
            recipient_id: META_CONTACT_WAID
          }
        ]
      })
    )
};

export type MetaFixtureName = keyof typeof metaFixtures;
