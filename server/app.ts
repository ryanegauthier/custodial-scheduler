import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import buildingsRouter    from "./routes/buildings";
import custodiansRouter   from "./routes/custodians";
import schedulesRouter    from "./routes/schedules";
import zonesRouter        from "./routes/zones";
import disruptionsRouter  from "./routes/disruptions";
import coverageRouter     from "./routes/coverage";
import assignmentsRouter  from "./routes/assignments";
import aiRouter           from "./routes/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/buildings",   buildingsRouter);
app.use("/api/custodians",  custodiansRouter);
app.use("/api/schedules",   schedulesRouter);
app.use("/api/zones",       zonesRouter);
app.use("/api/disruptions", disruptionsRouter);
app.use("/api/coverage",    coverageRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/ai",          aiRouter);

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../client/dist");
  app.use(express.static(dist));
  // Express 5 requires named wildcards; the braces make it optional so
  // "/" itself also matches (a bare "/*splat" would not).
  app.get("/{*splat}", (_, res) => res.sendFile(path.join(dist, "index.html")));
}

// JSON error responses, matching the { error } shape routes already use
// for validation failures (Express 5's default handler sends an HTML
// page). Thrown/rejected errors from any handler land here. Errors that
// carry a 4xx status (e.g. express.json()'s 400 for a malformed body)
// keep their status and message; anything else is a 500, with the real
// message only outside production so SQL/internal details don't leak.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const e = err as { status?: number; statusCode?: number; message?: string };
  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 500) console.error(err);
  const expose = status < 500 || process.env.NODE_ENV !== "production";
  res.status(status).json({ error: expose && e.message ? e.message : "Internal server error" });
});

export default app;
