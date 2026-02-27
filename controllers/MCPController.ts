import { Request, Response } from "express";
//import { sendMessageToWhatsApp } from "../services/SendMessageService";

const responder = async (req: Request, res: Response): Promise<Response> => {
  const { numero, mensaje } = req.body;

  try {
    console.log('numero',numero, 'mensaje', mensaje)
   // await sendMessageToWhatsApp(numero, mensaje); // función que tú ya manejas
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("❌ Error al reenviar mensaje al cliente:", error.message);
    return res.status(500).json({ success: false });
  }
};

export default { responder };
