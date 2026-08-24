import { MemoryStore } from "./memoryStore.js";
import { PostgresStore } from "./postgresStore.js";
import type { Store } from "./store.js";

export const store: Store = process.env.DATABASE_URL ? new PostgresStore(process.env.DATABASE_URL) : new MemoryStore();
await store.init?.();
