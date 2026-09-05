import { applySchema, createDatabase } from "@/db/client";
import path from "node:path";

const configured = process.env.DATABASE_URL ?? "file:./data/leadhunter.db";
if (!configured.startsWith("file:")) throw new Error("DATABASE_URL must use the file: protocol");

const database = createDatabase(path.resolve(process.cwd(), configured.slice(5)));
applySchema(database.sqlite);
database.close();
console.log("Database migrated.");
