#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const contentRoot = path.resolve(__dirname, "..", "..", "canvid");
const skipDirs = new Set([".git", ".obsidian", "node_modules", "candidates"]);

function parseLangFile(text) {
  const lines = String(text || "").split(/\r?\n/);
  const map = {};
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (currentKey !== null) {
      map[currentKey] = buffer.join("\n").trim();
    }
    buffer = [];
  };

  for (const line of lines) {
    const headerMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*$/.exec(line);
    if (headerMatch) {
      flush();
      currentKey = headerMatch[1];
      continue;
    }
    if (currentKey !== null) {
      buffer.push(line);
    }
  }
  flush();

  return map;
}

function serializeLangFile(map) {
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return "";
  return keys.map(key => `${key}:\n${map[key]}\n`).join("\n") + "\n";
}

function findScriptFiles(root) {
  const results = [];

  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(full);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const text = fs.readFileSync(full, "utf8");
        if (/^#{1,6}\s*Script\b.*$/im.test(text)) {
          results.push(full);
        }
      }
    }
  };

  walk(root);
  return results;
}

function extractScriptSectionLines(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (/^#{1,6}\s*Script\b.*$/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i])) break;
    body.push({ text: lines[i], line: i + 1 });
  }
  return body;
}

function extractCaptions(bodyLines) {
  const captionRegex = /^caption\s+[0-9]*\.?[0-9]+s\s+([A-Za-z_][A-Za-z0-9_]*)\s+"((?:[^"\\]|\\.)*)"$/i;
  const out = [];

  for (const { text, line } of bodyLines) {
    const match = captionRegex.exec(text.trim());
    if (match) {
      out.push({
        key: match[1],
        text: match[2].replace(/\\(.)/g, (full, ch) => (ch === "n" ? "\n" : ch)),
        line,
      });
    }
  }

  return out;
}

function main() {
  const scriptFiles = findScriptFiles(contentRoot);
  const collected = new Map();
  const conflicts = [];

  for (const file of scriptFiles) {
    const relativeFile = path.relative(contentRoot, file);
    const text = fs.readFileSync(file, "utf8");
    const captions = extractCaptions(extractScriptSectionLines(text));

    for (const { key, text: captionText, line } of captions) {
      const existing = collected.get(key);
      if (existing && existing.text !== captionText) {
        conflicts.push(
          `Key '${key}' has conflicting text: '${existing.file}:${existing.line}' vs '${relativeFile}:${line}'.`
        );
      }
      collected.set(key, { text: captionText, file: relativeFile, line });
    }
  }

  const englishPath = path.join(contentRoot, "English.txt");
  const existingMap = fs.existsSync(englishPath)
    ? parseLangFile(fs.readFileSync(englishPath, "utf8"))
    : {};

  let updatedCount = 0;
  for (const [key, { text }] of collected) {
    if (existingMap[key] !== text) {
      updatedCount += 1;
    }
    existingMap[key] = text;
  }

  fs.writeFileSync(englishPath, serializeLangFile(existingMap));

  console.log(
    `compileText: scanned ${scriptFiles.length} script file(s), found ${collected.size} caption key(s), updated ${updatedCount} entr${updatedCount === 1 ? "y" : "ies"} in English.txt.`
  );

  if (conflicts.length > 0) {
    console.warn("compileText: conflicting caption text for the same key (last occurrence wins):");
    for (const line of conflicts) {
      console.warn(`  - ${line}`);
    }
  }
}

main();
