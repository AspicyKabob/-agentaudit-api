import fs from 'fs';
import path from 'path';

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
