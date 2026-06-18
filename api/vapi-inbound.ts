import type { Request, Response } from "express";

const { handleVapiInbound } = await import("../src/vapiInbound.js");

export default function handler(req: Request, res: Response) {
  return handleVapiInbound(req, res);
}
