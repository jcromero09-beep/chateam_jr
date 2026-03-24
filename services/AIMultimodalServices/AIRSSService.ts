import logger from "../../utils/logger";

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  content?: string;
  pubDate: string;
  author?: string;
  categories?: string[];
}

export interface RSSFeedResult {
  feedUrl: string;
  feedTitle: string;
  items: RSSItem[];
  itemCount: number;
  lastFetchedAt: Date;
}

/**
 * Fetch and parse RSS feed
 */
const fetchFeed = async (
  feedUrl: string,
  options: { maxItems?: number } = {}
): Promise<RSSFeedResult> => {
  const { maxItems = 20 } = options;

  try {
    const axios = require('axios');
    const response = await axios.get(feedUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'ChatEAM-RSS-Bot/1.0' }
    });

    const xml = response.data;

    // Simple XML parsing for RSS 2.0 and Atom feeds
    const items: RSSItem[] = [];
    const feedTitle = extractTag(xml, 'title') || feedUrl;

    // RSS 2.0 items
    const itemMatches = xml.match(/<item[\s>]([\s\S]*?)<\/item>/gi) || [];
    // Atom entries
    const entryMatches = xml.match(/<entry[\s>]([\s\S]*?)<\/entry>/gi) || [];

    const allItems = [...itemMatches, ...entryMatches];

    for (const itemXml of allItems.slice(0, maxItems)) {
      items.push({
        title: extractTag(itemXml, 'title') || 'Sin titulo',
        link: extractTag(itemXml, 'link') || extractAttr(itemXml, 'link', 'href') || '',
        description: stripHtml(extractTag(itemXml, 'description') || extractTag(itemXml, 'summary') || ''),
        content: stripHtml(extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'content') || ''),
        pubDate: extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'published') || '',
        author: extractTag(itemXml, 'author') || extractTag(itemXml, 'dc:creator') || '',
        categories: extractAllTags(itemXml, 'category')
      });
    }

    logger.info(`[AIRSS] Fetched ${items.length} items from ${feedUrl}`);

    return {
      feedUrl,
      feedTitle,
      items,
      itemCount: items.length,
      lastFetchedAt: new Date()
    };
  } catch (error: any) {
    logger.error(`[AIRSS] Error fetching ${feedUrl}: ${error.message}`);
    throw error;
  }
};

/**
 * Ingest RSS feed items into Knowledge Base
 */
const ingestToKB = async (
  feedUrl: string,
  companyId: number,
  options: { maxItems?: number; generateSummaries?: boolean } = {}
): Promise<{ ingested: number; skipped: number }> => {
  const { maxItems = 10, generateSummaries = true } = options;

  try {
    const feed = await fetchFeed(feedUrl, { maxItems });
    const { QueryTypes } = require("sequelize");
    const sequelize = require("../../database").default;

    let ingested = 0;
    let skipped = 0;

    for (const item of feed.items) {
      const content = item.content || item.description;
      if (!content || content.length < 50) {
        skipped++;
        continue;
      }

      // Check if already indexed
      const existing = await sequelize.query(`
        SELECT id FROM "AIDocuments"
        WHERE "companyId" = :companyId
          AND "sourceType" = 'rss'
          AND "sourceUrl" = :sourceUrl
        LIMIT 1
      `, {
        replacements: { companyId, sourceUrl: item.link },
        type: QueryTypes.SELECT
      });

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Create document
      const [docResult] = await sequelize.query(`
        INSERT INTO "AIDocuments" (
          "companyId", title, "sourceType", "sourceUrl", status,
          "totalChunks", "totalTokens", metadata, "createdAt", "updatedAt"
        ) VALUES (
          :companyId, :title, 'rss', :sourceUrl, 'processed',
          1, :tokens, :metadata, NOW(), NOW()
        ) RETURNING id
      `, {
        replacements: {
          companyId,
          title: item.title,
          sourceUrl: item.link,
          tokens: Math.ceil(content.length / 4),
          metadata: JSON.stringify({
            feedUrl,
            pubDate: item.pubDate,
            author: item.author,
            categories: item.categories
          })
        },
        type: QueryTypes.INSERT
      });

      const documentId = (docResult as any[])[0]?.id;

      // Create single chunk
      await sequelize.query(`
        INSERT INTO "AIChunks" (
          "documentId", "companyId", content, "chunkIndex",
          "tokenCount", metadata, "createdAt", "updatedAt"
        ) VALUES (
          :documentId, :companyId, :content, 0,
          :tokenCount, '{}', NOW(), NOW()
        )
      `, {
        replacements: {
          documentId,
          companyId,
          content: `${item.title}\n\n${content}`,
          tokenCount: Math.ceil(content.length / 4)
        },
        type: QueryTypes.INSERT
      });

      ingested++;
    }

    logger.info(`[AIRSS] Ingested ${ingested}/${feed.items.length} items from ${feedUrl}, empresa=${companyId}`);
    return { ingested, skipped };
  } catch (error: any) {
    logger.error(`[AIRSS] Ingestion error: ${error.message}`);
    return { ingested: 0, skipped: 0 };
  }
};

// Helper functions
function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return (match?.[1] || match?.[2] || '').trim();
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match?.[1] || '';
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export default { fetchFeed, ingestToKB };
