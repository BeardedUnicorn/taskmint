#!/usr/bin/env node
/**
 * Cuts a TaskMint release from the change notes in changes/ (see
 * changes/README.md): bumps the shared version by the highest note, writes
 * the CHANGELOG section, builds the installers into releases/, then commits
 * "Release X.Y.Z" and tags vX.Y.Z. Nothing is pushed unless --publish. The
 * pushed tag starts the Release workflow (.github/workflows/release.yml),
 * which builds every installer with --rebuild and creates the GitHub release
 * with github-release.
 *
 * Run it in the main checkout, on main: `pnpm release --help`.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assetName,
  BUMPS,
  buildPlan,
  buildTargets,
  bumpVersion,
  bundlePath,
  cargoTomlName,
  cargoTomlVersion,
  extractSection,
  highestBump,
  insertSection,
  isoDate,
  isTarget,
  missingAssets,
  packageJsonVersion,
  parseNote,
  renderSection,
  setCargoLockVersions,
  setCargoTomlVersion,
  setPackageJsonVersion,
  TARGETS,
} from './release/lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Every manifest that carries the shared version (the extension keeps its own). */
const PACKAGE_JSONS = [
  'apps/desktop/package.json', // tauri.conf.json reads the app's version from here
  'apps/web/package.json',
  'packages/client/package.json', // the About page and Sentry's release
  'packages/contracts/package.json',
];
const CARGO_TOMLS = ['apps/desktop/src-tauri/Cargo.toml', 'apps/server/Cargo.toml', 'crates/taskmint-core/Cargo.toml'];
const CARGO_LOCK = 'Cargo.lock';
const CHANGELOG = 'CHANGELOG.md';
const CHANGES = 'changes';
const RELEASES = 'releases';
const EXTENSION_DIST = 'apps/extension/dist';
const RELEASE_WORKFLOW = 'release.yml';

const USAGE = `Usage: pnpm release [options]
       pnpm release publish
       pnpm release github-release

Bumps the version by the highest change note in changes/, writes the
CHANGELOG section, builds this computer's installer into releases/, then
commits "Release X.Y.Z" and tags vX.Y.Z. Run it in the main checkout, on main.

Options:
  --dry-run              Print the next version and its section; change nothing
  --patch, --minor, --major
                         Bump this level instead of the notes' highest
  --target <name>        Build this instead of this computer's installer; repeat
                         it for more: ${TARGETS.join(', ')}
  --windows              Also build windows-x64 (on a Mac, cross-compiled with cargo-xwin)
  --no-build             Bump, write the changelog, commit and tag; no installers
  --rebuild              Build the current version's installers into releases/
                         (no bump, no commit)
  --publish              Then push main and the tag
  -h, --help             Show this

publish                  Push main and the current version's tag. The tag starts
                         the Release workflow, which builds every installer and
                         creates the GitHub release.
github-release           (The Release workflow's last step) Create the current
                         version's GitHub release with its CHANGELOG section and
                         every installer in releases/, or replace its installers`;

class Stop extends Error {}
const stop = message => {
  throw new Stop(message);
};

// ── Shell ───────────────────────────────────────────────────────────────────

/**
 * Runs a command with its output shown; stops if it fails. On Windows, pnpm
 * is a .cmd shim, which only a shell runs: it gets the line as one string
 * (Node warns about args passed with a shell), and the words it's run with
 * need no quoting.
 */
function run(command, args, { cwd = root } = {}) {
  const line = [command, ...args].join(' ');
  console.log(`\n$ ${line}`);
  const result =
    process.platform === 'win32' && command === 'pnpm'
      ? spawnSync(line, { cwd, stdio: 'inherit', shell: true })
      : spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) stop(`${command}: ${result.error.message}`);
  if (result.status !== 0) stop(`${line} failed (exit ${result.status})`);
}

/** The pure parts' errors are the user's to fix, so they stop without a stack trace. */
function checked(fn) {
  try {
    return fn();
  } catch (error) {
    stop(error.message);
  }
}

