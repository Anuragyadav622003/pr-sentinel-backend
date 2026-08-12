import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';
import https from 'https';

const privateKey = fs.readFileSync('./secrets/anurag-pr-sentinel-ai.2026-08-07.private-key.pem', 'utf8');
const auth = createAppAuth({ appId: 4505590, privateKey });
const { token } = await auth({ type: 'app' });

const options = {
  hostname: 'api.github.com',
  path: '/app',
  headers: {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'pr-sentinel',
    Accept: 'application/vnd.github+json',
  }
};

https.get(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log(data.slug);
  });
});
