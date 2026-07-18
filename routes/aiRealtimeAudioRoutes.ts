import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIRealtimeAudioController from "../controllers/AIRealtimeAudioController";

const routes = express.Router();

// Audio processing
routes.post("/ai/audio/process", isAuth, AIRealtimeAudioController.processAudio);
routes.post("/ai/audio/transcribe", isAuth, AIRealtimeAudioController.processAudio); // Alias para frontend
routes.post("/ai/audio/tts", isAuth, AIRealtimeAudioController.textToSpeech);

// Voice catalog
routes.get("/ai/audio/voices", isAuth, AIRealtimeAudioController.listVoices);

// Service status
routes.get("/ai/audio/status", isAuth, AIRealtimeAudioController.getStatus);

export default routes;
