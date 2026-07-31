import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import * as fsp from 'fs/promises';
import path from "path";
import * as fs from "fs";
// const filePath = 'caminho/do/seu/arquivo.txt';

export async function addLogs({fileName, text, forceNewFile=false}) {
// [Portabilidad 2026-07-30] Sobraba un `..`.
//
// Este fichero está a UN nivel de la raíz del repo, así que `../..` no apunta al
// repo: apunta a su PADRE. Es un resto de cuando el código vivía bajo `src/`
// (desde `src/config/`, `../..` sí era la raíz). Al aplanar `src/` la ruta se
// quedó saliéndose.
//
// No se notaba porque el padre era /home/jcromero09, escribible: la app creaba y
// usaba /home/jcromero09/{private,certs,logs} sin que nadie lo viera. Se destapó
// al montar el checkout de producción en /opt/chateam, donde el padre es /opt y
// el arranque muere con EACCES: mkdir '/opt/private'.
        const logs = path.resolve(currentDir, "..", "logs");  
        const filePath  = path.resolve(logs,fileName)


    try {

        console.log(logs)
        if (!fs.existsSync(logs)) {
          fs.mkdirSync(logs);
        }
    } catch (error) {

    }

  try {
    if(forceNewFile){
      await fsp.writeFile(filePath,  `${text} \n`);
      console.log(`Novo Arquivo de log adicionado ${filePath}\n \n ${text}`);

    }else

    await fsp.appendFile(filePath, `${text} \n` );
    console.log(`Texto adicionado ao arquivo de log ${filePath}\n \n ${text}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // O arquivo não existe, então cria e adiciona o texto
      await fsp.writeFile(filePath,  `${text} \n`);
      console.log(`Novo Arquivo de log adicionado ${filePath}\n \n ${text}`);
    } else {
      console.error('Erro ao manipular o arquivo de log:', err);
    }
  }
}