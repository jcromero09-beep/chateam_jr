import AgentProfilePhoto from "../../../models/AgentProfilePhoto";
import UGCVideoAsset from "../../../models/UGCVideoAsset";
import FalClient from "./FalClient";
import {
  FalGeneratedAsset,
  FalImageInput,
  FalProfilePhotoInput,
  FalUGCImageInput
} from "./types";

const DEFAULT_IMAGE_MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
const DEFAULT_EDIT_MODEL = process.env.FAL_IMAGE_EDIT_MODEL || "fal-ai/flux-pro/kontext";
const DEFAULT_THUMBNAIL_MODEL = process.env.FAL_THUMBNAIL_MODEL || DEFAULT_IMAGE_MODEL;
const ESTIMATED_IMAGE_COST_USD = Number(process.env.FAL_IMAGE_ESTIMATED_COST_USD || 0);

function firstImageUrl(images: { url: string }[] | undefined): string {
  const url = images?.[0]?.url;
  if (!url) {
    throw new Error("FAL_IMAGE_EMPTY_OUTPUT");
  }
  return url;
}

async function generateAndPersistUGCAsset(
  input: FalUGCImageInput,
  model: string,
  assetType: "generated_image" | "image_thumbnail" | "thumbnail"
): Promise<FalGeneratedAsset> {
  const result = await FalClient.runImage({ ...input, model });
  if (result.success === false) {
    throw new Error(result.error);
  }

  const imageUrl = firstImageUrl(result.data.images);
  const asset = await UGCVideoAsset.create({
    companyId: input.companyId,
    ugcVideoJobId: input.videoJobId,
    ugcCampaignId: input.campaignId,
    assetType,
    fileName: `fal_${assetType}_${input.campaignId}_${input.videoJobId}.png`,
    localPath: imageUrl,
    originalUrl: imageUrl,
    fileSize: 0,
    mimeType: result.data.images[0]?.content_type || "image/png",
    version: 1,
    isActive: true,
    downloadCount: 0,
    metadata: {
      ...result.metadata,
      prompt: input.prompt,
      seed: result.data.seed,
      externalUrl: imageUrl
    }
  } as Partial<UGCVideoAsset> as UGCVideoAsset);

  return {
    assetId: asset.id,
    url: imageUrl,
    costUSD: ESTIMATED_IMAGE_COST_USD,
    metadata: {
      ...result.metadata,
      externalUrl: imageUrl,
      assetType
    }
  };
}

async function generateProfilePhoto(input: FalProfilePhotoInput): Promise<FalGeneratedAsset> {
  const result = await FalClient.runImage({ ...input, model: input.model || DEFAULT_IMAGE_MODEL });
  if (result.success === false) {
    throw new Error(result.error);
  }

  const imageUrl = firstImageUrl(result.data.images);
  const photoType = input.photoType || "profile";

  await AgentProfilePhoto.update(
    { isActive: false },
    {
      where: {
        agentIdentityId: input.agentIdentityId,
        companyId: input.companyId,
        photoType,
        isActive: true
      }
    }
  );

  const photo = await AgentProfilePhoto.create({
    companyId: input.companyId,
    agentIdentityId: input.agentIdentityId,
    photoType,
    url: imageUrl,
    originalUrl: imageUrl,
    dallePrompt: input.prompt,
    localPath: imageUrl,
    isActive: true,
    version: 1,
    metadata: {
      ...result.metadata,
      model: input.model || DEFAULT_IMAGE_MODEL,
      provider: "fal",
      seed: result.data.seed,
      externalUrl: imageUrl
    }
  } as Partial<AgentProfilePhoto> as AgentProfilePhoto);

  return {
    assetId: photo.id,
    url: imageUrl,
    costUSD: ESTIMATED_IMAGE_COST_USD,
    metadata: {
      ...result.metadata,
      externalUrl: imageUrl,
      photoType
    }
  };
}

async function editConsistentCharacter(input: FalUGCImageInput): Promise<FalGeneratedAsset> {
  return generateAndPersistUGCAsset(input, input.model || DEFAULT_EDIT_MODEL, "generated_image");
}

async function generateThumbnail(input: FalUGCImageInput): Promise<FalGeneratedAsset> {
  return generateAndPersistUGCAsset(input, input.model || DEFAULT_THUMBNAIL_MODEL, "thumbnail");
}

async function generateUGCImage(input: FalUGCImageInput): Promise<FalGeneratedAsset> {
  return generateAndPersistUGCAsset(input, input.model || DEFAULT_IMAGE_MODEL, input.assetType || "generated_image");
}

export default {
  generateProfilePhoto,
  editConsistentCharacter,
  generateThumbnail,
  generateUGCImage
};

export { generateProfilePhoto, editConsistentCharacter, generateThumbnail, generateUGCImage };
