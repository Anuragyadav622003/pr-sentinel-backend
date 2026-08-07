const http = require('http');
const crypto = require('crypto');

// Usage: set env var GITHUB_WEBHOOK_SECRET or it will default to a placeholder.
const secret = process.env.GITHUB_WEBHOOK_SECRET || 'anurag622003';

const payload = {
  action: 'opened',
  pull_request: {
    number: 2,
    title: 'Test PR from script',
    user: { login: 'script-tester' },
    head: { ref: 'feature-branch' },
    base: { ref: 'main' },
    html_url: 'https://github.com/owner/repo/pull/2',
  },
  repository: { full_name: 'owner/repo' },
};

const body = JSON.stringify(payload);
const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/webhook/github',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Hub-Signature-256': signature,
    'X-GitHub-Event': 'pull_request',
    'X-GitHub-Delivery': 'test-delivery-001',
  },
};

const req = http.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  res.on('end', () => process.stdout.write('\n'));
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(body);
req.end();

// Print a minimal note to indicate which secret was used (not the value)
console.log('Sent test webhook (secret provided? %s)', !!process.env.GITHUB_WEBHOOK_SECRET);
