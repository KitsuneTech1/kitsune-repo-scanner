import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { assessHygiene, pickScanTargets, scanContents } from './hygiene.mjs';
import { assessLegal } from './legal.mjs';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== '..'
      && !path.isAbsolute(relative));
}

async function git(repoPath, args) {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, ...args],
    {
      encoding: 'utf8',
      maxBuffer: MAX_GIT_OUTPUT,
      windowsHide: true,
    },
  );
  return stdout.trim();
}

async function allowedLocalRoots() {
  const configured = String(process.env.REPO_SCANNER_LOCAL_ROOTS || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (configured.length === 0) {
    throw new Error('local repo auditing is disabled until REPO_SCANNER_LOCAL_ROOTS is configured');
  }
  return Promise.all(configured.map((entry) => fs.promises.realpath(path.resolve(entry))));
}

async function resolveAllowedRepo(requestedPath) {
  if (typeof requestedPath !== 'string' || !path.isAbsolute(requestedPath)) {
    throw new Error('repoPath must be an absolute local path');
  }
  const repoPath = await fs.promises.realpath(requestedPath);
  const roots = await allowedLocalRoots();
  if (!roots.some((root) => isWithin(root, repoPath))) {
    throw new Error('repoPath is outside configured local roots');
  }
  const gitRoot = await fs.promises.realpath(
    await git(repoPath, ['rev-parse', '--show-toplevel']),
  );
  if (gitRoot !== repoPath) {
    throw new Error('repoPath must identify the Git repository root');
  }
  return repoPath;
}

async function trackedTree(repoPath) {
  const output = await git(repoPath, ['ls-files', '--stage', '-z']);
  const entries = [];
  for (const record of output.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    if (separator < 0) throw new Error('git returned a malformed tracked-file record');
    const [mode] = record.slice(0, separator).split(' ');
    const relativePath = record.slice(separator + 1);
    const absolutePath = path.resolve(repoPath, relativePath);
    if (!isWithin(repoPath, absolutePath)) {
      throw new Error('tracked file resolves outside the repository');
    }
    const stat = await fs.promises.lstat(absolutePath);
    entries.push({
      path: relativePath.replaceAll(path.sep, '/'),
      size: stat.isFile() && mode !== '120000' ? stat.size : 0,
      readable: stat.isFile() && mode !== '120000',
      absolutePath,
    });
  }
  return entries;
}

async function localFileContext(repoPath, entries) {
  const rootNames = [...new Set(entries.map((entry) => entry.path.split('/')[0]))];
  const rootTree = rootNames.map((name) => ({ name, type: 'file' }));
  const readmeEntry = entries.find((entry) => (
    entry.readable
    && !entry.path.includes('/')
    && /^readme(?:\.[a-z0-9_-]+)?$/i.test(entry.path)
  ));
  const readme = readmeEntry
    ? await fs.promises.readFile(readmeEntry.absolutePath, 'utf8')
    : '';
  const targets = new Set(pickScanTargets(entries));
  const fileTexts = {};
  for (const entry of entries) {
    if (entry.readable && targets.has(entry.path)) {
      fileTexts[entry.path] = await fs.promises.readFile(entry.absolutePath, 'utf8');
    }
  }
  const packageEntry = entries.find((entry) => entry.path === 'package.json' && entry.readable);
  let description = '';
  if (packageEntry) {
    try {
      description = JSON.parse(
        await fs.promises.readFile(packageEntry.absolutePath, 'utf8'),
      ).description || '';
    } catch {
      // Malformed project metadata is reported through the normal hygiene findings.
    }
  }
  const repo = {
    name: path.basename(repoPath),
    description,
    licenseInfo: rootNames.some((name) => /^licen[cs]e(?:\.|$)/i.test(name))
      ? { name: 'local license file' }
      : null,
  };
  return { repo, readme, rootTree, fileTexts };
}

export async function auditLocalRepo(requestedPath) {
  const repoPath = await resolveAllowedRepo(requestedPath);
  const entries = await trackedTree(repoPath);
  const {
    repo,
    readme,
    rootTree,
    fileTexts,
  } = await localFileContext(repoPath, entries);
  const contentFlags = scanContents(fileTexts);
  const hygiene = assessHygiene(repo, readme, entries, contentFlags);
  let legal = assessLegal(repo, readme, rootTree);
  if (hygiene.exposed && legal.oss === 'safe') {
    legal = {
      ...legal,
      oss: 'borderline',
      reason: `${legal.reason} BUT hygiene scan found exposure (${hygiene.flags.join('; ')}).`,
    };
  }
  const serious = hygiene.flags.filter(
    (finding) => /credential|private key|key format|authorization|env.key|PII|LAN IP/i.test(finding),
  );
  return {
    repo: `local:${repo.name}`,
    url: null,
    private: true,
    source: 'local-tracked-files',
    commit: await git(repoPath, ['rev-parse', 'HEAD']),
    trackedFiles: entries.length,
    exposed: hygiene.exposed,
    ossReadiness: legal.oss,
    ossReason: legal.reason,
    legalFlags: legal.flags || [],
    seriousFindings: serious,
    allFindings: hygiene.flags,
    verdict: serious.length
      ? 'DO NOT open-source until scrubbed'
      : legal.oss === 'safe'
        ? 'clean, safe to open-source'
        : 'review before open-sourcing',
  };
}