/** A command's output; stops if it fails. */
function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error) stop(`${command}: ${result.error.message}`);
  if (result.status !== 0) stop(`${command} ${args.join(' ')} failed:\n${result.stderr.trim()}`);
  return result.stdout.trim();
}

const git = (...args) => output('git', args);
const succeeds = (command, args) => spawnSync(command, args, { cwd: root, stdio: 'ignore' }).status === 0;
const read = file => readFileSync(join(root, file), 'utf8');
const write = (file, text) => writeFileSync(join(root, file), text);

// ── State ───────────────────────────────────────────────────────────────────

/** The shared version; stops unless every manifest agrees. */
function currentVersion() {
  const versions = [
    ...PACKAGE_JSONS.map(file => [file, packageJsonVersion(read(file), file)]),
    ...CARGO_TOMLS.map(file => [file, cargoTomlVersion(read(file), file)]),
  ];
  const distinct = new Set(versions.map(([, version]) => version));
  if (distinct.size !== 1) {
    stop(`The manifests disagree on the version:\n${versions.map(([file, v]) => `  ${v}  ${file}`).join('\n')}`);
  }
  return versions[0][1];
}

function changeNotes() {
  const dir = join(root, CHANGES);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map(name => {
      const file = `${CHANGES}/${name}`;
      return parseNote(file, read(file));
    });
}

