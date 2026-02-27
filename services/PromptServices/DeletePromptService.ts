import ShowPromptService from "./ShowPromptService";
import path from "path";
import fs from "fs";
import AppError from "../../errors/AppError";
// const DeletePromptService = async (promptId: number | string, companyId: number | string): Promise<void> => {
//   const prompt = await ShowPromptService({ promptId, companyId });

//   await prompt.destroy();
// };

// export default DeletePromptService;



const DeletePromptService = async (promptId: number | string, companyId: number | string): Promise<void> => {
  const prompt = await ShowPromptService({ promptId, companyId });

  const fileNameIA = prompt.getDataValue("fileNameIA"); // propiedad interna si existe

  // 🔐 Si existe un archivo asociado al prompt
  if (fileNameIA) {
    const nombreArchivo = path.basename(fileNameIA); // ej: cedula.pdf
    const ext = path.extname(nombreArchivo);         // .pdf
    const baseName = path.basename(nombreArchivo, ext); // cedula

    const filePath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      `file${companyId}`,
      nombreArchivo
    );

    const embeddingPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      "Embeddings",
      `${baseName}.json`
    );

    // 🗑️ Eliminar archivo original
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🧹 Archivo eliminado: ${filePath}`);
      } catch (err) {
        console.error(`❌ Error al eliminar archivo: ${filePath}`, err);
      }
    }

    // 🗑️ Eliminar archivo de embeddings
    if (fs.existsSync(embeddingPath)) {
      try {
        fs.unlinkSync(embeddingPath);
        console.log(`🧹 Embedding eliminado: ${embeddingPath}`);
      } catch (err) {
        console.error(`❌ Error al eliminar embedding: ${embeddingPath}`, err);
      }
    }
  }

  // 🚮 Eliminar el prompt de la base de datos
  await prompt.destroy();
  console.log(`✅ Prompt ${promptId} eliminado correctamente.`);
};

export default DeletePromptService;

