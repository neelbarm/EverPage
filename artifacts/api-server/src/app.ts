import express, { type Express, type Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    for (const d of process.env.REPLIT_DOMAINS.split(",")) {
      const host = d.trim();
      if (host) origins.add(`https://${host}`);
    }
  }
  return origins;
}

function isOriginAllowed(origin: string, allowed: Set<string>): boolean {
  if (allowed.has(origin)) return true;
  // Expo Go and Replit tunnel subdomains (e.g. *.expo.picard.replit.dev)
  if (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app")) return true;
  return false;
}

const allowedOrigins = getAllowedOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    credentials: true,
    origin(requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Allow same-origin requests (no Origin header) and pre-flight without origin
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      if (isOriginAllowed(requestOrigin, allowedOrigins)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin not allowed — ${requestOrigin}`));
      }
    },
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
