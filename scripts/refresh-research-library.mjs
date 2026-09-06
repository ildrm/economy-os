import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const studies = JSON.parse(await readFile(`${root}data/public-economy/studies.json`, "utf8"));
const records = [];
for (const study of studies) {
  if (!/^10\.\d{4,9}\/[A-Za-z0-9.()/_-]+$/.test(study.doi)) throw new Error("Invalid curated DOI");
  const url = `https://api.crossref.org/works/${encodeURIComponent(study.doi)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "EconomyOS-research-library/1.0 (https://github.com/ildrm/economy-os)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Crossref returned ${response.status} for ${study.doi}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("Crossref metadata exceeded the size limit");
  const metadata = JSON.parse(text).message;
  if (
    metadata.DOI.toLowerCase() !== study.doi.toLowerCase() ||
    !metadata.title?.[0] ||
    !metadata.author?.length
  ) {
    throw new Error(`Invalid Crossref identity for ${study.doi}`);
  }
  records.push({
    id: study.id,
    doi: metadata.DOI,
    title: metadata.title[0].replace(/<[^>]+>/g, ""),
    authors: metadata.author.map((author) =>
      [author.given, author.family].filter(Boolean).join(" "),
    ),
    publication: metadata["container-title"]?.[0] ?? metadata.publisher,
    year: metadata.published?.["date-parts"]?.[0]?.[0] ?? null,
    type: metadata.type,
    url: metadata.URL,
    metadataUrl: url,
    retrievedAt: new Date().toISOString(),
    metadataSha256: createHash("sha256").update(text).digest("hex"),
    // No copyrighted abstracts or full-text articles are copied into the application.
    reviewStatus: "curated_summary_with_registered_bibliographic_metadata",
  });
  console.log(`${records.length}/${studies.length}: ${records.at(-1).title}`);
}
const path = `${root}data/public-economy/bibliography.json`;
await writeFile(`${path}.tmp`, `${JSON.stringify(records, null, 2)}\n`);
await rename(`${path}.tmp`, path);
