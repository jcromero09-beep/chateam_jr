import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import { ChromaClient } from 'chromadb';
import path from 'path';

// Apuntar correctamente a la carpeta "public/datos_chroma" desde el archivo actual
const chroma = new ChromaClient({
  path: path.resolve(currentDir, "../../../public/datos_chroma")
});

export default chroma;
