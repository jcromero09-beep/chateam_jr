import { QueryInterface, DataTypes } from "sequelize";

/**
 * Migración Phase 1 — UGC Pipeline
 * Crea 6 tablas nuevas + 13 columnas en Plans
 * Idempotente: usa try/catch y describeTable para no fallar si ya existe
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // =========================================================================
    // 1. AgentIdentities
    // =========================================================================
    try {
      await queryInterface.describeTable("AgentIdentities");
      console.log("⚠️ Table AgentIdentities already exists, skipping...");
    } catch {
      await queryInterface.createTable("AgentIdentities", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        usernameSuggestion: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        age: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        city: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        occupation: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        bioInstagram: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        bioTiktok: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        personalityTraits: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        communicationStyle: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        writingExamples: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        interests: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        catchphrases: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        favoriteBrands: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        contentPillars: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        activeHours: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        responseStyle: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        physicalDescription: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        backstory: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        niche: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        platformFocus: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        status: {
          type: DataTypes.ENUM("draft", "generating", "active", "suspended", "archived"),
          allowNull: false,
          defaultValue: "draft"
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        createdBy: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      await queryInterface.addIndex("AgentIdentities", ["companyId"], {
        name: "idx_agent_identities_company"
      });
      await queryInterface.addIndex("AgentIdentities", ["status"], {
        name: "idx_agent_identities_status"
      });
      await queryInterface.addIndex("AgentIdentities", ["niche"], {
        name: "idx_agent_identities_niche"
      });
      await queryInterface.addIndex("AgentIdentities", ["createdBy"], {
        name: "idx_agent_identities_created_by"
      });

      console.log("✅ Table AgentIdentities created successfully");
    }

    // =========================================================================
    // 2. AgentMemories
    // =========================================================================
    try {
      await queryInterface.describeTable("AgentMemories");
      console.log("⚠️ Table AgentMemories already exists, skipping...");
    } catch {
      await queryInterface.createTable("AgentMemories", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        agentIdentityId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "AgentIdentities", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        memoryType: {
          type: DataTypes.ENUM("past_post", "opinion", "personal_fact", "interaction", "preference"),
          allowNull: false
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        context: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        extractedBy: {
          type: DataTypes.ENUM("seed", "haiku_auto"),
          allowNull: false,
          defaultValue: "seed"
        },
        confidence: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 1.0
        },
        validUntil: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      await queryInterface.addIndex("AgentMemories", ["agentIdentityId"], {
        name: "idx_agent_memories_identity"
      });
      await queryInterface.addIndex("AgentMemories", ["memoryType"], {
        name: "idx_agent_memories_type"
      });
      await queryInterface.addIndex("AgentMemories", ["companyId", "agentIdentityId"], {
        name: "idx_agent_memories_company_identity"
      });

      console.log("✅ Table AgentMemories created successfully");
    }

    // =========================================================================
    // 3. AgentProfilePhotos
    // =========================================================================
    try {
      await queryInterface.describeTable("AgentProfilePhotos");
      console.log("⚠️ Table AgentProfilePhotos already exists, skipping...");
    } catch {
      await queryInterface.createTable("AgentProfilePhotos", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        agentIdentityId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "AgentIdentities", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        photoType: {
          type: DataTypes.ENUM("profile", "story_casual", "activity_shot", "banner"),
          allowNull: false
        },
        url: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        originalUrl: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        dallePrompt: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        dalleRevisedPrompt: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        localPath: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        fileSize: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        version: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      await queryInterface.addIndex("AgentProfilePhotos", ["agentIdentityId"], {
        name: "idx_agent_profile_photos_identity"
      });
      await queryInterface.addIndex("AgentProfilePhotos", ["photoType"], {
        name: "idx_agent_profile_photos_type"
      });

      console.log("✅ Table AgentProfilePhotos created successfully");
    }

    // =========================================================================
    // 4. UGCCampaigns
    // =========================================================================
    try {
      await queryInterface.describeTable("UGCCampaigns");
      console.log("⚠️ Table UGCCampaigns already exists, skipping...");
    } catch {
      await queryInterface.createTable("UGCCampaigns", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        productId: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        status: {
          type: DataTypes.ENUM(
            "draft", "briefing", "producing", "review", "publishing",
            "active", "optimizing", "paused", "completed", "archived"
          ),
          allowNull: false,
          defaultValue: "draft"
        },
        productBrief: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        generationConfig: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        publishConfig: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        optimizationConfig: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        budget: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0
        },
        budgetSpent: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0
        },
        totalVideosGenerated: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        totalPostsPublished: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        overallScore: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true
        },
        startedAt: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        completedAt: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        nextOptimizationAt: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        createdBy: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      await queryInterface.addIndex("UGCCampaigns", ["companyId"], {
        name: "idx_ugc_campaigns_company"
      });
      await queryInterface.addIndex("UGCCampaigns", ["status"], {
        name: "idx_ugc_campaigns_status"
      });
      await queryInterface.addIndex("UGCCampaigns", ["createdBy"], {
        name: "idx_ugc_campaigns_created_by"
      });

      console.log("✅ Table UGCCampaigns created successfully");
    }

    // =========================================================================
    // 5. UGCVideoJobs
    // =========================================================================
    try {
      await queryInterface.describeTable("UGCVideoJobs");
      console.log("⚠️ Table UGCVideoJobs already exists, skipping...");
    } catch {
      await queryInterface.createTable("UGCVideoJobs", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ugcCampaignId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "UGCCampaigns", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        stage: {
          type: DataTypes.ENUM(
            "script_generation", "avatar_generation", "video_generation",
            "composition", "review", "completed", "failed"
          ),
          allowNull: false,
          defaultValue: "script_generation"
        },
        status: {
          type: DataTypes.ENUM("pending", "processing", "completed", "failed", "cancelled"),
          allowNull: false,
          defaultValue: "pending"
        },
        progress: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        script: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        scriptVersion: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        avatarProvider: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        avatarId: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        avatarVideoUrl: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        videoProvider: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        videoProviderJobId: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        rawVideoUrl: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        compositorProvider: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        finalVideoUrl: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        thumbnailUrl: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        fileName: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        fileSize: {
          type: DataTypes.BIGINT,
          allowNull: true
        },
        duration: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        mimeType: {
          type: DataTypes.STRING(255),
          allowNull: false,
          defaultValue: "video/mp4"
        },
        totalCreditsUsed: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0
        },
        totalCostUsd: {
          type: DataTypes.DECIMAL(10, 4),
          allowNull: false,
          defaultValue: 0
        },
        creativeScore: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true
        },
        scoreDetails: {
          type: DataTypes.JSONB,
          allowNull: true
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        retryCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        pipelineLog: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      await queryInterface.addIndex("UGCVideoJobs", ["companyId"], {
        name: "idx_ugc_video_jobs_company"
      });
      await queryInterface.addIndex("UGCVideoJobs", ["ugcCampaignId"], {
        name: "idx_ugc_video_jobs_campaign"
      });
      await queryInterface.addIndex("UGCVideoJobs", ["status"], {
        name: "idx_ugc_video_jobs_status"
      });
      await queryInterface.addIndex("UGCVideoJobs", ["stage"], {
        name: "idx_ugc_video_jobs_stage"
      });

      console.log("✅ Table UGCVideoJobs created successfully");
    }

    // =========================================================================
    // 6. UGCVideoAssets
    // =========================================================================
    try {
      await queryInterface.describeTable("UGCVideoAssets");
      console.log("⚠️ Table UGCVideoAssets already exists, skipping...");
    } catch {
      await queryInterface.createTable("UGCVideoAssets", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ugcVideoJobId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "UGCVideoJobs", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ugcCampaignId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "UGCCampaigns", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        assetType: {
          type: DataTypes.ENUM(
            "raw_avatar", "raw_video", "composed_final", "thumbnail", "subtitle_file"
          ),
          allowNull: false
        },
        fileName: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        originalUrl: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        localPath: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        fileSize: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0
        },
        mimeType: {
          type: DataTypes.STRING(255),
          allowNull: false,
          defaultValue: "video/mp4"
        },
        duration: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        version: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        downloadCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      await queryInterface.addIndex("UGCVideoAssets", ["ugcVideoJobId"], {
        name: "idx_ugc_video_assets_job"
      });
      await queryInterface.addIndex("UGCVideoAssets", ["assetType"], {
        name: "idx_ugc_video_assets_type"
      });
      await queryInterface.addIndex("UGCVideoAssets", ["companyId"], {
        name: "idx_ugc_video_assets_company"
      });

      console.log("✅ Table UGCVideoAssets created successfully");
    }

    // =========================================================================
    // 7. Add 13 UGC/Agent columns to Plans table (idempotent)
    // =========================================================================
    const plansDesc = await queryInterface.describeTable("Plans");

    const planColumns: Array<{
      name: string;
      type: any;
      defaultValue: boolean | number;
      comment: string;
    }> = [
      { name: "useUgc", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable UGC pipeline for this plan" },
      { name: "useUgcAutoPublish", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable auto-publish UGC content" },
      { name: "useUgcAbTesting", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable A/B testing for UGC" },
      { name: "useUgcOptimization", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable UGC optimization loop" },
      { name: "useUgcCreatorNetwork", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable UGC creator network" },
      { name: "useUgcPayments", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable UGC creator payments" },
      { name: "maxUgcVideosPerMonth", type: DataTypes.INTEGER, defaultValue: 0, comment: "Max UGC videos per month" },
      { name: "maxSocialAccounts", type: DataTypes.INTEGER, defaultValue: 0, comment: "Max social accounts connected" },
      { name: "useAgentIdentities", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable agent identities feature" },
      { name: "useAgentDeviceFarm", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable agent device farm" },
      { name: "useAgentEngagement", type: DataTypes.BOOLEAN, defaultValue: false, comment: "Enable agent engagement automation" },
      { name: "maxAgentIdentities", type: DataTypes.INTEGER, defaultValue: 0, comment: "Max agent identities per company" },
      { name: "maxAgentDevices", type: DataTypes.INTEGER, defaultValue: 0, comment: "Max agent devices per company" }
    ];

    for (const col of planColumns) {
      if (!(plansDesc as Record<string, any>)[col.name]) {
        await queryInterface.addColumn("Plans", col.name, {
          type: col.type,
          allowNull: false,
          defaultValue: col.defaultValue,
          comment: col.comment
        });
        console.log(`✅ Column ${col.name} added to Plans`);
      } else {
        console.log(`⚠️ Column ${col.name} already exists in Plans, skipping...`);
      }
    }

    console.log("✅ Migration 20260301200001-create-ugc-phase1-tables completed successfully");
  },

  down: async (queryInterface: QueryInterface) => {
    // Reverse order: drop tables that have FK dependencies first
    await queryInterface.dropTable("UGCVideoAssets");
    await queryInterface.dropTable("UGCVideoJobs");
    await queryInterface.dropTable("UGCCampaigns");
    await queryInterface.dropTable("AgentProfilePhotos");
    await queryInterface.dropTable("AgentMemories");
    await queryInterface.dropTable("AgentIdentities");

    const planColumns = [
      "useUgc", "useUgcAutoPublish", "useUgcAbTesting", "useUgcOptimization",
      "useUgcCreatorNetwork", "useUgcPayments", "maxUgcVideosPerMonth",
      "maxSocialAccounts", "useAgentIdentities", "useAgentDeviceFarm",
      "useAgentEngagement", "maxAgentIdentities", "maxAgentDevices"
    ];

    for (const col of planColumns) {
      await queryInterface.removeColumn("Plans", col);
    }
  }
};
