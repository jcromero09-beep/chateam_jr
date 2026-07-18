import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import DeductCreditsService from '../../../services/AICreditServices/DeductCreditsService';
import AICreditBalance from '../../../models/AICreditBalance';
import AICreditType from '../../../models/AICreditType';
import AICreditTransaction from '../../../models/AICreditTransaction';
import User from '../../../models/User';

// Mock de modelos
jest.mock('../../../models/AICreditBalance');
jest.mock('../../../models/AICreditType');
jest.mock('../../../models/AICreditTransaction');
jest.mock('../../../models/User');
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

/**
 * NOTA: AppError NO extiende Error (es una clase plain con message y statusCode).
 * Por ello usamos rejects.toMatchObject() en vez de rejects.toThrow().
 */

describe('DeductCreditsService - Deduccion de Creditos IA', () => {
  // ─── Datos de prueba ───────────────────────────────────────────────
  const mockCreditType = {
    id: 1,
    key: 'message',
    name: 'Mensajes IA',
    isActive: true
  };

  const buildMockBalance = (overrides: Record<string, any> = {}) => ({
    id: 10,
    companyId: 1,
    creditTypeId: 1,
    totalCredits: 1000,
    usedCredits: 200,
    update: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    reload: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides
  });

  // Helper para capturar AppError (no es instancia de Error)
  const expectAppError = async (promise: Promise<any>, message: string, statusCode?: number) => {
    try {
      await promise;
      // Si no lanza, forzar fallo
      expect('should have thrown').toBe('but did not throw');
    } catch (err: any) {
      expect(err.message).toBe(message);
      if (statusCode !== undefined) {
        expect(err.statusCode).toBe(statusCode);
      }
    }
  };

  // ─── Reset mocks antes de cada test ────────────────────────────────
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── 1. Deduccion exitosa para usuario normal ──────────────────────
  test('should deduct credits successfully for normal user', async () => {
    // Arrange
    const mockBalance = buildMockBalance();
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 250;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    const result = await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 50,
      description: 'Envio de mensaje IA'
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.previousUsed).toBe(200);
    expect(result.newUsed).toBe(250);
    expect(result.remaining).toBe(750);
    expect(result.deducted).toBe(50);
    expect(mockBalance.update).toHaveBeenCalledWith({ usedCredits: 250 });
    expect(mockBalance.reload).toHaveBeenCalled();
  });

  // ─── 2. Error por creditos insuficientes ───────────────────────────
  test('should reject with ERR_AI_INSUFFICIENT_CREDITS when not enough credits', async () => {
    // Arrange
    const mockBalance = buildMockBalance({ totalCredits: 100, usedCredits: 90 });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    // Act & Assert
    await expectAppError(
      DeductCreditsService({
        companyId: 1,
        creditTypeKey: 'message',
        amount: 50
      }),
      'ERR_AI_INSUFFICIENT_CREDITS',
      402
    );

    // No deberia haber actualizado el balance
    expect(mockBalance.update).not.toHaveBeenCalled();
  });

  // ─── 3. Error tipo de credito no encontrado ────────────────────────
  test('should reject with ERR_AI_CREDIT_TYPE_NOT_FOUND for invalid type', async () => {
    // Arrange
    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(
      DeductCreditsService({
        companyId: 1,
        creditTypeKey: 'tipo_inexistente',
        amount: 10
      }),
      'ERR_AI_CREDIT_TYPE_NOT_FOUND',
      404
    );
  });

  // ─── 4. Error cuando no existe balance para la company ─────────────
  test('should reject with ERR_AI_NO_CREDIT_BALANCE when no balance exists', async () => {
    // Arrange
    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(
      DeductCreditsService({
        companyId: 999,
        creditTypeKey: 'message',
        amount: 10
      }),
      'ERR_AI_NO_CREDIT_BALANCE',
      402
    );
  });

  // ─── 5. Bypass de creditos para super admin ────────────────────────
  test('should bypass credits for super admin (userId present, user.super = true)', async () => {
    // Arrange
    const mockSuperUser = { id: 1, super: true, name: 'Super Admin' };
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue(mockSuperUser as any);

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockBalance = buildMockBalance({ totalCredits: 999999, usedCredits: 0 });
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 50;
    });

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    const result = await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 50,
      userId: 1,
      description: 'consumo super admin'
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.deducted).toBe(50);
    expect(mockFindByPk).toHaveBeenCalledWith(1);
    expect(mockBalance.update).toHaveBeenCalled();
  });

  // ─── 5b. Super admin bypass cuando NO existe creditType ────────────
  test('should return mock success for super admin when creditType does not exist', async () => {
    // Arrange
    const mockSuperUser = { id: 1, super: true, name: 'Super Admin' };
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue(mockSuperUser as any);

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(null);

    // Act
    const result = await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'tipo_inexistente',
      amount: 10,
      userId: 1
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(999999);
    expect(result.deducted).toBe(10);
  });

  // ─── 5c. Super admin bypass crea balance si no existe ──────────────
  test('should create balance for super admin when no balance exists', async () => {
    // Arrange
    const mockSuperUser = { id: 1, super: true, name: 'Super Admin' };
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue(mockSuperUser as any);

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(null);

    const createdBalance = buildMockBalance({ totalCredits: 999999, usedCredits: 0 });
    createdBalance.reload.mockImplementation(async () => {
      createdBalance.usedCredits = 25;
    });

    const mockCreateBalance = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockCreateBalance.mockResolvedValue(createdBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    const result = await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 25,
      userId: 1
    });

    // Assert
    expect(result.success).toBe(true);
    expect(mockCreateBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        creditTypeId: 1,
        totalCredits: 999999,
        usedCredits: 0
      })
    );
  });

  // ─── 6. Validacion de campos requeridos (Yup) ─────────────────────
  test('should reject when companyId is undefined', async () => {
    try {
      await DeductCreditsService({
        companyId: undefined as any,
        creditTypeKey: 'message',
        amount: 10
      });
      expect('should have thrown').toBe('but did not throw');
    } catch (err: any) {
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  test('should reject when creditTypeKey is empty', async () => {
    try {
      await DeductCreditsService({
        companyId: 1,
        creditTypeKey: '',
        amount: 10
      });
      expect('should have thrown').toBe('but did not throw');
    } catch (err: any) {
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  test('should reject when amount is negative', async () => {
    await expectAppError(
      DeductCreditsService({
        companyId: 1,
        creditTypeKey: 'message',
        amount: -5
      }),
      'La cantidad debe ser positiva'
    );
  });

  // ─── 7. Creacion de registro de auditoria AICreditTransaction ──────
  test('should create AICreditTransaction audit record on successful deduction', async () => {
    // Arrange
    const mockBalance = buildMockBalance();
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 230;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act — SIN userId para probar el path normal (no super admin)
    await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 30,
      description: 'Test audit record',
      source: 'test',
      sourceId: 'test-123'
    });

    // Assert
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        creditTypeId: 1,
        amount: 30,
        direction: 'debit',
        balanceBefore: 200,
        balanceAfter: 230,
        description: 'Test audit record',
        source: 'test',
        sourceId: 'test-123'
      })
    );
  });

  // ─── 7b. Error en auditoria no bloquea deduccion ──────────────────
  test('should not fail deduction if AICreditTransaction.create throws', async () => {
    // Arrange
    const mockBalance = buildMockBalance();
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 210;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockRejectedValue(new Error('DB connection lost'));

    // Act
    const result = await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 10
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.deducted).toBe(10);
  });

  // ─── 8. Source y sourceId en la transaccion ───────────────────────
  test('should pass source and sourceId to transaction', async () => {
    // Arrange
    const mockBalance = buildMockBalance();
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 220;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 20,
      source: 'image_gen',
      sourceId: 'img-abc-123'
    });

    // Assert
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'image_gen',
        sourceId: 'img-abc-123'
      })
    );
  });

  // ─── 8b. Source defaults to description ────────────────────────────
  test('should default source to description when source is not provided', async () => {
    // Arrange
    const mockBalance = buildMockBalance();
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 215;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 15,
      description: 'consulta RAG'
    });

    // Assert
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'consulta RAG'
      })
    );
  });

  // ─── 8c. Source defaults a "consumo" ──────────────────────────────
  test('should default source to "consumo" when neither source nor description provided', async () => {
    // Arrange
    const mockBalance = buildMockBalance();
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 205;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 5
    });

    // Assert
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'consumo'
      })
    );
  });

  // ─── Caso borde: usuario normal con userId NO bypasea ─────────────
  test('should NOT bypass credits for normal user even with userId', async () => {
    // Arrange — usuario normal (super = false)
    const mockNormalUser = { id: 2, super: false, name: 'Normal User' };
    const mockFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
    mockFindByPk.mockResolvedValue(mockNormalUser as any);

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    // Balance con solo 5 creditos restantes
    const mockBalance = buildMockBalance({ totalCredits: 100, usedCredits: 95 });
    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    // Act & Assert
    await expectAppError(
      DeductCreditsService({
        companyId: 1,
        creditTypeKey: 'message',
        amount: 10,
        userId: 2
      }),
      'ERR_AI_INSUFFICIENT_CREDITS',
      402
    );

    expect(mockBalance.update).not.toHaveBeenCalled();
  });

  // ─── Caso borde: creditos exactos restantes ────────────────────────
  test('should succeed when amount equals exactly remaining credits', async () => {
    // Arrange
    const mockBalance = buildMockBalance({ totalCredits: 100, usedCredits: 50 });
    mockBalance.reload.mockImplementation(async () => {
      mockBalance.usedCredits = 100;
    });

    const mockFindOneCreditType = AICreditType.findOne as jest.MockedFunction<typeof AICreditType.findOne>;
    mockFindOneCreditType.mockResolvedValue(mockCreditType as any);

    const mockFindOneBalance = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockFindOneBalance.mockResolvedValue(mockBalance as any);

    const mockCreateTransaction = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockCreateTransaction.mockResolvedValue({} as any);

    // Act
    const result = await DeductCreditsService({
      companyId: 1,
      creditTypeKey: 'message',
      amount: 50
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.deducted).toBe(50);
  });
});
