import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENVIRONMENTS,
  environmentMarker,
  readEnvironmentMarker,
  taskmintEnvironment,
  taskmintEnvironmentPlugin,
} from './environment.mjs';
import { deployProblem } from './check-web-environment.mjs';

describe('taskmintEnvironment', () => {
  it('is dev unless TASKMINT_ENV says production', () => {
    assert.equal(taskmintEnvironment({}), 'dev');
    assert.equal(taskmintEnvironment({ TASKMINT_ENV: '' }), 'dev');
    assert.equal(taskmintEnvironment({ TASKMINT_ENV: 'dev' }), 'dev');
    assert.equal(taskmintEnvironment({ TASKMINT_ENV: 'production' }), 'production');
  });

  it('stops on any other name', () => {
    assert.throws(() => taskmintEnvironment({ TASKMINT_ENV: 'prod' }), /can only be "production" or "dev"/);
    assert.throws(() => taskmintEnvironment({ TASKMINT_ENV: 'toString' }), /can only be/);
  });

  it('names a separate Firebase project for each environment', () => {
    assert.equal(ENVIRONMENTS.production.projectId, 'taskmint-f9a05');
    assert.equal(ENVIRONMENTS.dev.projectId, 'taskmint-dev');
  });
});

describe('the environment marker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskmint-env-'));
  const file = join(dir, 'environment.json');
  const write = contents => writeFileSync(file, contents);

  it('reads back what a build wrote', () => {
    write(JSON.stringify(environmentMarker('dev')));
    assert.deepEqual(readEnvironmentMarker(file), { environment: 'dev', projectId: 'taskmint-dev' });
  });

  it('refuses a missing file, or one that names no known environment', () => {
    assert.throws(() => readEnvironmentMarker(join(dir, 'missing.json')), /can't be read.*Build first/);
    write('not json');
    assert.throws(() => readEnvironmentMarker(file), /can't be read/);
    write('null');
    assert.throws(() => readEnvironmentMarker(file), /doesn't name a known environment/);
    write(JSON.stringify({ environment: 'staging', projectId: 'taskmint-dev' }));
    assert.throws(() => readEnvironmentMarker(file), /doesn't name a known environment/);
    write(JSON.stringify({ environment: 'dev', projectId: 'taskmint-f9a05' }));
    assert.throws(() => readEnvironmentMarker(file), /doesn't name a known environment/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('the Vite plugin', () => {
  const emitted = plugin => {
    const files = [];
    plugin.generateBundle.call({ emitFile: file => files.push(file) });
    return files;
  };

  it('defines the environment, marks dist, and titles a dev page', () => {
    const dev = taskmintEnvironmentPlugin({});
    assert.deepEqual(dev.config(), { define: { 'import.meta.env.TASKMINT_ENV': '"dev"' } });
    assert.equal(dev.transformIndexHtml('<title>TaskMint</title>'), '<title>TaskMint Dev</title>');
    assert.deepEqual(emitted(dev), [
      { type: 'asset', fileName: 'environment.json', source: '{"environment":"dev","projectId":"taskmint-dev"}\n' },
    ]);
  });

  it('leaves a production page as it is', () => {
    const production = taskmintEnvironmentPlugin({ TASKMINT_ENV: 'production' });
    assert.deepEqual(production.config(), { define: { 'import.meta.env.TASKMINT_ENV': '"production"' } });
    assert.equal(production.transformIndexHtml('<title>TaskMint</title>'), '<title>TaskMint</title>');
    assert.match(emitted(production)[0].source, /"projectId":"taskmint-f9a05"/);
  });

  it('stops the build on an unknown environment', () => {
    assert.throws(() => taskmintEnvironmentPlugin({ TASKMINT_ENV: 'staging' }), /can only be/);
  });
});

describe("Hosting's predeploy check", () => {
  const dev = environmentMarker('dev');
  const production = environmentMarker('production');

  it('lets a build go to its own project', () => {
    assert.equal(deployProblem(dev, 'taskmint-dev'), null);
    assert.equal(deployProblem(production, 'taskmint-f9a05'), null);
  });

  it('refuses a build for the other project, saying how to build the right one', () => {
    assert.match(
      deployProblem(dev, 'taskmint-f9a05'),
      /built for dev \(taskmint-dev\), not taskmint-f9a05.*TASKMINT_ENV=production/
    );
    assert.match(deployProblem(production, 'taskmint-dev'), /built for production .*TASKMINT_ENV=dev/);
  });

  it('refuses when firebase-tools named no project', () => {
    assert.match(deployProblem(dev, undefined), /GCLOUD_PROJECT is unset/);
  });
});
