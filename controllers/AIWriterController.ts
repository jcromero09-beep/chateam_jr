import { Request, Response } from "express";
import AIWriterService from "../services/AIWriterServices/AIWriterService";
import CampaignWizardService from "../services/AIWriterServices/CampaignWizardService";
import AppError from "../errors/AppError";

// POST /ai/writer/generate
export const generate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { type, topic, tone, language, maxLength, keywords, context, targetAudience, brandVoice } = req.body;
  if (!type || !topic) throw new AppError("ERR_TYPE_AND_TOPIC_REQUIRED", 400);
  const result = await AIWriterService.generate(companyId, { type, topic, tone, language, maxLength, keywords, context, targetAudience, brandVoice }, userId);
  return res.json({ success: true, data: result });
};

// POST /ai/writer/variants
export const variants = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { type, topic, tone, language, variantCount } = req.body;
  if (!type || !topic) throw new AppError("ERR_TYPE_AND_TOPIC_REQUIRED", 400);
  const result = await AIWriterService.generateVariants(companyId, { type, topic, tone, language, variantCount }, userId);
  return res.json({ success: true, data: result });
};

// POST /ai/writer/rewrite
export const rewrite = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { text, instruction, tone, language } = req.body;
  if (!text) throw new AppError("ERR_TEXT_REQUIRED", 400);
  const result = await AIWriterService.rewrite(companyId, text, { instruction, tone, language }, userId);
  return res.json({ success: true, data: result });
};

// POST /ai/campaign-wizard/suggest
export const wizardSuggest = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { objective, targetAudience, channel, language } = req.body;
  if (!objective) throw new AppError("ERR_OBJECTIVE_REQUIRED", 400);
  const suggestions = await CampaignWizardService.suggestMessages(companyId, objective, targetAudience || 'general', channel || 'whatsapp', language);
  return res.json({ success: true, data: suggestions });
};

// POST /ai/campaign-wizard/variants
export const wizardVariants = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { message, channel, count } = req.body;
  if (!message) throw new AppError("ERR_MESSAGE_REQUIRED", 400);
  const result = await CampaignWizardService.generateVariants(companyId, message, channel || 'whatsapp', count);
  return res.json({ success: true, data: result });
};

// POST /ai/campaign-wizard/image-prompt
export const wizardImagePrompt = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { message, objective } = req.body;
  const prompt = await CampaignWizardService.suggestImagePrompt(companyId, message || '', objective || '');
  return res.json({ success: true, data: { imagePrompt: prompt } });
};

// POST /ai/campaign-wizard/analyze
export const wizardAnalyze = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { campaignData } = req.body;
  if (!campaignData) throw new AppError("ERR_CAMPAIGN_DATA_REQUIRED", 400);
  const analysis = await CampaignWizardService.analyzeResults(companyId, campaignData);
  return res.json({ success: true, data: analysis });
};