const tagOf = version => `v${version}`;
const tagExists = tag => succeeds('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`]);
const productName = () => JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json')).productName;

function requireMainAndClean() {
  const branch = git('branch', '--show-current');
  if (branch !== 'main') stop(`Releases are cut on main (this is ${branch || 'a detached HEAD'}).`);
  const status = git('status', '--porcelain');
  if (status) stop(`Commit or set aside these changes first:\n${status}`);
}

// ── Steps ───────────────────────────────────────────────────────────────────

/** Every path a release changes: the manifests, the lock file, the CHANGELOG and the notes it deletes. */
const releasePaths = notes => [
  ...PACKAGE_JSONS,
  ...CARGO_TOMLS,
  CARGO_LOCK,
  CHANGELOG,
  ...notes.map(note => note.file),
];

/**
 * Writes the version everywhere and the CHANGELOG section, and deletes the
 * notes. Every file's new text is worked out first, so a problem with any of
 * them stops it before anything is written.
 */
function writeRelease(version, section, notes) {
  const crates = CARGO_TOMLS.map(file => cargoTomlName(read(file), file));
  const texts = [
    ...PACKAGE_JSONS.map(file => [file, setPackageJsonVersion(read(file), version, file)]),
    ...CARGO_TOMLS.map(file => [file, setCargoTomlVersion(read(file), version, file)]),
    [CARGO_LOCK, setCargoLockVersions(read(CARGO_LOCK), crates, version)],
    [CHANGELOG, insertSection(read(CHANGELOG), version, section)],
  ];
  for (const [file, text] of texts) write(file, text);
  for (const note of notes) rmSync(join(root, note.file));
}

/** Puts the touched paths back as HEAD has them. */
function restore(paths) {
  console.error('\nPutting the version, CHANGELOG and notes back as they were.');
  git('restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths);
}

/** The targets to build and how this computer builds each; stops before anything is built if it can't. */
function planBuilds({ targets, windows }) {
  const host = { platform: process.platform, arch: process.arch };
  return checked(() =>
    buildTargets({ targets, windows, ...host }).map(target => ({ target, ...buildPlan(target, host) }))
  );
}

/** Builds each planned target and puts its file in releases/; returns their paths. */
function build(version, plans) {
  if (plans.length === 0) return [];
  mkdirSync(join(root, RELEASES), { recursive: true });
  return plans.map(plan => {
    const destination = join(root, RELEASES, assetName(productName(), version, plan.target));
    if (plan.kind === 'zip') zipExtension(destination);
    else copyInstaller(buildInstaller(version, plan), destination);
    return destination;
  });
}

/** Builds a desktop installer with Tauri; returns where Tauri left it. */
function buildInstaller(version, plan) {
  if (plan.triple) run('rustup', ['target', 'add', plan.triple]);
  if (plan.kind === 'xwin') run('pnpm', ['--filter', '@taskmint/desktop', 'build:win']);
  else {
    const cross = plan.triple ? ['--target', plan.triple] : [];
    run('pnpm', ['--filter', '@taskmint/desktop', 'tauri', 'build', ...cross]);
  }
  return bundlePath(productName(), version, plan.target, plan);
}

function copyInstaller(from, destination) {
  if (!existsSync(join(root, from))) stop(`The build finished, but ${from} isn't there.`);
  copyFileSync(join(root, from), destination);
}

/** Builds the extension and zips dist/'s contents, manifest.json at the top, for Load unpacked. */
function zipExtension(destination) {
  run('pnpm', ['--filter', '@taskmint/extension', 'build']);
  // zip adds to an archive that's already there
  rmSync(destination, { force: true });
  run('zip', ['-qrX', destination, '.'], { cwd: join(root, EXTENSION_DIST) });
}

function commitAndTag(version, section, paths) {
  git('add', '--all', '--', ...paths);
  const body = section.split('\n').slice(1).join('\n').trim();
  run('git', ['commit', '--quiet', '-m', `Release ${version}`, '-m', body]);
  run('git', ['tag', '--annotate', tagOf(version), '-m', `${productName()} ${version}`]);
}

function reveal(files) {
  const dmg = files.find(file => file.endsWith('.dmg'));
  if (dmg && process.platform === 'darwin' && process.stdout.isTTY) spawnSync('open', ['-R', dmg]);
}

function report(files) {
  if (files.length === 0) return;
  console.log(`\nIn ${RELEASES}/:`);
  for (const file of files) console.log(`  ${relative(join(root, RELEASES), file)}`);
}

// ── Commands ────────────────────────────────────────────────────────────────

function release(options) {
  const current = currentVersion();
  const notes = changeNotes();
  const level = options.level ?? highestBump(notes);
  if (!level) {
    stop(`No change notes in ${CHANGES}/ (changes/README.md says how to write one).
To release without any, pass --patch, --minor or --major.`);
  }
  const version = bumpVersion(current, level);
  const section = renderSection(version, isoDate(new Date()), notes);

  if (options.dryRun) {
    console.log(`${current} → ${version} (${options.level ? `--${level}` : `${level}, from the notes`})`);
    if (notes.length > 0) console.log(`Notes: ${notes.map(note => note.file).join(', ')}`);
    console.log(`\n${section}`);
    return;
  }

  requireMainAndClean();
  if (tagExists(tagOf(version))) stop(`The tag ${tagOf(version)} already exists.`);
  const plans = options.build ? planBuilds(options) : [];

  console.log(`Releasing ${version} (${current} → ${version}, ${level})`);
  const paths = releasePaths(notes);
  const before = git('rev-parse', 'HEAD');
  let files = [];
  try {
    writeRelease(version, section, notes);
    files = build(version, plans);
    commitAndTag(version, section, paths);
  } catch (error) {
    // Once the release is committed, only the tag is missing
    if (git('rev-parse', 'HEAD') === before) restore(paths);
    throw error;
  }
  console.log(`\nCommitted "Release ${version}" and tagged ${tagOf(version)} (not pushed).`);
  report(files);
  reveal(files);
  if (options.publish) publish(version);
}

function rebuild(options) {
  const version = currentVersion();
  const plans = planBuilds(options);
  if (git('status', '--porcelain')) console.warn('The working tree has changes: the installers include them.');
  const files = build(version, plans);
  report(files);
  reveal(files);
}

/** Pushes main and the tag. The tag starts the Release workflow, which builds the installers and creates the GitHub release. */
function publish(version = currentVersion()) {
  const tag = tagOf(version);
  if (!tagExists(tag)) stop(`There's no tag ${tag}: release ${version} first.`);
  if (git('branch', '--show-current') !== 'main') stop('Publish from main.');
  if (extractSection(read(CHANGELOG), version) === null) stop(`CHANGELOG.md has no ${version} section.`);

  run('git', ['push', 'origin', 'main', tag]);
  console.log(`
Pushed main and ${tag}. The Release workflow builds every installer and
creates the GitHub release; follow it with:
  gh run list --workflow ${RELEASE_WORKFLOW}`);
}

/**
 * The Release workflow's last step: creates the GitHub release for the
 * checked-out tag with its CHANGELOG section and every target's file from
 * releases/ (the build jobs' artifacts), or replaces the files of a release
 * that already exists. A release is never made with a file missing.
 */
function githubRelease(version = currentVersion()) {
  const tag = tagOf(version);
  const ref = process.env.GITHUB_REF_NAME;
  if (ref && ref !== tag) stop(`This run is for ${ref}, but the manifests say ${version}.`);
  if (!tagExists(tag)) stop(`There's no tag ${tag}.`);
  const notes = extractSection(read(CHANGELOG), version);
  if (notes === null) stop(`CHANGELOG.md has no ${version} section.`);

  const name = productName();
  const dir = join(root, RELEASES);
  const missing = missingAssets(name, version, existsSync(dir) ? readdirSync(dir) : []);
  if (missing.length > 0) stop(`${RELEASES}/ is missing ${missing.join(', ')}.`);
  const files = TARGETS.map(target => join(dir, assetName(name, version, target)));

  if (succeeds('gh', ['release', 'view', tag])) {
    run('gh', ['release', 'upload', tag, '--clobber', ...files]);
    return;
  }
  const notesFile = join(tmpdir(), `taskmint-${version}-notes.md`);
  writeFileSync(notesFile, `${notes}\n`);
  try {
    run('gh', [
      'release',
      'create',
      tag,
      '--verify-tag',
      '--title',
      `${name} ${version}`,
      '--notes-file',
      notesFile,
      ...files,
    ]);
  } finally {
    rmSync(notesFile, { force: true });
  }
}

// ── Arguments ───────────────────────────────────────────────────────────────

function parseArgs(args) {
  const options = {
    dryRun: false,
    build: true,
    rebuild: false,
    windows: false,
    publish: false,
    level: null,
    targets: [],
  };
  let command = 'release';
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === 'publish' || arg === 'github-release') command = arg;
    else if (arg === '--target' || arg.startsWith('--target=')) {
      const target = arg === '--target' ? args[++index] : arg.slice('--target='.length);
      if (!isTarget(target)) stop(`--target takes one of ${TARGETS.join(', ')}${target ? ` (not ${target})` : ''}.`);
      options.targets.push(target);
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-build') options.build = false;
    else if (arg === '--rebuild') options.rebuild = true;
    else if (arg === '--windows') options.windows = true;
    else if (arg === '--publish') options.publish = true;
    else if (BUMPS.includes(arg.replace(/^--/, '')) && arg.startsWith('--')) {
      if (options.level) stop('Pass one of --patch, --minor and --major.');
      options.level = arg.slice(2);
    } else stop(`Unknown option ${arg}\n\n${USAGE}`);
  }
  if (command !== 'release' && args.length > 1) stop(`\`pnpm release ${command}\` takes no options.`);
  if (options.rebuild && (options.level || !options.build || options.publish || options.dryRun)) {
    stop('--rebuild only takes --target and --windows.');
  }
  if (!options.build && (options.windows || options.targets.length > 0)) {
    stop('--target and --windows build installers, so they need a build.');
  }
  return { command, options };
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'publish') publish();
  else if (command === 'github-release') githubRelease();
  else if (options.rebuild) rebuild(options);
  else release(options);
} catch (error) {
  console.error(`\n${error instanceof Stop ? error.message : error.stack}`);
  process.exit(1);
}
