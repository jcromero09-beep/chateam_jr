import { Request, Response } from "express";
import Version from "../models/Versions";

export const index = async (req: Request, res: Response): Promise<Response> => {
    const version = await Version.findByPk(1);
    return res.status(200).json({
        version: version?.versionFrontend || "6.0.0"
    });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
    const version = await Version.findByPk(1);
    if (!version) {
        return res.status(404).json({ error: "Version record not found" });
    }
    version.versionFrontend = req.body.version;
    await version.save();

    return res.status(200).json({
        version: version.versionFrontend
    });
};
