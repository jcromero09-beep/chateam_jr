/**
 * Fixtures del webhook de Messenger/Instagram, hermanas de `baileysFixtures.ts`.
 *
 * `handleMessage` de facebookMessageListener recibe el `webhookEvent` ya desanidado
 * (un elemento de `entry[].messaging[]`), no el sobre completo del webhook. Estas
 * fábricas construyen ese objeto.
 *
 * PSIDs: el emisor y el receptor cambian de papel según `is_echo`. En un entrante
 * el contacto es `recipient` (el listener pide el perfil de recipientPsid); en un
 * eco —mensaje enviado por el agente desde la propia Página— es `sender`. Esa
 * inversión es conducta del canal, no un error de las fixtures: se fija tal cual.
 */

export const FB_CONTACT_PSID = "7777777777777777";
export const FB_PAGE_PSID = "1111111111111111";

const base = (overrides: any = {}) => ({
  sender: { id: FB_PAGE_PSID },
  recipient: { id: FB_CONTACT_PSID },
  timestamp: 1753900000000,
  ...overrides
});

export const fbFixtures = {
  /** Texto entrante del contacto hacia la Página. */
  text: (body = "Hola, necesito ayuda") =>
    base({ message: { mid: "mid.fb.text.001", text: body } }),

  /** Eco: lo que la Página envía. sender/recipient invertidos + is_echo. */
  echo: (body = "Respondo a tu mensaje") =>
    base({
      sender: { id: FB_CONTACT_PSID },
      recipient: { id: FB_PAGE_PSID },
      message: { mid: "mid.fb.echo.001", text: body, is_echo: true }
    }),

  /** Adjunto de imagen entrante. */
  image: (url = "https://example.invalid/foto.jpg") =>
    base({
      message: {
        mid: "mid.fb.img.001",
        attachments: [{ type: "image", payload: { url } }]
      }
    }),

  /** Mismo mid que `text()`: sirve para caracterizar el dedupe del canal. */
  duplicate: (body = "Hola, necesito ayuda") =>
    base({ message: { mid: "mid.fb.text.001", text: body } })
};

export type FbFixtureName = keyof typeof fbFixtures;
