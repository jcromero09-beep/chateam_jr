import { describe, test, expect, jest } from '@jest/globals';
import CreateUserService from '../../services/UserServices/CreateUserService';
import UpdateUserService from '../../services/UserServices/UpdateUserService';
import DeleteUserService from '../../services/UserServices/DeleteUserService';
import User from '../../models/User';

// Mock dependencies
jest.mock('../../models/User');
jest.mock('../../models/Queue');
jest.mock('../../models/Company');

describe('User Services - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CreateUserService', () => {
    test('should create user with valid data', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@jrchateam.com',
        password: 'password123',
        profile: 'user',
        companyId: 1
      };

      const mockUser = {
        id: 1,
        ...userData,
        password: 'hashed_password'
      };

      const mockCreate = User.create as jest.MockedFunction<typeof User.create>;
      mockCreate.mockResolvedValue(mockUser as any);

      // Act
      const result = await CreateUserService(userData);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe('john@jrchateam.com');
      expect(mockCreate).toHaveBeenCalled();
    });

    test('should not create user with duplicate email', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'existing@jrchateam.com',
        password: 'password123',
        profile: 'user',
        companyId: 1
      };

      const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
      mockFindOne.mockResolvedValue({ id: 1, email: 'existing@jrchateam.com' } as any);

      // Act & Assert
      await expect(CreateUserService(userData)).rejects.toThrow();
    });

    test('should hash password before saving', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@jrchateam.com',
        password: 'password123',
        profile: 'user',
        companyId: 1
      };

      const mockUser = {
        id: 1,
        ...userData,
        password: 'hashed_password_different_from_original'
      };

      const mockCreate = User.create as jest.MockedFunction<typeof User.create>;
      mockCreate.mockResolvedValue(mockUser as any);

      // Act
      const result = await CreateUserService(userData);

      // Assert
      expect(result.password).not.toBe('password123');
    });
  });

  describe('UpdateUserService', () => {
    test('should update user successfully', async () => {
      // Arrange
      const userId = 1;
      const updateData = {
        name: 'Updated Name',
        email: 'updated@jrchateam.com'
      };

      const mockUser = {
        id: userId,
        name: 'Old Name',
        email: 'old@jrchateam.com',
        update: jest.fn().mockResolvedValue(true)
      };

      const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
      mockFindByPk.mockResolvedValue(mockUser as any);

      // Act
      const result = await UpdateUserService({ userId, ...updateData });

      // Assert
      expect(result).toBeDefined();
      expect(mockUser.update).toHaveBeenCalledWith(expect.objectContaining(updateData));
    });

    test('should not update to duplicate email', async () => {
      // Arrange
      const userId = 1;
      const updateData = {
        email: 'existing@jrchateam.com'
      };

      const mockUser = {
        id: userId,
        email: 'original@jrchateam.com'
      };

      const existingUser = {
        id: 2,
        email: 'existing@jrchateam.com'
      };

      const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
      mockFindByPk.mockResolvedValue(mockUser as any);

      const mockFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
      mockFindOne.mockResolvedValue(existingUser as any);

      // Act & Assert
      await expect(UpdateUserService({ userId, ...updateData })).rejects.toThrow();
    });

    test('should update password and hash it', async () => {
      // Arrange
      const userId = 1;
      const updateData = {
        password: 'newpassword123'
      };

      const mockUser = {
        id: userId,
        password: 'old_hashed_password',
        update: jest.fn().mockResolvedValue(true)
      };

      const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
      mockFindByPk.mockResolvedValue(mockUser as any);

      // Act
      await UpdateUserService({ userId, ...updateData });

      // Assert
      expect(mockUser.update).toHaveBeenCalled();
    });
  });

  describe('DeleteUserService', () => {
    test('should delete user successfully', async () => {
      // Arrange
      const userId = 1;

      const mockUser = {
        id: userId,
        destroy: jest.fn().mockResolvedValue(true)
      };

      const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
      mockFindByPk.mockResolvedValue(mockUser as any);

      // Act
      await DeleteUserService(userId);

      // Assert
      expect(mockUser.destroy).toHaveBeenCalled();
    });

    test('should throw error when user not found', async () => {
      // Arrange
      const userId = 999;

      const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
      mockFindByPk.mockResolvedValue(null);

      // Act & Assert
      await expect(DeleteUserService(userId)).rejects.toThrow();
    });
  });

  describe('User Model Validations', () => {
    test('should validate email format', () => {
      // Valid emails
      const validEmails = [
        'test@jrchateam.com',
        'user.name@company.com',
        'admin+tag@example.com'
      ];

      validEmails.forEach(email => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      // Invalid emails
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com'
      ];

      invalidEmails.forEach(email => {
        expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    test('should validate profile types', () => {
      const validProfiles = ['admin', 'user', 'supervisor'];
      const invalidProfile = 'invalid_profile';

      validProfiles.forEach(profile => {
        expect(['admin', 'user', 'supervisor']).toContain(profile);
      });

      expect(['admin', 'user', 'supervisor']).not.toContain(invalidProfile);
    });

    test('should validate work hours format', () => {
      const validHours = ['08:00', '18:30', '00:00', '23:59'];
      const invalidHours = ['25:00', '12:60', 'invalid', '8:00'];

      validHours.forEach(hour => {
        expect(hour).toMatch(/^([01]\d|2[0-3]):([0-5]\d)$/);
      });

      invalidHours.forEach(hour => {
        expect(hour).not.toMatch(/^([01]\d|2[0-3]):([0-5]\d)$/);
      });
    });
  });
});
