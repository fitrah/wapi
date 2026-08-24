import type { NextFunction, Request, Response } from "express";
import { store } from "./store/index.js";
import type { Tenant } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}

export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  const header = req.header("x-api-key") ?? "";
  const tenant = await store.getTenantByApiKey(header);
  if (!tenant) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  req.tenant = tenant;
  next();
}
