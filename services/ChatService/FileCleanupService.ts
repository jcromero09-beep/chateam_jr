import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import fs from "fs";
import path from "path";
import ChatMessage from "../../models/ChatMessage";

const publicFolder = path.resolve(currentDir, "..", "..", "public");

interface CleanupResult {
  filesRemoved: number;
  foldersRemoved: number;
  errors: string[];
}

export const cleanupOrphanedFiles = async (companyId: number, chatId: number): Promise<CleanupResult> => {
  const result: CleanupResult = {
    filesRemoved: 0,
    foldersRemoved: 0,
    errors: []
  };

  try {
    const chatFolder = path.resolve(publicFolder, `company${companyId}`, "chat", chatId.toString());
    
    if (!fs.existsSync(chatFolder)) {
      return result;
    }

    // Obtener todos los mensajes con archivos del chat
    const messagesWithFiles = await ChatMessage.findAll({
      where: {
        chatId: chatId,
        mediaPath: { $ne: null }
      },
      attributes: ['mediaPath']
    });

    const usedFiles = messagesWithFiles.map(msg => {
      const fileName = path.basename(msg.mediaPath);
      return fileName;
    });

    // Obtener todos los archivos en la carpeta del chat
    const filesInFolder = fs.readdirSync(chatFolder);

    // Eliminar archivos huérfanos (que no están referenciados en la base de datos)
    for (const file of filesInFolder) {
      if (!usedFiles.includes(file)) {
        try {
          const filePath = path.join(chatFolder, file);
          fs.unlinkSync(filePath);
          result.filesRemoved++;
        } catch (error) {
          result.errors.push(`Error removing file ${file}: ${error.message}`);
        }
      }
    }

    // Si la carpeta queda vacía, eliminarla
    const remainingFiles = fs.readdirSync(chatFolder);
    if (remainingFiles.length === 0) {
      try {
        fs.rmdirSync(chatFolder);
        result.foldersRemoved++;
      } catch (error) {
        result.errors.push(`Error removing folder: ${error.message}`);
      }
    }

  } catch (error) {
    result.errors.push(`General error: ${error.message}`);
  }

  return result;
};

export const cleanupDeletedChatFiles = async (companyId: number, chatId: number): Promise<CleanupResult> => {
  const result: CleanupResult = {
    filesRemoved: 0,
    foldersRemoved: 0,
    errors: []
  };

  try {
    const chatFolder = path.resolve(publicFolder, `company${companyId}`, "chat", chatId.toString());
    
    if (fs.existsSync(chatFolder)) {
      // Eliminar toda la carpeta del chat y su contenido
      const files = fs.readdirSync(chatFolder);
      
      for (const file of files) {
        try {
          const filePath = path.join(chatFolder, file);
          fs.unlinkSync(filePath);
          result.filesRemoved++;
        } catch (error) {
          result.errors.push(`Error removing file ${file}: ${error.message}`);
        }
      }

      try {
        fs.rmdirSync(chatFolder);
        result.foldersRemoved++;
      } catch (error) {
        result.errors.push(`Error removing folder: ${error.message}`);
      }
    }

  } catch (error) {
    result.errors.push(`General error: ${error.message}`);
  }

  return result;
};
