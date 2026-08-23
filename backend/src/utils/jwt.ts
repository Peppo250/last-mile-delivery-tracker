import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthUser } from "../middleware/auth";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}
