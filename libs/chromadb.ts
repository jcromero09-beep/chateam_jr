import { ChromaClient } from 'chromadb';
import path from 'path';

// Apuntar correctamente a la carpeta "public/datos_chroma" desde el archivo actual
const chroma = new ChromaClient({
  path: path.resolve(__dirname, "../../../public/datos_chroma")
});

export default chroma;
