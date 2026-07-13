import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import buildingsRouter    from "./routes/buildings";
import custodiansRouter   from "./routes/custodians";
import schedulesRouter    from "./routes/schedules";
import zonesRouter        from "./routes/zones";
import disruptionsRouter  from "./routes/disruptions";
import aiRouter           from "./routes/ai";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/buildings",   buildingsRouter);
app.use("/api/custodians",  custodiansRouter);
app.use("/api/schedules",   schedulesRouter);
app.use("/api/zones",       zonesRouter);
app.use("/api/disruptions", disruptionsRouter);
app.use("/api/ai",          aiRouter);

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../client/dist");
  app.use(express.static(dist));
  app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => console.log(`Server :${PORT}`));
