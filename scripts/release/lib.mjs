/**
 * The release's pure parts (scripts/release.mjs does the files, git and
 * builds): reading change notes, the next version, the CHANGELOG section,
 * and the version in each manifest. Tested by lib.test.mjs (`node --test`).
 */

/** Bump levels, lowest first. */
export const BUMPS = ['patch', 'minor', 'major'];

/** Change types, in the order the CHANGELOG lists them (Keep a Changelog). */
export const TYPES = ['Added', 'Changed', 'Removed', 'Fixed', 'Security'];

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * A change note: front matter with `bump` and `type`, then the text for the
 * CHANGELOG. The text is one bullet, or one per `- ` line. Throws an error
 * that names the file when anything is missing or unknown.
 */
export function parseNote(file, text) {
  const fail = problem => {
    throw new Error(`${file}: ${problem} (see changes/README.md)`);
  };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0].trim() !== '---') fail('it should start with a --- line');
  const end = lines.indexOf('---', 1);
  if (end === -1) fail('the front matter has no closing --- line');

  const fields = {};
  for (const line of lines.slice(1, end)) {
    const content = line.replace(/#.*$/, '').trim();
    if (content === '') continue;
    const match = content.match(/^([a-z]+):\s*(\S+)$/i);
    if (!match) fail(`can't read "${line.trim()}" (expected "key: value")`);
    const [, key, value] = match;
    if (key !== 'bump' && key !== 'type') fail(`unknown field "${key}"`);
    fields[key] = value;
  }
  if (!fields.bump) fail('no bump');
  if (!BUMPS.includes(fields.bump)) fail(`bump "${fields.bump}" isn't one of ${BUMPS.join(', ')}`);
  if (!fields.type) fail('no type');
  if (!TYPES.includes(fields.type)) fail(`type "${fields.type}" isn't one of ${TYPES.join(', ')}`);

  const items = noteItems(lines.slice(end + 1));
  if (items.length === 0) fail('no text for the changelog');
  return { file, bump: fields.bump, type: fields.type, items };
}

/** The body's bullets: each `- ` line starts one, and other lines join the one before. */
function noteItems(lines) {
  const items = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('- ')) items.push(line.slice(2).trim());
    else if (items.length > 0) items[items.length - 1] += ` ${line}`;
    else items.push(line);
  }
  return items;
}

/** The highest bump the notes ask for; null with no notes. */
export function highestBump(notes) {
  let highest = -1;
  for (const note of notes) highest = Math.max(highest, BUMPS.indexOf(note.bump));
  return highest === -1 ? null : BUMPS[highest];
}

export function isVersion(text) {
  return VERSION.test(text);
}

export function bumpVersion(version, bump) {
  const match = version.match(VERSION);
  if (!match) throw new Error(`"${version}" isn't a version like 1.2.3`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`"${bump}" isn't one of ${BUMPS.join(', ')}`);
}

/** A local date as YYYY-MM-DD. */
export function isoDate(date) {
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function sectionHeading(version, date) {
  return `## ${version} – ${date}`;
}

/** The CHANGELOG section for a release: its heading, then the notes by type (and file name within a type). */
export function renderSection(version, date, notes) {
  const parts = [sectionHeading(version, date)];
  if (notes.length === 0) parts.push('No user-facing changes.');
  for (const type of TYPES) {
    const ofType = notes.filter(note => note.type === type).sort((a, b) => a.file.localeCompare(b.file));
    if (ofType.length === 0) continue;
    parts.push(`### ${type}`, ofType.flatMap(note => note.items.map(item => `- ${item}`)).join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}

const HEADING = /^## (\S+)/;

/** The versions the CHANGELOG has sections for, newest first. */
export function changelogVersions(changelog) {
  return changelog.split('\n').flatMap(line => line.match(HEADING)?.[1] ?? []);
}

/** The CHANGELOG with a section added above the newest one (or at the end, with none yet). */
export function insertSection(changelog, version, section) {
  if (changelogVersions(changelog).includes(version)) throw new Error(`CHANGELOG.md already has ${version}`);
  const lines = changelog.split('\n');
  const first = lines.findIndex(line => HEADING.test(line));
  const added = section.trimEnd();
  if (first === -1) return `${changelog.trimEnd()}\n\n${added}\n`;
  return [...lines.slice(0, first), ...added.split('\n'), '', ...lines.slice(first)].join('\n');
}

/** A version's section without its heading (the release notes); null when it has none. */
export function extractSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line.match(HEADING)?.[1] === version);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && HEADING.test(line));
  return lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join('\n')
    .trim();
}

// The version in each kind of manifest. Each edit replaces only the version
// text, so the file's formatting is kept.

const PACKAGE_JSON_VERSION = /^(\s*"version":\s*")([^"]*)(")/m;

export function packageJsonVersion(text, file) {
  const match = text.match(PACKAGE_JSON_VERSION);
  if (!match) throw new Error(`${file}: no "version"`);
  return match[2];
}

export function setPackageJsonVersion(text, version, file) {
  packageJsonVersion(text, file);
  return text.replace(PACKAGE_JSON_VERSION, `$1${version}$3`);
}

/** The [package] table: from its header to the next table. */
function packageTable(text, file) {
  const start = text.search(/^\[package\]\s*$/m);
  if (start === -1) throw new Error(`${file}: no [package] table`);
  const rest = text.slice(start + 1).search(/^\[/m);
  const end = rest === -1 ? text.length : start + 1 + rest;
  return { start, end, table: text.slice(start, end) };
}

function cargoField(text, field, file) {
  const match = packageTable(text, file).table.match(new RegExp(`^${field}\\s*=\\s*"([^"]*)"`, 'm'));
  if (!match) throw new Error(`${file}: no ${field} in [package]`);
  return match[1];
}

export const cargoTomlVersion = (text, file) => cargoField(text, 'version', file);
export const cargoTomlName = (text, file) => cargoField(text, 'name', file);

export function setCargoTomlVersion(text, version, file) {
  cargoTomlVersion(text, file);
  const { start, end, table } = packageTable(text, file);
  return text.slice(0, start) + table.replace(/^(version\s*=\s*")[^"]*(")/m, `$1${version}$2`) + text.slice(end);
}

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cargo.lock with each named package at the version; each must be listed exactly once. */
export function setCargoLockVersions(text, names, version) {
  let next = text;
  for (const name of names) {
    const entry = new RegExp(`(\\[\\[package\\]\\]\\nname = "${escapeRegex(name)}"\\nversion = ")[^"]*(")`, 'g');
    const count = next.match(entry)?.length ?? 0;
    if (count !== 1) throw new Error(`Cargo.lock lists ${name} ${count} times, expected once`);
    next = next.replace(entry, `$1${version}$2`);
  }
  return next;
}
