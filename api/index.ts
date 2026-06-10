import type { Request, Response } from "express";

process.env.MCP_SERVER_NO_AUTO_START = "1";

const { createApp } = await import("../src/index.js");
const app = createApp();

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
