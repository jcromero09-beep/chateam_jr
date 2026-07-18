import express from "express";

import * as CompanyController from "../../controllers/api/CompanyController";
import * as PlanController from "../../controllers/api/PlanController";
import * as HelpController from "../../controllers/api/HelpController";
import * as PartnerController from "../../controllers/api/PartnerController";
import * as ConnectController from "../../controllers/api/ConnectController";
import * as InvoicesController from "../../controllers/InvoicesController";
import * as UserController from "../../controllers/UserController";
import isAuthCompany from "../../middleware/isAuthCompany";
import * as SessionController from "../../controllers/SessionController";
import isAuth from "../../middleware/isAuth";
import * as TicketController from "../../controllers/TicketController";
import * as MessageController from "../../controllers/MessageController";
import * as ContactController from "../../controllers/ContactController";
import * as QueueController from "../../controllers/QueueController";
import * as ChatController from "../../controllers/ChatController";
import * as TagController from "../../controllers/TagController";
import * as QuickMessageController from "../../controllers/QuickMessageController";

import { validateChatAccess } from "../../middleware/validateChatAccess";
import multer from "multer";
import uploadConfig from "../../config/upload";
import chatUploadConfig from "../../config/chatUpload";
const apiCompanyRoutes = express.Router();

const upload = multer(uploadConfig);
const chatUpload = multer(chatUploadConfig);
// PLANS
apiCompanyRoutes.get("/plans", isAuthCompany, PlanController.index);

apiCompanyRoutes.get("/plans/:id", isAuthCompany, PlanController.show);

apiCompanyRoutes.post("/plans", isAuthCompany, PlanController.store);

apiCompanyRoutes.put("/plans/:id", isAuthCompany, PlanController.update);

apiCompanyRoutes.delete("/plans/:id", isAuthCompany, PlanController.remove);

// COMPANY
apiCompanyRoutes.get("/companies", isAuthCompany, CompanyController.index);

apiCompanyRoutes.get("/companies/:id", isAuthCompany, CompanyController.show);

apiCompanyRoutes.get("/companiesEmail/:email", isAuthCompany, CompanyController.showEmail);

apiCompanyRoutes.post("/companies", isAuthCompany, CompanyController.store);

apiCompanyRoutes.put("/companies/:id", isAuthCompany, CompanyController.update);

apiCompanyRoutes.put("/companies/:id/schedules", isAuthCompany, CompanyController.updateSchedules);

apiCompanyRoutes.delete("/companies/:id", isAuthCompany, CompanyController.remove);

// HELP
apiCompanyRoutes.get("/helps", isAuthCompany, HelpController.index);

apiCompanyRoutes.get("/helps/:id", isAuthCompany, HelpController.show);

apiCompanyRoutes.post("/helps", isAuthCompany, HelpController.store);

apiCompanyRoutes.put("/helps/:id", isAuthCompany, HelpController.update);

apiCompanyRoutes.delete("/helps/:id", isAuthCompany, HelpController.remove);

+// PARTNER
apiCompanyRoutes.get("/partners", isAuthCompany, PartnerController.index);

apiCompanyRoutes.get("/partners/:id", isAuthCompany, PartnerController.show);

apiCompanyRoutes.post("/partners", isAuthCompany, PartnerController.store);

apiCompanyRoutes.put("/partners/:id", isAuthCompany, PartnerController.update);

apiCompanyRoutes.delete("/partners/:id", isAuthCompany, PartnerController.remove);


// INVOICES
apiCompanyRoutes.get("/invoices", isAuthCompany, InvoicesController.index);

apiCompanyRoutes.get("/invoices/:id", isAuthCompany, InvoicesController.show);

apiCompanyRoutes.get("/invoicesCompany/:companyId", isAuthCompany, InvoicesController.list);

apiCompanyRoutes.post("/invoices", isAuthCompany, InvoicesController.store);

apiCompanyRoutes.put("/invoices/:id", isAuthCompany, InvoicesController.update);

apiCompanyRoutes.delete("/invoices/:id", isAuthCompany, InvoicesController.remove);


// COMPANY
// apiCompanyRoutes.get("/users", isAuthCompany, UserController.index);

// apiCompanyRoutes.get("/users/:userId", isAuthCompany, UserController.show);

