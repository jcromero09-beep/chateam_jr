import jwt, { type SignOptions } from "jsonwebtoken";
import authConfig from "../config/auth";
import User from "../models/User";

const { sign } = jwt;

export const createAccessToken = (user: User, sid: string): string => {
  const { secret, expiresIn } = authConfig;

  return sign(
    {
      username: user.name,
      profile: user.profile,
      id: user.id,
      companyId: user.companyId,
      super: user.super,
      sid
    },
    secret,
    {
      expiresIn
    } as SignOptions
  );
};

export const createRefreshToken = (user: User, sid: string): string => {
  const { refreshSecret, refreshExpiresIn } = authConfig;

  return sign(
    { id: user.id, tokenVersion: user.tokenVersion, companyId: user.companyId, sid },
    refreshSecret,
    {
      expiresIn: refreshExpiresIn
    } as SignOptions
  );
};


export const createAccessTokenMovil = (user: User, sid: string): string => {
  const { secret } = authConfig;
  return sign(
    { username: user.name, profile: user.profile, id: user.id, companyId: user.companyId, sid },
    secret,
    { expiresIn: "24h" } as SignOptions
  );
};

export const createRefreshTokenMovil = (user: User, sid: string): string => {
  const { refreshSecret } = authConfig;
  return sign(
    { id: user.id, tokenVersion: user.tokenVersion, companyId: user.companyId, sid },
    refreshSecret,
    { expiresIn: "24h" } as SignOptions
  );
};
