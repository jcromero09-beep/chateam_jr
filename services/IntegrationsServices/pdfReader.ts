// procesarPdf.ts
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
const pdf = (pdfParse as any).default || pdfParse;
import OpenAI from 'openai';
import chroma from '../../libs/chromadb';

const pdfPath = path.resolve(__dirname, "smartrack.pdf");

const openai = new OpenAI({ apiKey: "OPENAI_API_KEY_PURGED_FROM_HISTORY_000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" });
async function procesarPdf() {
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
