#!/usr/bin/env node
const fs = require('fs');
const https = require('https');

const [, , owner, repo, prNumber, diffPath] = process.argv;
if (!owner || !repo || !prNumber) {
  console.error('Usage: node scripts/get-pr.js <owner> <repo> <pr_number> [diff-file|nodiff]');
  process.exit(2);
}
const token = process.env.GITHUB_TOKEN;
const base = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  'User-Agent': 'pr-fetch-script',
  Accept: 'application/vnd.github.v3+json',
};
if (token) headers.Authorization = `token ${token}`;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    opts.headers = headers;
    https.get(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`${res.statusCode} ${data}`));
      });
    }).on('error', reject);
  });
}

function fetchDiff(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    opts.headers = { ...headers, Accept: 'application/vnd.github.v3.diff' };
    https.get(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`${res.statusCode} ${data}`));
      });
    }).on('error', reject);
  });
}

(async () => {
  try {
    const prUrl = `${base}/pulls/${prNumber}`;
    const pr = await fetchJson(prUrl);
    const files = await fetchJson(`${prUrl}/files`);
    const commits = await fetchJson(`${prUrl}/commits`);

    console.log(`PR: ${pr.title} (#${pr.number}) by ${pr.user?.login}`);
    console.log(`Base: ${pr.base?.ref}  Head: ${pr.head?.ref}`);
    console.log('Changed files:', files.length, 'Commits:', commits.length);
    console.log('Files:');
    files.forEach((f) => console.log(`- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`));

    if (diffPath !== 'nodiff') {
      const diff = await fetchDiff(prUrl);
      const out = diffPath || `pr-${prNumber}.diff`;
      fs.writeFileSync(out, diff, 'utf8');
      console.log('Wrote diff to', out);
    }
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
})();
