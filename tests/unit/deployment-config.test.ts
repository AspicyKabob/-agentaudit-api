import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');

describe('Railway deployment configuration', () => {
  it('runs migrations before deployment and starts the server without migration repair', () => {
    const railway = JSON.parse(
      fs.readFileSync(path.join(root, 'railway.json'), 'utf8')
    );
    const entrypoint = fs.readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');

    expect(railway.deploy.preDeployCommand).toBe(
      'node_modules/.bin/prisma migrate deploy'
    );
    expect(railway.deploy.startCommand).toBe('./entrypoint.sh');
    expect(entrypoint).toContain('exec node dist/server.js');
    expect(entrypoint).toContain('node_modules/.bin/prisma migrate deploy');
    expect(entrypoint).not.toContain('migrate resolve');
  });
});

describe('public status hosting', () => {
  it('builds a standalone bundle containing only the public status assets', () => {
    execFileSync(process.execPath, ['scripts/build-status.js'], { cwd: root });
    const directory = path.join(root, 'dist-status');
    expect(fs.readdirSync(directory).sort()).toEqual(['index.html', 'status.js']);
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    expect(html).toContain('src="status.js"');
    expect(html).not.toContain('dashboard.js');
  });

  it('publishes only the isolated artifact with scoped deployment permissions', () => {
    const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/status-pages.yml'), 'utf8'));
    const artifact = workflow.jobs.build.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-pages-artifact@'));
    expect(artifact.with.path).toBe('dist-status');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
  });

  it('requires explicit manual opt-in before sending a synthetic monitoring event', () => {
    const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/verify-monitoring.yml'), 'utf8'));
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch.inputs.send_event.default).toBe(false);
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });
});
