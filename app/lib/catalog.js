import fs from "fs";
import path from "path";

let cache = null;
export function loadCatalog() {
  if (cache) return cache;
  const file = path.join(process.cwd(), "public", "catalog.json");
  cache = JSON.parse(fs.readFileSync(file, "utf8"));
  return cache;
}
