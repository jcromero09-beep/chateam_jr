// laravelApi.js
import axios from 'axios';

const apiLaravel = axios.create({
  baseURL: 'https://globaltrackgps.com/api', // Cambia la URL base
  headers: {
    'Content-Type': 'application/json', // Asegúrate de que el Content-Type sea application/json
    'X-API-KEY': '008ba53efdb2a6306b43b8c067edd1dc3aa54145572498d8547eac4621abf467', // Usa la clave API proporcionada
    'Accept': 'application/json'
  }
});



export const getProductoInfo = async (tenantId, table, categoryId) => {
  try {
    const response = await apiLaravel.post('/chateam-endpoint', {
      tenantId: tenantId,
      table: table,
      categoryId: categoryId
    });
    return response.data;
  } catch (error) {
    console.error("Error obteniendo producto", error.message);
    return null;
  }
};

export const obtenerEstadisticas = async () => {
  try {
    const { data } = await apiLaravel.get('/estadisticas');
    return data;
  } catch (error) {
    console.error("Error obteniendo estadísticas", error.message);
    return null;
  }
};
