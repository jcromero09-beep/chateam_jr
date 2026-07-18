import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

// procesarPdf.ts
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
const pdf = (pdfParse as any).default || pdfParse;
import OpenAI from 'openai';
import chroma from '../../libs/chromadb';
import { getApiKeyWithFallback } from '../AIProviderService';

const pdfPath = path.resolve(currentDir, "smartrack.pdf");

async function procesarPdf() {
  const apiKey = await getApiKeyWithFallback('openai', 'OPENAI_API_KEY');
  const openai = new OpenAI({ apiKey });
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);
  const texto = pdfData.text;

  const chunks = dividirEnChunks(texto, 500); // 500 caracteres por chunk aprox.

  const collection = await chroma.getOrCreateCollection({ name: "pdf_data" });

  for (const [index, chunk] of chunks.entries()) {
    const embeddingResp = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: chunk,
    });

    await collection.add({
      ids: [`productos_chunk_${index}`],
      embeddings: [embeddingResp.data[0].embedding],
      documents: [chunk],
      metadatas: [{ fuente: "productos.pdf" }]
    });
  }

  console.log("✅ PDF insertado correctamente en ChromaDB.");
}

function dividirEnChunks(texto: string, size: number) {
  const chunks = [];
  for (let i = 0; i < texto.length; i += size) {
    chunks.push(texto.slice(i, i + size));
  }
  return chunks;
}

procesarPdf();
