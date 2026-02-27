import dotenv from 'dotenv';

// Cargar variables de entorno de test
dotenv.config({ path: '.env.test' });

// Configuración global de tests
beforeAll(async () => {
  // Setup global de tests
  console.log('🧪 Configurando tests...');
});

afterAll(async () => {
  // Cleanup global de tests
  console.log('🧪 Limpiando tests...');
});

// Mock de dependencias externas
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test'
        })
      }
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_123' } }
      })
    }
  }));
});

// Mock de base de datos para tests unitarios
jest.mock('../database', () => ({
  sequelize: {
    transaction: jest.fn().mockImplementation((fn) => fn({
      sequelize: {
        query: jest.fn()
      }
    }))
  }
}));