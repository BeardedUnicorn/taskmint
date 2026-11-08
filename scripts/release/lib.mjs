/**
 * The release's pure parts (scripts/release.mjs does the files, git and
 * builds): reading change notes, the next version, the CHANGELOG section,
 * the version in each manifest, and what a release ships and how each host
 * builds it. Tested by lib.test.mjs (`node --test`).
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

// What a release ships: one file per target, each named
// `<product>-<version>-<suffix>`. The Release workflow builds every target,
// and a local release builds the computer's own installer unless told which.

/** Every target a release ships, in the order the release lists them. */
export const TARGETS = ['macos-arm64', 'macos-x64', 'windows-x64', 'chrome-extension'];

const SUFFIXES = {
  'macos-arm64': 'macos-arm64.dmg',
  'macos-x64': 'macos-x64.dmg',
  'windows-x64': 'windows-x64-setup.exe',
  'chrome-extension': 'chrome-extension.zip',
};

/** The desktop targets: the OS and CPU each runs on, and the Tauri bundle it comes from. */
const DESKTOP = {
  'macos-arm64': {
    platform: 'darwin',
    arch: 'arm64',
    triple: 'aarch64-apple-darwin',
    bundle: 'dmg',
    file: 'aarch64.dmg',
  },
  'macos-x64': { platform: 'darwin', arch: 'x64', triple: 'x86_64-apple-darwin', bundle: 'dmg', file: 'x64.dmg' },
  'windows-x64': {
    platform: 'win32',
    arch: 'x64',
    triple: 'x86_64-pc-windows-msvc',
    bundle: 'nsis',
    file: 'x64-setup.exe',
  },
};

const PLATFORMS = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
const describeHost = ({ platform, arch }) => `${PLATFORMS[platform] ?? platform} (${arch})`;

export const isTarget = name => TARGETS.includes(name);

function requireTarget(target) {
  if (!isTarget(target)) throw new Error(`Unknown target "${target}" (one of ${TARGETS.join(', ')})`);
}

/** The file a target ships as. */
export function assetName(product, version, target) {
  requireTarget(target);
  return `${product}-${version}-${SUFFIXES[target]}`;
}

/** Every file a release ships for the version that isn't among `files` (file names). */
export function missingAssets(product, version, files) {
  return TARGETS.map(target => assetName(product, version, target)).filter(name => !files.includes(name));
}

/**
 * How a host builds a target: a Tauri build, `native` or cross-compiled with
 * `--target <triple>` (the other Mac CPU); `xwin`, the Windows installer
 * cross-compiled on a Mac; or `zip`, the extension zipped with the zip
 * command. Throws for a target the host can't build.
 */
export function buildPlan(target, host) {
  requireTarget(target);
  const desktop = DESKTOP[target];
  if (!desktop) {
    if (host.platform === 'darwin' || host.platform === 'linux') return { kind: 'zip' };
  } else if (desktop.platform === host.platform) {
    return { kind: 'tauri', triple: desktop.arch === host.arch ? null : desktop.triple };
  } else if (target === 'windows-x64' && host.platform === 'darwin') {
    return { kind: 'xwin', triple: desktop.triple };
  }
  throw new Error(`${target} can't be built on ${describeHost(host)}`);
}

/** Where Tauri leaves a desktop target's installer, relative to the repository root. */
export function bundlePath(product, version, target, plan) {
  requireTarget(target);
  const desktop = DESKTOP[target];
  if (!desktop || plan.kind === 'zip') throw new Error(`${target} isn't a Tauri bundle`);
  const dir = plan.triple ? `target/${plan.triple}/release` : 'target/release';
  return `${dir}/bundle/${desktop.bundle}/${product}_${version}_${desktop.file}`;
}

/**
 * The targets to build: the ones named (in order, once each), or else the
 * host's own desktop installer. `windows` adds windows-x64.
 */
export function buildTargets({ targets = [], windows = false, platform, arch }) {
  for (const target of targets) requireTarget(target);
  let chosen = [...new Set(targets)];
  if (chosen.length === 0) {
    const own = Object.keys(DESKTOP).find(
      target => DESKTOP[target].platform === platform && DESKTOP[target].arch === arch
    );
    if (!own) throw new Error(`There's no installer for ${describeHost({ platform, arch })}: name one with --target`);
    chosen = [own];
  }
  if (windows && !chosen.includes('windows-x64')) chosen.push('windows-x64');
  return chosen;
}
