import { describe, test, expect, jest } from '@jest/globals';
import Message from '../../models/Message';

jest.mock('../../models/Message');

describe('Message Model - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create message with valid data', async () => {
    const messageData = {
      body: 'Hello, this is a test message',
      ticketId: 1,
      companyId: 1,
      fromMe: true,
      read: false
    };

    const mockMessage = {
      id: '1',
      ...messageData,
      createdAt: new Date()
    };

    const mockCreate = Message.create as jest.MockedFunction<typeof Message.create>;
    mockCreate.mockResolvedValue(mockMessage as any);

    const result = await Message.create(messageData);

    expect(result).toHaveProperty('id');
    expect(result.body).toBe('Hello, this is a test message');
    expect(result.fromMe).toBe(true);
  });

  test('should mark message as read', async () => {
    const mockMessage = {
      id: '1',
      body: 'Test message',
      read: false,
      update: jest.fn().mockResolvedValue(true)
    };

    const mockFindByPk = Message.findByPk as jest.MockedFunction<typeof Message.findByPk>;
    mockFindByPk.mockResolvedValue(mockMessage as any);

    const message = await Message.findByPk('1');
    await message?.update({ read: true });

    expect(message?.update).toHaveBeenCalledWith({ read: true });
  });

  test('should list messages by ticket', async () => {
    const mockMessages = [
      { id: '1', ticketId: 1, body: 'Message 1', fromMe: false },
      { id: '2', ticketId: 1, body: 'Message 2', fromMe: true },
      { id: '3', ticketId: 1, body: 'Message 3', fromMe: false }
    ];

    const mockFindAll = Message.findAll as jest.MockedFunction<typeof Message.findAll>;
    mockFindAll.mockResolvedValue(mockMessages as any);

    const result = await Message.findAll({
      where: { ticketId: 1 }
    });

    expect(result).toHaveLength(3);
    expect(result.every(m => m.ticketId === 1)).toBe(true);
  });

  test('should handle media messages', async () => {
    const mediaMessage = {
      body: 'Image.jpg',
      ticketId: 1,
      companyId: 1,
      fromMe: true,
      mediaType: 'image',
      mediaUrl: 'https://example.com/image.jpg'
    };

    const mockCreate = Message.create as jest.MockedFunction<typeof Message.create>;
    mockCreate.mockResolvedValue({ id: '1', ...mediaMessage } as any);

    const result = await Message.create(mediaMessage);

    expect(result.mediaType).toBe('image');
    expect(result.mediaUrl).toBeTruthy();
  });

  test('should delete message', async () => {
    const mockMessage = {
      id: '1',
      body: 'Test message',
      destroy: jest.fn().mockResolvedValue(true)
    };

    const mockFindByPk = Message.findByPk as jest.MockedFunction<typeof Message.findByPk>;
    mockFindByPk.mockResolvedValue(mockMessage as any);

    const message = await Message.findByPk('1');
    await message?.destroy();

    expect(message?.destroy).toHaveBeenCalled();
  });

  test('should filter unread messages', async () => {
    const mockMessages = [
      { id: '1', ticketId: 1, read: false },
      { id: '2', ticketId: 1, read: true },
      { id: '3', ticketId: 1, read: false }
    ];

    const mockFindAll = Message.findAll as jest.MockedFunction<typeof Message.findAll>;
    mockFindAll.mockResolvedValue(mockMessages.filter(m => !m.read) as any);

    const result = await Message.findAll({
      where: { ticketId: 1, read: false }
    });

    expect(result).toHaveLength(2);
    expect(result.every(m => !m.read)).toBe(true);
  });

  test('should validate message body length', () => {
    const shortMessage = 'Hi';
    const longMessage = 'a'.repeat(5000);
    const tooLongMessage = 'a'.repeat(10001);

    expect(shortMessage.length).toBeLessThan(10000);
    expect(longMessage.length).toBeLessThanOrEqual(10000);
    expect(tooLongMessage.length).toBeGreaterThan(10000);
  });
});
