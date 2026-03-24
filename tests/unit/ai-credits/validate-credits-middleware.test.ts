import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import validateAICredits from '../../../middleware/validateAICredits';
import AICreditBalance from '../../../models/AICreditBalance';
import AICreditType from '../../../models/AICreditType';
import User from '../../../models/User';

// Mock de modelos
jest.mock('../../../models/AICreditBalance');
jest.mock('../../../models/AICreditType');
jest.mock('../../../models/User');

describe('validateAICredits Middleware — Validacion de creditos IA', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    mockReq = {
      user: { companyId: 1, id: 10 }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  test('should call next() when credits are sufficient', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: false } as any);

    const mockCreditTypeFindOne = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockCreditTypeFindOne.mockResolvedValue({ id: 1, key: 'message', isActive: true } as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue({
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 500,
      usedCredits: 100
    } as any);

    // Act
    const middleware = validateAICredits('message', 1);
    await middleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  test('should return 402 when credits are insufficient', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: false } as any);

    const mockCreditTypeFindOne = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockCreditTypeFindOne.mockResolvedValue({ id: 1, key: 'message', isActive: true } as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue({
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 100,
      usedCredits: 99
    } as any);

    // Act — solicitar 5 creditos, solo hay 1 disponible
    const middleware = validateAICredits('message', 5);
    await middleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('insuficientes')
      })
    );
  });

  test('should call next() when no balance exists for credit type (not initialized)', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: false } as any);

    const mockCreditTypeFindOne = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockCreditTypeFindOne.mockResolvedValue({ id: 3, key: 'image', isActive: true } as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null);

    // Act
    const middleware = validateAICredits('image', 1);
    await middleware(mockReq, mockRes, mockNext);

    // Assert — sin balance inicializado, deja pasar (next sin bloquear)
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('should call next() when credit type not found (feature not configured)', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: false } as any);

    const mockCreditTypeFindOne = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockCreditTypeFindOne.mockResolvedValue(null);

    // Act
    const middleware = validateAICredits('nonexistent_type', 1);
    await middleware(mockReq, mockRes, mockNext);

    // Assert — tipo de credito no existe, deja pasar
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
    // No debe consultar balances si el tipo no existe
    expect(AICreditBalance.findOne).not.toHaveBeenCalled();
  });

  test('should include totalCredits and usedCredits in error response', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: false } as any);

    const mockCreditTypeFindOne = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockCreditTypeFindOne.mockResolvedValue({ id: 2, key: 'audio_minute', isActive: true } as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue({
      companyId: 1,
      creditTypeId: 2,
      totalCredits: 200,
      usedCredits: 195
    } as any);

    // Act — solicitar 10, solo hay 5 disponibles
    const middleware = validateAICredits('audio_minute', 10);
    await middleware(mockReq, mockRes, mockNext);

    // Assert — verificar que la respuesta 402 incluye totalCredits y usedCredits
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          creditType: 'audio_minute',
          required: 10,
          available: 5,
          totalCredits: 200,
          usedCredits: 195
        })
      })
    );
  });

  test('should skip credit validation for super admin users', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: true } as any);

    // Act
    const middleware = validateAICredits('message', 1);
    await middleware(mockReq, mockRes, mockNext);

    // Assert — super admin siempre pasa
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(AICreditType.findOne).not.toHaveBeenCalled();
    expect(AICreditBalance.findOne).not.toHaveBeenCalled();
  });

  test('should call next() on unexpected error (fail-open)', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockRejectedValue(new Error('DB connection lost'));

    // Act
    const middleware = validateAICredits('message', 1);
    await middleware(mockReq, mockRes, mockNext);

    // Assert — en caso de error inesperado, no bloquear
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('should default amount to 1 when not specified', async () => {
    // Arrange
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue({ id: 10, super: false } as any);

    const mockCreditTypeFindOne = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockCreditTypeFindOne.mockResolvedValue({ id: 1, key: 'message', isActive: true } as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue({
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 100,
      usedCredits: 100
    } as any);

    // Act — sin especificar amount (default 1), remaining=0 < 1
    const middleware = validateAICredits('message');
    await middleware(mockReq, mockRes, mockNext);

    // Assert — 0 remaining < 1 default amount → 402
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
