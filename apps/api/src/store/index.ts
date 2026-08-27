import { MemoryStore } from "./memoryStore.js";
import { PostgresStore } from "./postgresStore.js";
import type { Store } from "./store.js";

export const store: Store = process.env.DATABASE_URL ? new PostgresStore(process.env.DATABASE_URL) : new MemoryStore();
await store.init?.();
await store.deleteExpiredMessages();

setInterval(() => {
  store.deleteExpiredMessages().catch((error) => console.error("Message retention cleanup failed", error));
}, 6 * 60 * 60 * 1000).unref();