apiCompanyRoutes.get("/users/:email", isAuthCompany, UserController.showEmail);

// apiCompanyRoutes.post("/users", isAuthCompany, UserController.store);

// apiCompanyRoutes.put("/users/:userId", isAuthCompany, UserController.update);

// apiCompanyRoutes.delete("/users/:userId", isAuthCompany, UserController.remove);

apiCompanyRoutes.post("/signup", UserController.store);
apiCompanyRoutes.post("/login", SessionController.store);
apiCompanyRoutes.post("/connect", ConnectController.connect);
apiCompanyRoutes.post("/refresh_token", SessionController.update);
apiCompanyRoutes.delete("/logout", isAuth, SessionController.remove);
apiCompanyRoutes.get("/me", isAuth, SessionController.me);
//mesages
apiCompanyRoutes.get("/messages/:ticketId", isAuth, MessageController.index);
apiCompanyRoutes.post("/messages/:ticketId", isAuth, upload.array("medias"), MessageController.store);
apiCompanyRoutes.post("/messages/edit/:messageId", isAuth, MessageController.edit);
apiCompanyRoutes.post('/message/forward', isAuth, MessageController.forwardMessage);
apiCompanyRoutes.get("/quick-messages", isAuth, QuickMessageController.index);
apiCompanyRoutes.post("/messages/lista/:ticketId", isAuth, MessageController.sendListMessage);

//tickets
apiCompanyRoutes.get("/tickets", isAuth, TicketController.index);
apiCompanyRoutes.put("/tickets/:ticketId", isAuth, TicketController.update);
apiCompanyRoutes.delete("/tickets/:ticketId", isAuth, TicketController.remove);
apiCompanyRoutes.get("/tickets/:ticketId", isAuth, TicketController.show);
apiCompanyRoutes.post("/tickets/closeAll", isAuth, TicketController.closeAll);
apiCompanyRoutes.post("/tickets", isAuth, TicketController.store);
//contactos
apiCompanyRoutes.get("/contacts/:contactId", isAuth, ContactController.show);
apiCompanyRoutes.get("/contacts", isAuth, ContactController.index);
apiCompanyRoutes.post("/contacts", isAuth, ContactController.store);
apiCompanyRoutes.put("/contacts/:contactId", isAuth, ContactController.update);
//apiCompanyRoutes.post("/contacts/upload", isAuth, upload.array("file"), ContactController.upload);
//user
apiCompanyRoutes.get("/users", isAuth, UserController.index);
apiCompanyRoutes.put("/users-online", isAuth, UserController.online);
apiCompanyRoutes.get("/get-online", isAuth, UserController.get);
apiCompanyRoutes.put("/users/:userId", isAuth, UserController.update);
apiCompanyRoutes.get("/users/:userId", isAuth, UserController.show);

//inbox - chat interno
apiCompanyRoutes.get("/chats", isAuth, ChatController.index);
apiCompanyRoutes.get("/chats/:id", isAuth, validateChatAccess, ChatController.show);
apiCompanyRoutes.get("/chats/:id/messages", isAuth, validateChatAccess, ChatController.messages);
apiCompanyRoutes.post("/chats", isAuth, ChatController.store);
apiCompanyRoutes.post("/chats/:id/messages", isAuth, validateChatAccess, chatUpload.single("file"), ChatController.saveMessage);
apiCompanyRoutes.post("/chats/:id/read", isAuth, validateChatAccess, ChatController.checkAsRead);
apiCompanyRoutes.get("/chats/:id/unreads", isAuth, validateChatAccess, ChatController.getUnreadCount);
apiCompanyRoutes.post("/chats/:id/mark-read", isAuth, validateChatAccess, ChatController.markMultipleAsRead);

//queue
apiCompanyRoutes.get("/queue", isAuth, QueueController.index);

//tags

apiCompanyRoutes.get("/tags", isAuth, TagController.index);
apiCompanyRoutes.delete("/tags-contacts/:tagId/:contactId", isAuth, TagController.removeContactTag);
apiCompanyRoutes.get("/contactTags/:contactId", isAuth, ContactController.getContactTags);
apiCompanyRoutes.post("/tags/sync", isAuth, TagController.syncTags);
export default apiCompanyRoutes;
