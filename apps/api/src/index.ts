import "dotenv/config";
import cors from "cors";
import express from "express";
import { adminRouter } from "./routes/admin.js";
import { messagesRouter } from "./routes/messages.js";
import { numbersRouter } from "./routes/numbers.js";
import { startMessageWorker } from "./workers/messageWorker.js";

const app = express();
const port = Number(process.env.PORT ?? 4100);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    driver: process.env.WA_DRIVER ?? "mock",
    time: new Date().toISOString()
  });
});

app.use("/api/admin", adminRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/messages", messagesRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.listen(port, () => {
  console.log(`WA Gateway API listening on http://localhost:${port}`);
});

startMessageWorker();
