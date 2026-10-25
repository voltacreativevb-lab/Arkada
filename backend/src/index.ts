import "dotenv/config";
import cors from "cors";
import express from "express";
import "./lib/types.js";
import { healthRouter } from "./routes/health.js";
import { publicRouter } from "./routes/public.js";
import { radnikRouter } from "./routes/radnik.js";
import { adminRouter } from "./routes/admin.js";
import { izboriRouter } from "./routes/izbori.js";
import { startExpirySweep } from "./lib/expirySweep.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json());

app.use(healthRouter);
app.use(publicRouter);
app.use(radnikRouter);
app.use(izboriRouter);
app.use(adminRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`maestrovolta-api listening on :${port}`);
});

startExpirySweep();
