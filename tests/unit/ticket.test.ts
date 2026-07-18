import { describe, test, expect, jest } from '@jest/globals';
import CreateTicketService from '../../services/TicketServices/CreateTicketService';
import Ticket from '../../models/Ticket';
import ShowContactService from '../../services/ContactServices/ShowContactService';
import GetDefaultWhatsApp from '../../helpers/GetDefaultWhatsApp';
import GetDefaultWhatsAppByUser from '../../helpers/GetDefaultWhatsAppByUser';
import CheckContactOpenTickets from '../../helpers/CheckContactOpenTickets';
import ShowWhatsAppService from '../../services/WhatsappService/ShowWhatsAppService';
import ShowTicketService from '../../services/TicketServices/ShowTicketService';

// Mock dependencies
jest.mock('../../models/Ticket');
jest.mock('../../services/ContactServices/ShowContactService');
jest.mock('../../helpers/GetDefaultWhatsApp');
jest.mock('../../helpers/GetDefaultWhatsAppByUser');
jest.mock('../../helpers/CheckContactOpenTickets');
// socket con getIO funcional (CreateTicketService hace io.of(companyId).emit(...) al final).
jest.mock('../../libs/socket', () => ({
  getIO: jest.fn(() => ({ of: jest.fn(() => ({ emit: jest.fn() })) })),
}));
jest.mock('../../services/TicketServices/ShowTicketService');
jest.mock('../../services/TicketServices/CreateLogTicketService');
// Deps que CreateTicketService adquirió al evolucionar y el test no mockeaba (drift):
// ShowWhatsAppService (si se pasa whatsappId), + reglas de automatización y notificación [Fase E].
jest.mock('../../services/WhatsappService/ShowWhatsAppService');
jest.mock('../../services/AutomationServices/RunTicketAutomationRules');
jest.mock('../../services/NotificationServices/NotifyTicketEventService');

describe('CreateTicketService - Ticket Creation Tests', () => {
  const mockWhatsApp = {
    id: '1',
    name: 'WhatsApp Test',
    channel: 'whatsapp'
  };

  const mockContact = {
    id: 1,
    name: 'Test Contact',
    number: '5511999999999',
    isGroup: false
  };

  const mockTicket = {
    id: 1,
    contactId: 1,
    companyId: 1,
    whatsappId: '1',
    channel: 'whatsapp',
    userId: 1,
    status: 'open',
    isBot: true,
    isActiveDemand: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ShowWhatsAppService as jest.MockedFunction<typeof ShowWhatsAppService>).mockResolvedValue(mockWhatsApp as any);
    // CreateTicketService recarga el ticket vía ShowTicketService(id) y usa .reload()/.setDataValue();
    // devolvemos un ticket-like a partir del create mockeado para que el flujo complete.
    (ShowTicketService as jest.MockedFunction<typeof ShowTicketService>).mockImplementation(
      (async (id: number) => ({
        id,
        reload: jest.fn().mockResolvedValue(undefined),
        setDataValue: jest.fn(),
      })) as any
    );
  });

  test('should create ticket successfully with valid data', async () => {
    // Arrange
    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(mockWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(mockContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(mockTicket as any);

    // Act
    const result = await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      whatsappId: '1'
    });

    // Assert
    expect(result).toBeDefined();
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 1,
        companyId: 1,
        userId: 1,
        status: 'open'
      })
    );
  });

  test('should create ticket with default whatsapp when not specified', async () => {
    // Arrange
    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(mockWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(mockContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(mockTicket as any);

    // Act
    await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      whatsappId: ''
    });

    // Assert
    expect(mockGetDefaultWhatsAppByUser).toHaveBeenCalledWith(1);
  });

  test('should create group ticket with status "group"', async () => {
    // Arrange
    const groupContact = { ...mockContact, isGroup: true };

    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(mockWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(groupContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const groupTicket = { ...mockTicket, status: 'group', isGroup: true };
    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(groupTicket as any);

    // Act
    await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      whatsappId: '1'
    });

    // Assert
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'group',
        isGroup: true
      })
    );
  });

  test('should assign queue to ticket when queueId provided', async () => {
    // Arrange
    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(mockWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(mockContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const ticketWithQueue = { ...mockTicket, queueId: 5 };
    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(ticketWithQueue as any);

    // Act
    await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      queueId: 5,
      whatsappId: '1'
    });

    // Assert
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        queueId: 5
      })
    );
  });

  test('should set isBot to true by default', async () => {
    // Arrange
    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(mockWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(mockContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(mockTicket as any);

    // Act
    await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      whatsappId: '1'
    });

    // Assert
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        isBot: true,
        isActiveDemand: true
      })
    );
  });

  test('should check for open tickets before creating new ticket', async () => {
    // Arrange
    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(mockWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(mockContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(mockTicket as any);

    // Act
    await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      whatsappId: '1'
    });

    // Assert: el dedup ya NO usa CheckContactOpenTickets — CreateTicketService busca inline con
    // Ticket.findOne (contactId+companyId+whatsappId, status abierto) antes de crear. Se verifica eso.
    expect(Ticket.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contactId: 1, companyId: 1 }) })
    );
  });

  test('should inherit channel from whatsapp connection', async () => {
    // Arrange
    const telegramWhatsApp = { ...mockWhatsApp, channel: 'telegram' };

    const mockGetDefaultWhatsAppByUser = GetDefaultWhatsAppByUser as jest.MockedFunction<typeof GetDefaultWhatsAppByUser>;
    mockGetDefaultWhatsAppByUser.mockResolvedValue(telegramWhatsApp as any);
    // Se pasa whatsappId → CreateTicketService toma la conexión de ShowWhatsAppService (no del helper),
    // así que el canal telegram debe venir de ahí (si no, el default del beforeEach lo pisaría).
    (ShowWhatsAppService as jest.MockedFunction<typeof ShowWhatsAppService>).mockResolvedValue(telegramWhatsApp as any);

    const mockShowContactService = ShowContactService as jest.MockedFunction<typeof ShowContactService>;
    mockShowContactService.mockResolvedValue(mockContact as any);

    const mockCheckContactOpenTickets = CheckContactOpenTickets as jest.MockedFunction<typeof CheckContactOpenTickets>;
    mockCheckContactOpenTickets.mockResolvedValue(undefined);

    const telegramTicket = { ...mockTicket, channel: 'telegram' };
    const mockTicketCreate = Ticket.create as jest.MockedFunction<typeof Ticket.create>;
    mockTicketCreate.mockResolvedValue(telegramTicket as any);

    // Act
    await CreateTicketService({
      contactId: 1,
      status: 'open',
      userId: 1,
      companyId: 1,
      whatsappId: '1'
    });

    // Assert
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram'
      })
    );
  });
});
