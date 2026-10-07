import express from "express";
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
  app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
}

export default app;
