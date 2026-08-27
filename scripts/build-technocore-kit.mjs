#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = join(root, "technocore");
const outputPath = join(kitRoot, "technocore-brand-kit.zip");
const checkOnly = process.argv.includes("--check");

const KIT_FILES = [
  "technocore-mark-primary.svg",
  "technocore-mark-512.png",
  "technocore-mark-print.svg",
  "technocore-mark-256.png",
  "technocore-mark-product.svg",
  "technocore-mark-128.png",
  "technocore-mark-onecolor-ice.svg",
  "technocore-mark-64.png",
  "technocore-mark-onecolor-base.svg",
  "technocore-mark-32.png",
  "technocore-favicon.svg",
  "technocore-social-card.png",
  "technocore-appicon-light.svg",
  "technocore-avatar.svg",
  "brand.json",
  "src/technocore.js",
  "src/build.mjs",
  "src/tokens.css",
];

assert.equal(KIT_FILES.length, 18, "the public kit must contain exactly 18 files");

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function localHeader(name, checksum, size) {
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  name.copy(header, 30);
  return header;
}

function centralHeader(name, checksum, size, offset) {
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(33, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  name.copy(header, 46);
  return header;
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

const entries = [];
let localOffset = 0;
for (const archivePath of KIT_FILES) {
  assert(!archivePath.startsWith("/") && !archivePath.includes(".."), `unsafe archive path: ${archivePath}`);
  const data = await readFile(join(kitRoot, archivePath));
  const name = Buffer.from(archivePath, "utf8");
  const checksum = crc32(data);
  const local = localHeader(name, checksum, data.length);
  entries.push({ archivePath, name, data, checksum, local, localOffset });
  localOffset += local.length + data.length;
}

const locals = entries.flatMap((entry) => [entry.local, entry.data]);
const central = entries.map((entry) => centralHeader(entry.name, entry.checksum, entry.data.length, entry.localOffset));
const centralSize = central.reduce((sum, record) => sum + record.length, 0);
const bundle = Buffer.concat([...locals, ...central, endOfCentralDirectory(entries.length, centralSize, localOffset)]);

if (checkOnly) {
  const existing = await readFile(outputPath);
  assert(existing.equals(bundle), "Technocore bundle is stale; run node scripts/build-technocore-kit.mjs");
} else {
  await writeFile(outputPath, bundle);
}

console.log(JSON.stringify({ status: checkOnly ? "verified" : "built", output: relative(root, outputPath), files: entries.length, bytes: bundle.length }));
