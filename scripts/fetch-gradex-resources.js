#!/usr/bin/env node
// Fetches the GradeX SubDeck resources feed and converts it to the JSON
// shape consumed by the Resources page (src/data/resources.json).
//
// Usage: node scripts/fetch-gradex-resources.js
//
// The endpoint returns CSV where every row is itself a single quoted CSV
// record. Inner cells that contain commas are wrapped in escaped quotes
// (`""..."`). Each multi-link cell is a comma separated list of `Title|URL`
// pairs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_URL = 'https://gradex.bond/api/thedeck?action=resources';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'src', 'data', 'resources.json');

function parseCsvRow(row) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function parseLinkList(cell) {
  if (!cell || !cell.trim()) return [];
  const items = parseCsvRow(cell);
  const result = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const idx = item.indexOf('|');
    if (idx === -1) {
      // No url paired with this label; skip but keep the title for visibility.
      result.push({ title: item, url: '' });
      continue;
    }
    const title = item.slice(0, idx).trim();
    const url = item.slice(idx + 1).trim();
    if (!url) continue;
    result.push({ title: title || 'Resource', url });
  }
  return result;
}

function semesterNumber(label) {
  const m = /sem(?:ester)?\s*(\d+)/i.exec(label || '');
  return m ? Number(m[1]) : null;
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent': 'AcademiaPortal/1.0 (+https://github.com)',
      Accept: 'text/csv,*/*',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch GradeX resources: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const rawRows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // First non-empty row is the header (`"semester,subject,..."`). Skip it.
  const dataRows = rawRows.slice(1);

  const semesters = new Map();

  for (const rawRow of dataRows) {
    // Each row is wrapped in a single pair of quotes; parse the outer CSV
    // first to peel that off, then parse the inner record.
    const outer = parseCsvRow(rawRow);
    if (outer.length === 0) continue;
    const inner = parseCsvRow(outer[0]);
    if (inner.length < 2) continue;

    const [semLabel, subjectName, ppts, pyqs, syllabus, channelName, playlist] = inner;
    const semNum = semesterNumber(semLabel);
    if (!semNum) continue;
    const name = (subjectName || '').trim();
    if (!name) continue;

    const sections = [];
    const pptsItems = parseLinkList(ppts);
    if (pptsItems.length) sections.push({ key: 'ppts', label: 'Notes & PPTs', items: pptsItems });

    const pyqItems = parseLinkList(pyqs);
    if (pyqItems.length) sections.push({ key: 'pyqs', label: 'Previous Year Questions', items: pyqItems });

    const syllabusItems = parseLinkList(syllabus);
    if (syllabusItems.length) sections.push({ key: 'syllabus', label: 'Syllabus', items: syllabusItems });

    const playlistItems = parseLinkList(playlist);
    const channel = (channelName || '').trim();
    if (playlistItems.length) {
      sections.push({
        key: 'videos',
        label: channel ? `Video Lectures - ${channel}` : 'Video Lectures',
        items: playlistItems,
      });
    }

    if (!semesters.has(semNum)) semesters.set(semNum, new Map());
    const subjectMap = semesters.get(semNum);
    // De-duplicate subjects by name within a semester. If the same subject
    // appears twice, merge the sections (later entries win on duplicate key).
    if (subjectMap.has(name)) {
      const existing = subjectMap.get(name);
      const bySection = new Map(existing.sections.map((s) => [s.key, s]));
      for (const section of sections) {
        if (bySection.has(section.key)) {
          const merged = bySection.get(section.key);
          const seen = new Set(merged.items.map((it) => `${it.title}|${it.url}`));
          for (const it of section.items) {
            const k = `${it.title}|${it.url}`;
            if (!seen.has(k)) {
              merged.items.push(it);
              seen.add(k);
            }
          }
        } else {
          bySection.set(section.key, section);
          existing.sections.push(section);
        }
      }
    } else {
      subjectMap.set(name, { name, sections });
    }
  }

  const output = [...semesters.keys()]
    .sort((a, b) => a - b)
    .map((semNum) => ({
      semester: semNum,
      subjects: [...semesters.get(semNum).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const totalSubjects = output.reduce((acc, s) => acc + s.subjects.length, 0);
  const totalLinks = output.reduce(
    (acc, s) => acc + s.subjects.reduce((a, sub) => a + sub.sections.reduce((x, sec) => x + sec.items.length, 0), 0),
    0
  );
  console.log(
    `Wrote ${output.length} semesters, ${totalSubjects} subjects, ${totalLinks} links → ${path.relative(process.cwd(), OUTPUT_PATH)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
