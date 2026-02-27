import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import formatBody from "../../helpers/Mustache";
import { sendInstagramMessage } from "./graphAPI";
import { typeAttachment } from "./sendFacebookMessageMedia"; 
import { sendInstagramAttachment } from "./graphAPI";


import fs from "fs";
import whatsappRoutes from "../../routes/whatsappRoutes";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  ticket: Ticket;
  media?: Express.Multer.File;
  body?: string;
  url?: string;
}



const sendIGMessage = async ({ body, ticket }: Request): Promise<any> => {
  const { number } = ticket.contact;
  try {

    // Usa la función flecha que creaste
    const send = await sendInstagramMessage(
     // ticket.whatsapp.facebookUserId,
        number, // PSID del destinatario
        formatBody(body, ticket), // Cuerpo del mensaje formateado
        ticket.whatsapp.facebookUserToken,// Access token de IG o página
      
      );

    await ticket.update({ lastMessage: body });

    return send;

  } catch (err) {
    console.log(err)
    throw new AppError("ERR_SENDING_FACEBOOK_MSG");
  }
};


export const sendIgMessageMedia = async ({
  media,
  ticket,
  body
}: Request): Promise<any> => {
  try {
 //   console.log('sendface', media)
    const type = typeAttachment(media);
  ///  console.log('type', type)
    const url = `${process.env.BACKEND_URL}/public/company${ticket.companyId}/${media.filename}`
   // console.log('ticket',ticket)

const whatsapp = Whatsapp.findByPk(ticket.whatsappId) 
const  faceid = (await whatsapp).facebookPageUserId
console.log('ticket.whatsapp.facebookPageUserId',faceid)
    const sendMessage = await sendInstagramAttachment(
      faceid,
      ticket.contact.number,
      type,
      url,
      ticket.whatsapp.facebookUserToken
    );
    console.log('enviado')

    await ticket.update({ lastMessage: media.filename });

    fs.unlinkSync(media.path);

    return sendMessage;
  } catch (err) {
    throw new AppError("ERR_SENDING_IG_MSGMEDIA", err);
  }
};



export default sendIGMessage;
