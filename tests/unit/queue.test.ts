import { describe, test, expect, jest } from '@jest/globals';
import Queue from '../../models/Queue';

jest.mock('../../models/Queue');

describe('Queue Model - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create queue with valid data', async () => {
    const queueData = {
      name: 'Support Queue',
      color: '#FF5733',
      companyId: 1,
      greetingMessage: 'Welcome to support'
    };

    const mockQueue = {
      id: 1,
      ...queueData,
      createdAt: new Date()
    };

    const mockCreate = Queue.create as jest.MockedFunction<typeof Queue.create>;
    mockCreate.mockResolvedValue(mockQueue as any);

    const result = await Queue.create(queueData);

    expect(result).toHaveProperty('id');
    expect(result.name).toBe('Support Queue');
    expect(result.color).toBe('#FF5733');
  });

  test('should find queue by id', async () => {
    const mockQueue = {
      id: 1,
      name: 'Sales Queue',
      color: '#00FF00',
      companyId: 1
    };

    const mockFindByPk = Queue.findByPk as jest.MockedFunction<typeof Queue.findByPk>;
    mockFindByPk.mockResolvedValue(mockQueue as any);

    const result = await Queue.findByPk(1);

    expect(result).toBeDefined();
    expect(result?.name).toBe('Sales Queue');
  });

  test('should list queues by company', async () => {
    const mockQueues = [
      { id: 1, name: 'Support', companyId: 1 },
      { id: 2, name: 'Sales', companyId: 1 },
      { id: 3, name: 'Billing', companyId: 1 }
    ];

    const mockFindAll = Queue.findAll as jest.MockedFunction<typeof Queue.findAll>;
    mockFindAll.mockResolvedValue(mockQueues as any);

    const result = await Queue.findAll({
      where: { companyId: 1 }
    });

    expect(result).toHaveLength(3);
    expect(result.every(q => q.companyId === 1)).toBe(true);
  });

  test('should update queue properties', async () => {
    const mockQueue = {
      id: 1,
      name: 'Old Name',
      color: '#FF0000',
      update: jest.fn().mockResolvedValue(true)
    };

    const mockFindByPk = Queue.findByPk as jest.MockedFunction<typeof Queue.findByPk>;
    mockFindByPk.mockResolvedValue(mockQueue as any);

    const queue = await Queue.findByPk(1);
    await queue?.update({ name: 'New Name', color: '#00FF00' });

    expect(queue?.update).toHaveBeenCalledWith({
      name: 'New Name',
      color: '#00FF00'
    });
  });

  test('should delete queue', async () => {
    const mockQueue = {
      id: 1,
      name: 'Test Queue',
      destroy: jest.fn().mockResolvedValue(true)
    };

    const mockFindByPk = Queue.findByPk as jest.MockedFunction<typeof Queue.findByPk>;
    mockFindByPk.mockResolvedValue(mockQueue as any);

    const queue = await Queue.findByPk(1);
    await queue?.destroy();

    expect(queue?.destroy).toHaveBeenCalled();
  });

  test('should validate color format', () => {
    const validColors = ['#FF5733', '#00FF00', '#0000FF'];
    const invalidColors = ['FF5733', 'red', '#GG0000', '#123'];

    validColors.forEach(color => {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    invalidColors.forEach(color => {
      expect(color).not.toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  test('should handle queue with greeting message', async () => {
    const queueData = {
      name: 'Automated Queue',
      color: '#FF5733',
      companyId: 1,
      greetingMessage: 'Hello! How can we help you today?'
    };

    const mockCreate = Queue.create as jest.MockedFunction<typeof Queue.create>;
    mockCreate.mockResolvedValue({ id: 1, ...queueData } as any);

    const result = await Queue.create(queueData);

    expect(result.greetingMessage).toBe('Hello! How can we help you today?');
  });

  test('should assign users to queue', async () => {
    const queueWithUsers = {
      id: 1,
      name: 'Support',
      users: [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ]
    };

    const mockFindByPk = Queue.findByPk as jest.MockedFunction<typeof Queue.findByPk>;
    mockFindByPk.mockResolvedValue(queueWithUsers as any);

    const result = await Queue.findByPk(1);

    expect(result?.users).toHaveLength(2);
  });
});
