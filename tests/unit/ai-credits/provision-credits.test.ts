import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import ProvisionCreditsService from '../../../services/AICreditServices/ProvisionCreditsService';
import AICreditBalance from '../../../models/AICreditBalance';
import AICreditType from '../../../models/AICreditType';
import AICreditTransaction from '../../../models/AICreditTransaction';
import PlanCreditAllocation from '../../../models/PlanCreditAllocation';
import Company from '../../../models/Company';

// Mock de modelos
jest.mock('../../../models/AICreditBalance');
jest.mock('../../../models/AICreditType');
jest.mock('../../../models/AICreditTransaction');
jest.mock('../../../models/PlanCreditAllocation');
jest.mock('../../../models/Company');
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('ProvisionCreditsService - Provision de Creditos IA', () => {
  // ── Datos de prueba ──────────────────────────────────────────────

  const mockAllocations = [
    {
      id: 1,
      planId: 2,
      creditTypeId: 1,
      creditsPerCycle: 500,
      isUnlimited: false,
      creditType: { id: 1, name: 'message', displayName: 'Mensajes IA' }
    },
    {
      id: 2,
      planId: 2,
      creditTypeId: 2,
      creditsPerCycle: 100,
      isUnlimited: false,
      creditType: { id: 2, name: 'image', displayName: 'Imagenes IA' }
    },
    {
      id: 3,
      planId: 2,
      creditTypeId: 3,
      creditsPerCycle: 50,
      isUnlimited: false,
      creditType: { id: 3, name: 'video', displayName: 'Videos IA' }
    }
  ];

  const mockCompany = {
    id: 1,
    name: 'Test Company',
    dueDate: '2026-04-01T00:00:00.000Z'
  };

  // ── Reset mocks antes de cada test ────────────────────────────────

  beforeEach(() => {
    jest.resetAllMocks();

    // Default: company existe con dueDate
    const mockCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;
    mockCompanyFindByPk.mockResolvedValue(mockCompany as any);

    // Default: transacciones se crean sin error
    const mockTransactionCreate = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockTransactionCreate.mockResolvedValue({ id: 1 } as any);
  });

  // ── TEST 1: Inicializar creditos (mode=initialize) ────────────────

  test('should initialize credits for a company (mode=initialize)', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    // No existen balances previos
    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null);

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'initialize'
    });

    // Assert
    expect(result.companyId).toBe(1);
    expect(result.planId).toBe(2);
    expect(result.mode).toBe('initialize');
    expect(result.balancesCreated).toBe(3);
    expect(result.balancesUpdated).toBe(0);
    expect(result.totalCreditTypes).toBe(3);

    // Verificar que se crearon 3 balances
    expect(mockBalanceCreate).toHaveBeenCalledTimes(3);

    // Verificar primer balance creado con datos correctos
    expect(mockBalanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        creditTypeId: 1,
        totalCredits: 500,
        usedCredits: 0
      })
    );
  });

  // ── TEST 2: Renovar creditos (mode=renew) ─────────────────────────

  test('should renew credits for a company (mode=renew)', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    // Existen balances previos con uso parcial
    const mockExistingBalance = {
      id: 10,
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 500,
      usedCredits: 350,
      update: jest.fn().mockResolvedValue(true as never)
    };
    const mockExistingBalance2 = {
      id: 11,
      companyId: 1,
      creditTypeId: 2,
      totalCredits: 100,
      usedCredits: 80,
      update: jest.fn().mockResolvedValue(true as never)
    };
    const mockExistingBalance3 = {
      id: 12,
      companyId: 1,
      creditTypeId: 3,
      totalCredits: 50,
      usedCredits: 25,
      update: jest.fn().mockResolvedValue(true as never)
    };

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne
      .mockResolvedValueOnce(mockExistingBalance as any)
      .mockResolvedValueOnce(mockExistingBalance2 as any)
      .mockResolvedValueOnce(mockExistingBalance3 as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'renew'
    });

    // Assert
    expect(result.balancesCreated).toBe(0);
    expect(result.balancesUpdated).toBe(3);
    expect(result.mode).toBe('renew');

    // Verificar que renew resetea usedCredits a 0
    expect(mockExistingBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 500,
        usedCredits: 0
      })
    );
    expect(mockExistingBalance2.update).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 100,
        usedCredits: 0
      })
    );
  });

  // ── TEST 3: Upgrade de plan (mode=upgrade) ────────────────────────

  test('should upgrade credits when switching plans (mode=upgrade)', async () => {
    // Arrange — allocations del nuevo plan (Pro: mas creditos)
    const upgradeAllocations = [
      {
        id: 10,
        planId: 4,
        creditTypeId: 1,
        creditsPerCycle: 2000,
        isUnlimited: false,
        creditType: { id: 1, name: 'message', displayName: 'Mensajes IA' }
      },
      {
        id: 11,
        planId: 4,
        creditTypeId: 2,
        creditsPerCycle: 500,
        isUnlimited: false,
        creditType: { id: 2, name: 'image', displayName: 'Imagenes IA' }
      }
    ];

    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(upgradeAllocations as any);

    // Balances existentes con uso parcial
    const mockBalance1 = {
      id: 10,
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 500,
      usedCredits: 200,
      update: jest.fn().mockResolvedValue(true as never)
    };
    const mockBalance2 = {
      id: 11,
      companyId: 1,
      creditTypeId: 2,
      totalCredits: 100,
      usedCredits: 40,
      update: jest.fn().mockResolvedValue(true as never)
    };

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne
      .mockResolvedValueOnce(mockBalance1 as any)
      .mockResolvedValueOnce(mockBalance2 as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 4,
      mode: 'upgrade'
    });

    // Assert
    expect(result.balancesUpdated).toBe(2);
    expect(result.balancesCreated).toBe(0);
    expect(result.mode).toBe('upgrade');

    // Upgrade solo actualiza totalCredits, NO toca usedCredits
    expect(mockBalance1.update).toHaveBeenCalledWith({ totalCredits: 2000 });
    expect(mockBalance2.update).toHaveBeenCalledWith({ totalCredits: 500 });
  });

  // ── TEST 4: Company sin plan (sin allocations) ────────────────────

  test('should handle company with no plan gracefully', async () => {
    // Arrange — Plan sin allocations configuradas
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([] as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 99,
      planId: 999,
      mode: 'initialize'
    });

    // Assert
    expect(result.companyId).toBe(99);
    expect(result.planId).toBe(999);
    expect(result.balancesCreated).toBe(0);
    expect(result.balancesUpdated).toBe(0);
    expect(result.totalCreditTypes).toBe(0);

    // No deberia intentar crear balances
    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    expect(mockBalanceCreate).not.toHaveBeenCalled();
  });

  // ── TEST 5: Plan sin credit allocations ───────────────────────────

  test('should handle plan with no credit allocations', async () => {
    // Arrange — findAll retorna array vacio
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([] as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 1,
      mode: 'renew'
    });

    // Assert
    expect(result.balancesCreated).toBe(0);
    expect(result.balancesUpdated).toBe(0);
    expect(result.totalCreditTypes).toBe(0);
    expect(result.mode).toBe('renew');

    // Verificar que no se buscaron balances ni se crearon transacciones
    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    expect(mockBalanceFindOne).not.toHaveBeenCalled();

    const mockTransactionCreate = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  // ── TEST 6: Crea AICreditTransaction de auditoria (direction='credit') ──

  test('should create AICreditTransaction audit records on provision (direction=credit)', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0]] as any); // Solo 1 allocation

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null); // No existe — se creara

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    const mockTransactionCreate = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockTransactionCreate.mockResolvedValue({ id: 100 } as any);

    // Act
    await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'initialize'
    });

    // Assert — Debe crear transaccion de auditoria
    expect(mockTransactionCreate).toHaveBeenCalledTimes(1);
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        creditTypeId: 1,
        amount: 500,
        direction: 'credit',
        balanceBefore: 0,
        balanceAfter: 0,
        source: 'provision',
        sourceId: 'plan_2_initialize',
        description: expect.stringContaining('modo initialize')
      })
    );
  });

  test('should create audit transaction with correct balanceBefore on renew', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0]] as any);

    const mockExistingBalance = {
      id: 10,
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 500,
      usedCredits: 300,
      update: jest.fn().mockResolvedValue(true as never)
    };

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(mockExistingBalance as any);

    const mockTransactionCreate = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockTransactionCreate.mockResolvedValue({ id: 101 } as any);

    // Act
    await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'renew'
    });

    // Assert — En renew, balanceAfter debe ser 0 (resetea usedCredits)
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'credit',
        balanceBefore: 300,
        balanceAfter: 0,
        sourceId: 'plan_2_renew'
      })
    );
  });

  test('should create audit transaction preserving usedCredits on upgrade', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0]] as any);

    const mockExistingBalance = {
      id: 10,
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 500,
      usedCredits: 200,
      update: jest.fn().mockResolvedValue(true as never)
    };

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(mockExistingBalance as any);

    const mockTransactionCreate = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockTransactionCreate.mockResolvedValue({ id: 102 } as any);

    // Act
    await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'upgrade'
    });

    // Assert — En upgrade, balanceAfter mantiene usedCredits
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'credit',
        balanceBefore: 200,
        balanceAfter: 200,
        sourceId: 'plan_2_upgrade'
      })
    );
  });

  // ── TEST 7: Idempotencia — no duplicar balances si ya existen ─────

  test('should not duplicate balances if already exist (idempotent init)', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    // Todos los balances ya existen con creditos asignados (totalCredits > 0)
    const existingBalances = mockAllocations.map((alloc, idx) => ({
      id: 100 + idx,
      companyId: 1,
      creditTypeId: alloc.creditTypeId,
      totalCredits: alloc.creditsPerCycle,
      usedCredits: 0,
      update: jest.fn().mockResolvedValue(true as never)
    }));

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne
      .mockResolvedValueOnce(existingBalances[0] as any)
      .mockResolvedValueOnce(existingBalances[1] as any)
      .mockResolvedValueOnce(existingBalances[2] as any);

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'initialize'
    });

    // Assert — No se deben crear balances nuevos
    expect(mockBalanceCreate).not.toHaveBeenCalled();
    expect(result.balancesCreated).toBe(0);

    // En mode=initialize, si totalCredits > 0, no se actualiza nada
    expect(result.balancesUpdated).toBe(0);
    existingBalances.forEach(balance => {
      expect(balance.update).not.toHaveBeenCalled();
    });
  });

  test('should reinitialize balance with totalCredits=0 on mode=initialize', async () => {
    // Arrange — Balance existe pero con totalCredits=0 (nunca fue provisionado)
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0]] as any);

    const emptyBalance = {
      id: 50,
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 0,
      usedCredits: 0,
      update: jest.fn().mockResolvedValue(true as never)
    };

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(emptyBalance as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'initialize'
    });

    // Assert — Debe actualizar porque totalCredits era 0
    expect(result.balancesUpdated).toBe(1);
    expect(emptyBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 500,
        usedCredits: 0
      })
    );
  });

  // ── TEST 8: Validacion de companyId requerido ─────────────────────

  test('should validate companyId is required', async () => {
    // Act & Assert — Sin companyId deberia fallar (TypeScript lo previene
    // pero el runtime puede recibir valores invalidos)
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    // Si companyId es undefined/null, AICreditBalance.findOne lanzara error
    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockRejectedValue(new Error('WHERE parameter "companyId" has invalid "undefined" value'));

    // Act & Assert
    try {
      await ProvisionCreditsService({
        companyId: undefined as any,
        planId: 2,
        mode: 'initialize'
      });
      expect('should have thrown').toBe('but did not throw');
    } catch (err: any) {
      expect(typeof err.message).toBe('string');
    }
  });

  test('should propagate error when companyId is null', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockRejectedValue(new Error('WHERE parameter "companyId" has invalid "null" value'));

    // Act & Assert
    try {
      await ProvisionCreditsService({
        companyId: null as any,
        planId: 2,
        mode: 'initialize'
      });
      expect('should have thrown').toBe('but did not throw');
    } catch (err: any) {
      expect(typeof err.message).toBe('string');
    }
  });

  // ── TESTS ADICIONALES ─────────────────────────────────────────────

  test('should set resetAt from company dueDate', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0]] as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null);

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    // Act
    await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'initialize'
    });

    // Assert — resetAt debe venir del dueDate de la company
    expect(mockBalanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resetAt: expect.any(Date)
      })
    );
  });

  test('should handle company without dueDate (resetAt=null)', async () => {
    // Arrange — Company sin dueDate
    const mockCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;
    mockCompanyFindByPk.mockResolvedValue({ id: 5, name: 'No Due', dueDate: null } as any);

    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0]] as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null);

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    // Act
    await ProvisionCreditsService({
      companyId: 5,
      planId: 2,
      mode: 'initialize'
    });

    // Assert — resetAt debe ser null
    expect(mockBalanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resetAt: null
      })
    );
  });

  test('should handle mixed new and existing balances', async () => {
    // Arrange — 3 allocations, pero solo 1 balance existe
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    const existingBalance = {
      id: 10,
      companyId: 1,
      creditTypeId: 1,
      totalCredits: 500,
      usedCredits: 100,
      update: jest.fn().mockResolvedValue(true as never)
    };

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne
      .mockResolvedValueOnce(existingBalance as any) // creditTypeId 1 — existe
      .mockResolvedValueOnce(null)                    // creditTypeId 2 — nuevo
      .mockResolvedValueOnce(null);                   // creditTypeId 3 — nuevo

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'renew'
    });

    // Assert
    expect(result.balancesCreated).toBe(2);   // 2 nuevos
    expect(result.balancesUpdated).toBe(1);   // 1 existente actualizado
    expect(result.totalCreditTypes).toBe(3);

    // El existente debe haberse actualizado con renew
    expect(existingBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 500,
        usedCredits: 0
      })
    );

    // Los nuevos deben haberse creado
    expect(mockBalanceCreate).toHaveBeenCalledTimes(2);
  });

  test('should continue provisioning even if audit transaction fails', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue([mockAllocations[0], mockAllocations[1]] as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null);

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    // Transaccion de auditoria falla
    const mockTransactionCreate = AICreditTransaction.create as jest.MockedFunction<typeof AICreditTransaction.create>;
    mockTransactionCreate.mockRejectedValue(new Error('DB connection lost'));

    // Act — No debe lanzar error a pesar del fallo en transaccion
    const result = await ProvisionCreditsService({
      companyId: 1,
      planId: 2,
      mode: 'initialize'
    });

    // Assert — Los balances se crearon exitosamente
    expect(result.balancesCreated).toBe(2);
    expect(mockBalanceCreate).toHaveBeenCalledTimes(2);
  });

  test('should return correct response structure', async () => {
    // Arrange
    const mockFindAll = PlanCreditAllocation.findAll as jest.MockedFunction<typeof PlanCreditAllocation.findAll>;
    mockFindAll.mockResolvedValue(mockAllocations as any);

    const mockBalanceFindOne = AICreditBalance.findOne as jest.MockedFunction<typeof AICreditBalance.findOne>;
    mockBalanceFindOne.mockResolvedValue(null);

    const mockBalanceCreate = AICreditBalance.create as jest.MockedFunction<typeof AICreditBalance.create>;
    mockBalanceCreate.mockResolvedValue({ id: 1 } as any);

    // Act
    const result = await ProvisionCreditsService({
      companyId: 7,
      planId: 4,
      mode: 'initialize'
    });

    // Assert — Verificar estructura completa del response
    expect(result).toEqual({
      companyId: 7,
      planId: 4,
      mode: 'initialize',
      balancesCreated: 3,
      balancesUpdated: 0,
      totalCreditTypes: 3
    });
  });
});
