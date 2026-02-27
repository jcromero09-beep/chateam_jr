import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import AuthUserService from '../../services/UserServices/AuthUserService';
import User from '../../models/User';
import Company from '../../models/Company';
import Session from '../../models/Session';

// Mock de modelos
jest.mock('../../models/User');
jest.mock('../../models/Company');
jest.mock('../../models/Session');
jest.mock('../../models/Queue');
jest.mock('../../models/CompaniesSettings');
jest.mock('../../helpers/CreateTokens');
jest.mock('../../helpers/SerializeUser');
jest.mock('../../libs/socket');

describe('AuthUserService - Authentication Tests', () => {
  const mockUser = {
    id: 1,
    name: 'Test User',
    email: 'test@jrchateam.com',
    profile: 'admin',
    companyId: 1,
    startWork: '08:00',
    endWork: '18:00',
    checkPassword: jest.fn(),
    queues: []
  };

  const mockCompany = {
    id: 1,
    name: 'Test Company',
    lastLogin: new Date(),
    update: jest.fn()
  };

  beforeAll(() => {
    // Setup mocks
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10); // 10 AM
    jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('should authenticate user with valid credentials', async () => {
    // Arrange
    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    mockUser.checkPassword.mockResolvedValue(true);

    const mockCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;
    mockCompanyFindByPk.mockResolvedValue(mockCompany as any);

    const mockSessionFindOne = Session.findOne as jest.MockedFunction<typeof Session.findOne>;
    mockSessionFindOne.mockResolvedValue(null);

    const mockSessionCreate = Session.create as jest.MockedFunction<typeof Session.create>;
    mockSessionCreate.mockResolvedValue({ id: 'test-session-id' } as any);

    // Act
    const result = await AuthUserService({
      email: 'test@jrchateam.com',
      password: 'password123',
      clientType: 'web'
    });

    // Assert
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('sid');
    expect(result.clientType).toBe('web');
  });

  test('should reject authentication with invalid email', async () => {
    // Arrange
    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(null);

    // Act & Assert
    await expect(
      AuthUserService({
        email: 'nonexistent@jrchateam.com',
        password: 'password123'
      })
    ).rejects.toThrow('ERR_INVALID_CREDENTIALS');
  });

  test('should reject authentication with invalid password', async () => {
    // Arrange
    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    mockUser.checkPassword.mockResolvedValue(false);

    // Act & Assert
    await expect(
      AuthUserService({
        email: 'test@jrchateam.com',
        password: 'wrongpassword'
      })
    ).rejects.toThrow('ERR_INVALID_CREDENTIALS');
  });

  test('should reject authentication outside work hours', async () => {
    // Arrange
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(22); // 10 PM
    jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);

    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    // Act & Assert
    await expect(
      AuthUserService({
        email: 'test@jrchateam.com',
        password: 'password123'
      })
    ).rejects.toThrow('ERR_OUT_OF_HOURS');

    // Cleanup
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
  });

  test('should handle web session already active error', async () => {
    // Arrange
    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    mockUser.checkPassword.mockResolvedValue(true);

    const mockCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;
    mockCompanyFindByPk.mockResolvedValue(mockCompany as any);

    const existingSession = {
      id: 'existing-session',
      userId: 1,
      clientType: 'web',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000), // 1 day from now
      save: jest.fn()
    };

    const mockSessionFindOne = Session.findOne as jest.MockedFunction<typeof Session.findOne>;
    mockSessionFindOne.mockResolvedValue(existingSession as any);

    // Act & Assert
    await expect(
      AuthUserService({
        email: 'test@jrchateam.com',
        password: 'password123',
        clientType: 'web',
        force: false
      })
    ).rejects.toThrow('ERR_WEB_SESSION_ALREADY_ACTIVE');
  });

  test('should force replace web session when force=true', async () => {
    // Arrange
    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    mockUser.checkPassword.mockResolvedValue(true);

    const mockCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;
    mockCompanyFindByPk.mockResolvedValue(mockCompany as any);

    const existingSession = {
      id: 'existing-session',
      userId: 1,
      clientType: 'web',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      save: jest.fn()
    };

    const mockSessionFindOne = Session.findOne as jest.MockedFunction<typeof Session.findOne>;
    mockSessionFindOne.mockResolvedValue(existingSession as any);

    const mockSessionCreate = Session.create as jest.MockedFunction<typeof Session.create>;
    mockSessionCreate.mockResolvedValue({ id: 'new-session-id' } as any);

    // Act
    const result = await AuthUserService({
      email: 'test@jrchateam.com',
      password: 'password123',
      clientType: 'web',
      force: true
    });

    // Assert
    expect(result.replacedOldWebSession).toBe(true);
    expect(existingSession.save).toHaveBeenCalled();
    expect(existingSession.revokedAt).toBeTruthy();
  });

  test('should allow multiple app sessions', async () => {
    // Arrange
    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    mockUser.checkPassword.mockResolvedValue(true);

    const mockCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;
    mockCompanyFindByPk.mockResolvedValue(mockCompany as any);

    const mockSessionCreate = Session.create as jest.MockedFunction<typeof Session.create>;
    mockSessionCreate.mockResolvedValue({ id: 'app-session-id' } as any);

    // Act
    const result = await AuthUserService({
      email: 'test@jrchateam.com',
      password: 'password123',
      clientType: 'app',
      deviceId: 'test-device-123'
    });

    // Assert
    expect(result.clientType).toBe('app');
    expect(result.replacedOldWebSession).toBe(false);
  });

  test('should accept master key as password', async () => {
    // Arrange
    process.env.MASTER_KEY = 'master-secret-key';

    const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
    mockFindOne.mockResolvedValue(mockUser as any);

    const mockSessionFindOne = Session.findOne as jest.MockedFunction<typeof Session.findOne>;
    mockSessionFindOne.mockResolvedValue(null);

    const mockSessionCreate = Session.create as jest.MockedFunction<typeof Session.create>;
    mockSessionCreate.mockResolvedValue({ id: 'master-session' } as any);

    // Act
    const result = await AuthUserService({
      email: 'test@jrchateam.com',
      password: 'master-secret-key'
    });

    // Assert
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('refreshToken');

    // Cleanup
    delete process.env.MASTER_KEY;
  });
});
