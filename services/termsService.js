import { openApi } from "./api";
import api from "./api";

// Obtener términos públicos (sin autenticación)
export const getPublicTerms = async (documentType, companyId = 1) => {
  try {
    const response = await openApi.get(`/settings/public-terms/${documentType}`, {
      params: { companyId }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching public terms:', error);
    throw error;
  }
};

// Registrar aceptación de términos (requiere autenticación)
export const acceptTerms = async (acceptanceData) => {
  try {
    const response = await api.post('/settings/accept-terms', acceptanceData);
    return response.data;
  } catch (error) {
    console.error('Error accepting terms:', error);
    throw error;
  }
};

// Verificar si el usuario ha aceptado los términos actuales (requiere autenticación)
export const checkUserTermsStatus = async (documentType) => {
  try {
    const response = await api.get(`/settings/check-terms-status/${documentType}`);
    return response.data;
  } catch (error) {
    console.error('Error checking terms status:', error);
    throw error;
  }
};

// Obtener historial de aceptaciones del usuario (requiere autenticación)
export const getUserAcceptanceHistory = async () => {
  try {
    const response = await api.get('/settings/user-acceptance-history');
    return response.data;
  } catch (error) {
    console.error('Error fetching acceptance history:', error);
    throw error;
  }
};

export default {
  getPublicTerms,
  acceptTerms,
  checkUserTermsStatus,
  getUserAcceptanceHistory
};
