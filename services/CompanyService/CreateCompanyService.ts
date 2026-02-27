import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import User from "../../models/User";
import sequelize from "../../database";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateQueueService from "../QueueService/CreateQueueService";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
//import CreateFlowBuilderService from "../FlowBuilderService/CreateFlowBuilderService";
import Tag from "../../models/Tag";
import QueueIntegrations from "../../models/QueueIntegrations";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { generateUniqueColor } from "./generateRandomColor";
import UserQueue from "../../models/UserQueue";
import Plan from "../../models/Plan";
import Invoices from "../../models/Invoices";
interface CompanyData {
  name: string;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  dueDate?: string;
  recurrence?: string;
  document?: string;
  paymentMethod?: string;
  password?: string;
  companyUserName?: string;
}

const CreateCompanyService = async (
  companyData: CompanyData
): Promise<Company> => {
  const {
    name,
    phone,
    password,
    email,
    status,
    planId,
    dueDate,
    recurrence,
    document,
    paymentMethod,
    companyUserName
  } = companyData;

  const companySchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_COMPANY_INVALID_NAME")
      .required("ERR_COMPANY_INVALID_NAME")
  });

  try {
    await companySchema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const t = await sequelize.transaction();

  try {
    const company = await Company.create({
      name,
      phone,
      email,
      status,
      planId: 1,
      dueDate,
      recurrence:"MENSUAL",
      document,
      paymentMethod
    },
      { transaction: t }
    );

    const user = await User.create({
      name: companyUserName ? companyUserName : name,
      email: company.email,
      password: password ? password : "123456",
      profile: "admin",
      companyId: company.id,
      allTicket: "enable",
      allowGroup: false,
      defaultTheme: "light",
      defaultMenu: "open",
      allHistoric: "enabled",
      allUserChat: "enabled",
      userClosePendingTicket: "enabled",
      showDashboard: "enabled",
      allowRealTime: "enabled",
      allowConnections: "enabled",
    },
      { transaction: t }
    );

    // Buscar el plan base
const plan = await Plan.findByPk(1, { transaction: t });
if (!plan) throw new AppError("Plan base no encontrado");

// Definir el valor del plan
const valuePlan = Number(plan.amount) || 0; // O usa el campo correcto si se llama distinto

// Crear nueva factura
const newInvoice = await Invoices.create({
  companyId: company.id,
  dueDate: dueDate ? new Date(dueDate).toISOString() : null,
  detail: plan.name,
  status: 'open',
  value: valuePlan,
  users: plan.users,
  connections: plan.connections,
  queues: plan.queues
}, { transaction: t });

    const settings = await CompaniesSettings.create({
          companyId: company.id,
          hoursCloseTicketsAuto: "9999999999",
          chatBotType: "text",
          acceptCallWhatsapp: "enabled",
          userRandom: "enabled",
          sendGreetingMessageOneQueues: "enabled",
          sendSignMessage: "enabled",
          sendFarewellWaitingTicket: "disabled",
          userRating: "disabled",
          sendGreetingAccepted: "enabled",
          CheckMsgIsGroup: "enabled",
          sendQueuePosition: "disabled",
          scheduleType: "disabled",
          acceptAudioMessageContact: "enabled",
          sendMsgTransfTicket:"disabled",
          enableLGPD: "disabled",
          requiredTag: "disabled",
          lgpdDeleteMessage: "disabled",
          lgpdHideNumber: "disabled",
          lgpdConsent: "disabled",
          lgpdLink:"",
          lgpdMessage:"",
          closeTicketOnTransfer: false,
          DirectTicketsToWallets: false,
          showNotificationPending: false
    },{ transaction: t })


    // const tagColors = [
    //   await generateUniqueColor(company.id),
    //   await generateUniqueColor(company.id),
    //   await generateUniqueColor(company.id)
    // ];
    // const tagsData = [
    //   {
    //     name: 'etiqueta1',
    // color: tagColors[0],
    //     kanban: 1,
    //     timeLane: 0,
    //     nextLaneId: null,
    //     greetingMessageLane: '',
    //     rollbackLaneId: null,
    //     userId: user.id,
    //     companyId: company.id
    //   },
    //   {
    //     name: 'etiqueta2',
    //     color: tagColors[1],
    //     kanban: 1,
    //     timeLane: 0,
    //     nextLaneId: null,
    //     greetingMessageLane: '',
    //     rollbackLaneId: null,
    //     userId: user.id,
    //     companyId: company.id
    //   },
    //   {
    //     name: 'etiqueta3',
    //     color: tagColors[2],
    //     kanban: 1,
    //     timeLane: 0,
    //     nextLaneId: null,
    //     greetingMessageLane: '',
    //     rollbackLaneId: null,
    //     userId: user.id,
    //     companyId: company.id
    //   }
    // ];

    const tagsData = [
      {
        name: 'Atracción',
        color: '#1471E3', // Azul claro
        key: "attraction",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "multiple"
      },
      {
        name: 'Interés',
        color: '#FFD700', // Amarillo
        key: "interest",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "multiple"
      },
      {
        name: 'Consideración / Conversión',
        color: '#F57C00', // Naranja fuerte
        key: "consideration",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "multiple"
      },
      {
        name: 'Venta / Lead Caliente',
        color: '#E53935', // Rojo intenso
        key: "hot-lead",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "multiple"
      },
      {
        name: 'Postventa / Fidelización',
        color: '#43A047', // Verde claro
        key: "post-sale",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "single"
      },
      {
        name: 'Congelado / Dormido',
        color: '#757575', // Gris oscuro
        key: "dormant",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "single"
      },
      {
        name: 'Referido / Promotor',
        color: '#8E24AA', // Morado
        key: "referrer",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "single"
      },
      {
        name: 'Retargeting',
        color: '#26C6DA', // Celeste / Turquesa
        key: "retargeting",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "single"
      },
      {
        name: 'Soporte',
        color: '#0288D1', // Azul oscuro
        key: "support",
        kanban: 1,
        timeLane: 0,
        nextLaneId: null,
        greetingMessageLane: '',
        rollbackLaneId: null,
        userId: user.id,
        companyId: company.id,
        enableFollowup: false,
        followupType: "multiple"
      }
    ];
    
    
    // Crear las tags dentro de la misma transacción
    await Tag.bulkCreate(tagsData, { transaction: t });

    const defaultQueue = {
      name:`Atención al Cliente`,
      color: await generateUniqueColor(company.id),
      greetingMessage: '¡Gracias por contactarnos! Pronto serás atendido por uno de nuestros agentes.',
      companyId: company.id, // Usar el ID de la empresa recién creada
      outOfHoursMessage: 'Actualmente estamos fuera de nuestro horario de atención. Por favor contáctenos de Lunes a Viernes de 8:00 a 12:00 y de 13:00 a 18:00.',
      tempoRoteador: 0,
      ativarRoteador: false,
      chatbots: [],
      orderQueue: null,
      integrationId: null,
      fileListId: null,
      closeTicket: false,
      schedules: [
        {
          weekday: 'Lunes',
          weekdayEn: 'monday',
          startTimeA: '08:00',
          endTimeA: '12:00',
          startTimeB: '13:00',
          endTimeB: '18:00'
        },
        {
          weekday: 'Martes',
          weekdayEn: 'tuesday',
          startTimeA: '08:00',
          endTimeA: '12:00',
          startTimeB: '13:00',
          endTimeB: '18:00'
        },
        {
          weekday: 'Miércoles',
          weekdayEn: 'wednesday',
          startTimeA: '08:00',
          endTimeA: '12:00',
          startTimeB: '13:00',
          endTimeB: '18:00'
        },
        {
          weekday: 'Jueves',
          weekdayEn: 'thursday',
          startTimeA: '08:00',
          endTimeA: '12:00',
          startTimeB: '13:00',
          endTimeB: '18:00'
        },
        {
          weekday: 'Viernes',
          weekdayEn: 'friday',
          startTimeA: '08:00',
          endTimeA: '12:00',
          startTimeB: '13:00',
          endTimeB: '18:00'
        },
        {
          weekday: 'Sábado',
          weekdayEn: 'saturday',
          startTimeA: '00:00',
          endTimeA: '00:00',
          startTimeB: '00:00',
          endTimeB: '00:00'
        },
        {
          weekday: 'Domingo',
          weekdayEn: 'sunday',
          startTimeA: '00:00',
          endTimeA: '00:00',
          startTimeB: '00:00',
          endTimeB: '00:00'
        }
      ]
    };
    
    const queue = await Queue.create(defaultQueue, { transaction: t });
    // Primero obtenemos el ID de la cola que creamos antes


const integration = await QueueIntegrations.create({
  companyId: company.id,
  type: 'flowbuilder',
  name: `flujo Demo ${company.name}` ,
  projectName: `flujo Demo ${company.name}`,
  jsonContent: '',
  language: '',
  urlN8N: '',
  typebotDelayMessage: 1000
}, { transaction: t });


const defaultFlowid = {
  nodes: [
    {
      id: "1",
      position: { x: 212.77557110553505, y: 75.58754754591106 },
      data: { label: "Inicio do fluxo" },
      type: "start",
      width: 226,
      height: 58,
      style: {
        backgroundColor: "#13111C",
        padding: 0,
        borderRadius: 8
      },
      selected: false,
      positionAbsolute: { x: 212.77557110553505, y: 75.58754754591106 },
      dragging: false
    },
    {
      width: 200,
      height: 205,
      id: "gYGgEwy13mpaafS6zNEuTsHKtG16QH",
      position: { x: 753.6120104449479, y: -44.27881229059294 },
      data: {
        seq: ["message0", "message1", "message2"],
        elements: [
          {
            type: "message",
            value: "¡Hola! Bienvenido a tu nuevo canal automatizado con WhatsApp.",
            number: "message0"
          },
          {
            type: "message",
            value: "Este es un ejemplo de cómo tus clientes recibirán un saludo inmediato al escribirte.",
            number: "message1"
          },
          {
            type: "message",
            value: "Puedes personalizar este mensaje con tus imagenes, videos, menú de opciones y mucho más.",
            number: "message2"
          }
        ]
      },
      type: "singleBlock",
      style: {
        backgroundColor: "#5AC2D2",
        padding: 1,
        borderRadius: 8
      },
      selected: true,
      dragging: false,
      positionAbsolute: { x: 753.6120104449479, y: -44.27881229059294 }
    },
    {
      width: 198,
      height: 95,
      id: "VMBmvrp5QslZF8uEQc1PWsEs4AHXKs",
      position: { x: 1192.7755711055352, y: 75.58754754591106 },
      data: {
        seq: ["message0"],
        elements: [
          {
            type: "message",
            value:
              "Con esta herramienta podrás:\n• Responder automáticamente a tus clientes\n• Crear flujos inteligentes según lo que escriban\n• Redirigir a un asesor humano en el momento justo",
            number: "message0"
          }
        ]
      },
      type: "singleBlock",
      style: {
        backgroundColor: "#13111C",
        padding: 0,
        borderRadius: 8
      },
      selected: false,
      positionAbsolute: { x: 1192.7755711055352, y: 75.58754754591106 }
    }
  ],
  connections: [
    {
      style: { color: "#ff0000", strokeWidth: "6px" },
      animated: false,
      source: "gYGgEwy13mpaafS6zNEuTsHKtG16QH",
      sourceHandle: "a",
      target: "VMBmvrp5QslZF8uEQc1PWsEs4AHXKs",
      targetHandle: null,
      id: "reactflow__edge-gYGgEwy13mpaafS6zNEuTsHKtG16QHa-VMBmvrp5QslZF8uEQc1PWsEs4AHXKs"
    },
    {
      style: { color: "#ff0000", strokeWidth: "6px" },
      animated: false,
      source: "1",
      sourceHandle: "a",
      target: "gYGgEwy13mpaafS6zNEuTsHKtG16QH",
      targetHandle: null,
      id: "reactflow__edge-1a-gYGgEwy13mpaafS6zNEuTsHKtG16QH"
    }
  ]
};

const defaultFlow = {
  user_id: user.id,
  name: `flujo Demo`,
  company_id: company.id,
  flow: defaultFlowid, // Aquí se inyecta el flujo demo
};

// Crear el flujo usando el servicio
const flow = await FlowBuilderModel.create(defaultFlow, { transaction: t });


let flowId: number | null = null;
flowId = flow.id;



const whatsappDemo = {
  name: `${company.name} Demo`,
  greetingMessage: '¡Bienvenido a *Mi Empresa*! Gracias por contactarnos. En breve serás atendido por uno de nuestros agentes.',
  complationMessage: '¡Gracias por contactar con *Mi Empresa*! ¿Hay algo más en lo que podamos ayudarte hoy?',
  outOfHoursMessage: 'Actualmente estamos fuera de nuestro horario de atención. Por favor contáctenos de Lunes a Viernes de 8:00 a 12:00 y de 13:00 a 18:00.',
  ratingMessage: 'Por favor, califica nuestra atención del 1 al 5, donde 1 es muy mala y 5 excelente.',
  isDefault: true,
  maxUseBotQueues: 3,
  provider: 'beta',
  channel: 'whatsapp',
  expiresTicket: 24, // Cierra tickets después de 24 horas de inactividad
  allowGroup: false,
  groupAsTicket: 'disabled',
  timeUseBotQueues: '0',
  timeSendQueue: 5,
  sendIdQueue: queue.id ? queue.id : null,
  expiresTicketNPS: 0,
  expiresInactiveMessage: '',
  timeInactiveMessage: '',
  inactiveMessage: '',
  maxUseBotQueuesNPS: 3,
  whenExpiresTicket: '0',
  timeCreateNewTicket: 0,
  greetingMediaAttachment: '',
  // importRecentMessages: false,
  // importOldMessages: '',
  // importOldMessagesGroups: false,
  integrationId: integration.id,
  collectiveVacationEnd: null,
  collectiveVacationStart: null,
  collectiveVacationMessage:null,
  queueIdImportMessages: null,
  flowIdWelcome: flowId,
  flowIdNotPhrase: flowId,
  closedTicketsPostImported: null,
  companyId: company.id,
  status:'DISCONNECTED',
  schedules: [
    {
      weekday: 'Lunes',
      weekdayEn: 'monday',
      startTimeA: '08:00',
      endTimeA: '12:00',
      startTimeB: '13:00',
      endTimeB: '18:00'
    },
    {
      weekday: 'Martes',
      weekdayEn: 'tuesday',
      startTimeA: '08:00',
      endTimeA: '12:00',
      startTimeB: '13:00',
      endTimeB: '18:00'
    },
    {
      weekday: 'Miércoles',
      weekdayEn: 'wednesday',
      startTimeA: '08:00',
      endTimeA: '12:00',
      startTimeB: '13:00',
      endTimeB: '18:00'
    },
    {
      weekday: 'Jueves',
      weekdayEn: 'thursday',
      startTimeA: '08:00',
      endTimeA: '12:00',
      startTimeB: '13:00',
      endTimeB: '18:00'
    },
    {
      weekday: 'Viernes',
      weekdayEn: 'friday',
      startTimeA: '08:00',
      endTimeA: '12:00',
      startTimeB: '13:00',
      endTimeB: '18:00'
    },
    {
      weekday: 'Sábado',
      weekdayEn: 'saturday',
      startTimeA: '00:00',
      endTimeA: '00:00',
      startTimeB: '00:00',
      endTimeB: '00:00'
    },
    {
      weekday: 'Domingo',
      weekdayEn: 'sunday',
      startTimeA: '00:00',
      endTimeA: '00:00',
      startTimeB: '00:00',
      endTimeB: '00:00'
    }
  ],
  promptId: null,
};



const whatsapp = await Whatsapp.create(whatsappDemo, { 
  transaction: t
});

await UserQueue.create({
  userId: user.id,
  queueId: queue.id
}, { transaction: t });

await user.update({ whatsappId: whatsapp.id }, { transaction: t });


    await t.commit();

    return company;
  } catch (error) {
    await t.rollback();
    throw new AppError("Não foi possível criar a empresa!", error);
  }
};

export default CreateCompanyService;