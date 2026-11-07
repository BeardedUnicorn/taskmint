import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpVersion,
  cargoTomlName,
  cargoTomlVersion,
  changelogVersions,
  extractSection,
  highestBump,
  insertSection,
  isoDate,
  isVersion,
  packageJsonVersion,
  parseNote,
  renderSection,
  setCargoLockVersions,
  setCargoTomlVersion,
  setPackageJsonVersion,
} from './lib.mjs';

const note = (front, body = 'A change.') => `---\n${front}\n---\n${body}\n`;

describe('parseNote', () => {
  it('reads the bump, the type and the text', () => {
    assert.deepEqual(parseNote('a.md', note('bump: minor\ntype: Added', 'Timers on\nseveral tasks.')), {
      file: 'a.md',
      bump: 'minor',
      type: 'Added',
      items: ['Timers on several tasks.'],
    });
  });

  it('makes a bullet of each - line, with following lines joining it', () => {
    const text = note('bump: patch\ntype: Fixed', '- One fix\n  that wraps.\n\n- Another fix.');
    assert.deepEqual(parseNote('b.md', text).items, ['One fix that wraps.', 'Another fix.']);
  });

  it('ignores comments, blank lines and CRLF line ends in the front matter', () => {
    const text = '---\r\nbump: major   # major | minor | patch\r\n\r\ntype: Changed # why\r\n---\r\nText.\r\n';
    const parsed = parseNote('c.md', text);
    assert.equal(parsed.bump, 'major');
    assert.equal(parsed.type, 'Changed');
    assert.deepEqual(parsed.items, ['Text.']);
  });

  const invalid = [
    ['no front matter', 'Just text.', /start with a --- line/],
    ['an unclosed front matter', '---\nbump: minor\ntype: Added\nText.', /no closing ---/],
    ['an unreadable line', note('bump minor\ntype: Added'), /can't read "bump minor"/],
    ['an unknown field', note('bump: minor\ntype: Added\nscope: web'), /unknown field "scope"/],
    ['no bump', note('type: Added'), /no bump/],
    ['an unknown bump', note('bump: huge\ntype: Added'), /bump "huge" isn't one of patch, minor, major/],
    ['no type', note('bump: minor'), /no type/],
    ['an unknown type', note('bump: minor\ntype: Feature'), /type "Feature" isn't one of/],
    ['no text', note('bump: minor\ntype: Added', '  \n'), /no text/],
  ];
  for (const [what, text, message] of invalid) {
    it(`rejects ${what}, naming the file`, () => {
      assert.throws(
        () => parseNote('changes/x.md', text),
        error => error.message.startsWith('changes/x.md: ') && message.test(error.message)
      );
    });
  }
});

describe('highestBump', () => {
  it('is the highest level any note asks for', () => {
    assert.equal(highestBump([{ bump: 'patch' }, { bump: 'minor' }, { bump: 'patch' }]), 'minor');
    assert.equal(highestBump([{ bump: 'minor' }, { bump: 'major' }]), 'major');
    assert.equal(highestBump([{ bump: 'patch' }]), 'patch');
  });

  it('is null with no notes', () => {
    assert.equal(highestBump([]), null);
  });
});

describe('versions', () => {
  it('bumps each level, resetting the lower ones', () => {
    assert.equal(bumpVersion('2.3.4', 'patch'), '2.3.5');
    assert.equal(bumpVersion('2.3.4', 'minor'), '2.4.0');
    assert.equal(bumpVersion('2.3.4', 'major'), '3.0.0');
  });

  it("rejects a version that isn't X.Y.Z, and an unknown level", () => {
    assert.throws(() => bumpVersion('2.3', 'patch'), /"2.3" isn't a version/);
    assert.throws(() => bumpVersion('2.3.4-beta', 'patch'), /isn't a version/);
    assert.throws(() => bumpVersion('2.3.4', 'mega'), /"mega" isn't one of/);
  });

  it('tells a version from anything else', () => {
    assert.equal(isVersion('10.0.12'), true);
    assert.equal(isVersion('v1.0.0'), false);
  });

  it('formats a local date', () => {
    assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  });
});

describe('the CHANGELOG', () => {
  const header = '# Changelog\n\nIntro.\n';
  const existing = `${header}\n## 2.0.0 – 2026-11-07\n\n### Added\n\n- Old thing.\n\n## 1.0.0 – 2026-10-11\n\n- First.\n`;
  const notes = [
    { file: 'z.md', type: 'Fixed', items: ['A fix.'] },
    { file: 'b.md', type: 'Added', items: ['Second, by file name.'] },
    { file: 'a.md', type: 'Added', items: ['First, by file name.', 'And its other bullet.'] },
  ];

  it('renders the notes by type, then file name', () => {
    assert.equal(
      renderSection('2.1.0', '2026-11-08', notes),
      [
        '## 2.1.0 – 2026-11-08',
        '',
        '### Added',
        '',
        '- First, by file name.',
        '- And its other bullet.',
        '- Second, by file name.',
        '',
        '### Fixed',
        '',
        '- A fix.',
        '',
      ].join('\n')
    );
  });

  it('says so when there are no notes', () => {
    assert.equal(renderSection('2.0.1', '2026-11-08', []), '## 2.0.1 – 2026-11-08\n\nNo user-facing changes.\n');
  });

  it('adds a section above the newest one', () => {
    const section = renderSection('2.1.0', '2026-11-08', [notes[0]]);
    const next = insertSection(existing, '2.1.0', section);
    assert.deepEqual(changelogVersions(next), ['2.1.0', '2.0.0', '1.0.0']);
    assert.ok(next.startsWith(`${header}\n## 2.1.0 – 2026-11-08\n\n### Fixed\n\n- A fix.\n\n## 2.0.0`));
  });

  it('adds the first section after the header', () => {
    assert.equal(insertSection(header, '1.0.0', '## 1.0.0 – 2026-10-11\n'), `${header}\n## 1.0.0 – 2026-10-11\n`);
  });

  it('refuses a version it already has', () => {
    assert.throws(() => insertSection(existing, '2.0.0', '## 2.0.0 – x\n'), /already has 2.0.0/);
  });

  it("extracts a version's notes without the heading", () => {
    assert.equal(extractSection(existing, '2.0.0'), '### Added\n\n- Old thing.');
    assert.equal(extractSection(existing, '1.0.0'), '- First.');
    assert.equal(extractSection(existing, '3.0.0'), null);
  });
});

describe('manifests', () => {
  it('reads and sets the version in a package.json, keeping its layout', () => {
    const text = '{\n  "name": "@taskmint/web",\n  "version": "2.0.0",\n  "dependencies": { "x": "1.0.0" }\n}\n';
    assert.equal(packageJsonVersion(text, 'p.json'), '2.0.0');
    assert.equal(setPackageJsonVersion(text, '2.1.0', 'p.json'), text.replace('"2.0.0"', '"2.1.0"'));
    assert.throws(() => packageJsonVersion('{}', 'p.json'), /p.json: no "version"/);
  });

  const toml = [
    '[package]',
    'name = "taskmint-server"',
    'version = "2.0.0"',
    'edition = "2021"',
    '',
    '[dependencies]',
    'version = "9.9.9"',
    'serde = { version = "1" }',
    '',
  ].join('\n');

  it("reads and sets a Cargo.toml's [package] version, and nothing else", () => {
    assert.equal(cargoTomlVersion(toml, 'Cargo.toml'), '2.0.0');
    assert.equal(cargoTomlName(toml, 'Cargo.toml'), 'taskmint-server');
    assert.equal(setCargoTomlVersion(toml, '2.1.0', 'Cargo.toml'), toml.replace('"2.0.0"', '"2.1.0"'));
  });

  it('works when [package] is the last table', () => {
    const only = '[package]\nname = "a"\nversion = "1.0.0"\n';
    assert.equal(setCargoTomlVersion(only, '1.0.1', 'Cargo.toml'), only.replace('1.0.0', '1.0.1'));
  });

  it('rejects a Cargo.toml without a [package] version', () => {
    assert.throws(() => cargoTomlVersion('[workspace]\nmembers = []\n', 'Cargo.toml'), /no \[package\] table/);
    assert.throws(() => cargoTomlVersion('[package]\nname = "a"\n[x]\nversion = "1"\n', 'C.toml'), /no version/);
  });

  const lock = [
    '[[package]]',
    'name = "taskmint"',
    'version = "2.0.0"',
    '',
    '[[package]]',
    'name = "taskmint-core"',
    'version = "2.0.0"',
    '',
    '[[package]]',
    'name = "taskmint-corex"',
    'version = "0.3.0"',
    '',
  ].join('\n');

  it("sets the named packages' versions in Cargo.lock", () => {
    const next = setCargoLockVersions(lock, ['taskmint', 'taskmint-core'], '2.1.0');
    assert.equal(next, lock.replaceAll('"2.0.0"', '"2.1.0"'));
  });

  it("refuses a package Cargo.lock doesn't list", () => {
    assert.throws(() => setCargoLockVersions(lock, ['taskmint-server'], '2.1.0'), /lists taskmint-server 0 times/);
  });
});
