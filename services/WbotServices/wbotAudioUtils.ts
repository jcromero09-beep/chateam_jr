/**
 * wbotAudioUtils.ts — [Refactor Ola 1] Utilidades de audio/TTS extraídas de
 * wbotMessageListener (god-object 6.764 L). Funciones autocontenidas: solo
 * dependen de fluent-ffmpeg y el Speech SDK de Microsoft, sin estado del módulo
 * original. Sin cambio de comportamiento (movimiento puro).
 */
import ffmpeg from "fluent-ffmpeg";
import {
  SpeechConfig,
  SpeechSynthesizer,
  AudioConfig
} from "microsoft-cognitiveservices-speech-sdk";

export const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

const convertWavToAnotherFormat = (
  inputPath: string,
  outputPath: string,
  toFormat: string
) => {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .toFormat(toFormat)
      .on("end", () => resolve(outputPath))
      .on("error", (err: { message: any }) =>
        reject(new Error(`Error converting file: ${err.message}`))
      )
      .save(outputPath);
  });
};

export const convertTextToSpeechAndSaveToFile = (
  text: string,
  filename: string,
  subscriptionKey: string,
  serviceRegion: string,
  voice: string = "pt-BR-FabioNeural",
  audioToFormat: string = "mp3"
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Validar que subscriptionKey y serviceRegion existan
    if (!subscriptionKey || !serviceRegion) {
      console.warn("⚠️ Microsoft Speech SDK: subscriptionKey o serviceRegion no configurados, omitiendo text-to-speech");
      resolve(); // Resolver sin error para no interrumpir el flujo
      return;
    }
    const speechConfig = SpeechConfig.fromSubscription(
      subscriptionKey,
      serviceRegion
    );
    speechConfig.speechSynthesisVoiceName = voice;
    const audioConfig = AudioConfig.fromAudioFileOutput(`${filename}.wav`);
    const synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);
    synthesizer.speakTextAsync(
      text,
      result => {
        if (result) {
          convertWavToAnotherFormat(
            `${filename}.wav`,
            `${filename}.${audioToFormat}`,
            audioToFormat
          )
            .then(() => {
              resolve();
            })
            .catch(error => {
              reject(error);
            });
        } else {
          reject(new Error("No result from synthesizer"));
        }
        synthesizer.close();
      },
      error => {
        synthesizer.close();
        reject(error);
      }
    );
  });
};

export const keepOnlySpecifiedChars = (str: string) => {
  return str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚâêîôûÂÊÎÔÛãõÃÕçÇ!?.,;:\s]/g, "");
};
