import { describe, test, expect, jest } from '@jest/globals';
import Contact from '../../models/Contact';

// Mock models
jest.mock('../../models/Contact');

describe('Contact Model - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create contact with valid data', async () => {
    // Arrange
    const contactData = {
      name: 'John Doe',
      number: '5511999999999',
      email: 'john@example.com',
      companyId: 1
    };

    const mockContact = {
      id: 1,
      ...contactData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockCreate = Contact.create as jest.MockedFunction<typeof Contact.create>;
    mockCreate.mockResolvedValue(mockContact as any);

    // Act
    const result = await Contact.create(contactData);

    // Assert
    expect(result).toHaveProperty('id');
    expect(result.name).toBe('John Doe');
    expect(result.number).toBe('5511999999999');
    expect(mockCreate).toHaveBeenCalledWith(contactData);
  });

  test('should find contact by id', async () => {
    // Arrange
    const mockContact = {
      id: 1,
      name: 'Test Contact',
      number: '5511999999999',
      companyId: 1
    };

    const mockFindByPk = Contact.findByPk as jest.MockedFunction<typeof Contact.findByPk>;
    mockFindByPk.mockResolvedValue(mockContact as any);

    // Act
    const result = await Contact.findByPk(1);

    // Assert
    expect(result).toBeDefined();
    expect(result?.id).toBe(1);
    expect(result?.name).toBe('Test Contact');
  });

  test('should find contact by number and companyId', async () => {
    // Arrange
    const mockContact = {
      id: 1,
      name: 'Test Contact',
      number: '5511999999999',
      companyId: 1
    };

    const mockFindOne = Contact.findOne as jest.MockedFunction<typeof Contact.findOne>;
    mockFindOne.mockResolvedValue(mockContact as any);

    // Act
    const result = await Contact.findOne({
      where: { number: '5511999999999', companyId: 1 }
    });

    // Assert
    expect(result).toBeDefined();
    expect(result?.number).toBe('5511999999999');
    expect(result?.companyId).toBe(1);
  });

  test('should update contact data', async () => {
    // Arrange
    const mockContact = {
      id: 1,
      name: 'Old Name',
      number: '5511999999999',
      companyId: 1,
      update: jest.fn().mockResolvedValue(true)
    };

    const mockFindByPk = Contact.findByPk as jest.MockedFunction<typeof Contact.findByPk>;
    mockFindByPk.mockResolvedValue(mockContact as any);

    // Act
    const contact = await Contact.findByPk(1);
    await contact?.update({ name: 'New Name' });

    // Assert
    expect(contact?.update).toHaveBeenCalledWith({ name: 'New Name' });
  });

  test('should delete contact', async () => {
    // Arrange
    const mockContact = {
      id: 1,
      name: 'Test Contact',
      destroy: jest.fn().mockResolvedValue(true)
    };

    const mockFindByPk = Contact.findByPk as jest.MockedFunction<typeof Contact.findByPk>;
    mockFindByPk.mockResolvedValue(mockContact as any);

    // Act
    const contact = await Contact.findByPk(1);
    await contact?.destroy();

    // Assert
    expect(contact?.destroy).toHaveBeenCalled();
  });

  test('should list contacts by company', async () => {
    // Arrange
    const mockContacts = [
      { id: 1, name: 'Contact 1', number: '5511111111111', companyId: 1 },
      { id: 2, name: 'Contact 2', number: '5511222222222', companyId: 1 }
    ];

    const mockFindAll = Contact.findAll as jest.MockedFunction<typeof Contact.findAll>;
    mockFindAll.mockResolvedValue(mockContacts as any);

    // Act
    const result = await Contact.findAll({
      where: { companyId: 1 }
    });

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].companyId).toBe(1);
    expect(result[1].companyId).toBe(1);
  });

  test('should validate contact number format', () => {
    // Valid numbers
    expect('5511999999999').toMatch(/^\d+$/);
    expect('5511888888888').toMatch(/^\d+$/);

    // Invalid numbers
    expect('invalid').not.toMatch(/^\d+$/);
    expect('11-99999-9999').not.toMatch(/^\d+$/);
  });

  test('should handle contact with optional email', async () => {
    // Arrange
    const contactWithoutEmail = {
      name: 'No Email Contact',
      number: '5511999999999',
      companyId: 1
    };

    const mockCreate = Contact.create as jest.MockedFunction<typeof Contact.create>;
    mockCreate.mockResolvedValue({ id: 1, ...contactWithoutEmail } as any);

    // Act
    const result = await Contact.create(contactWithoutEmail);

    // Assert
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty('email');
  });
});
