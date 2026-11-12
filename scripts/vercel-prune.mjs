#!/usr/bin/env node
// Deletes old Vercel deployments of one project, keeping the newest few and whatever is live.
//
//   VERCEL_TOKEN=xxxx node scripts/vercel-prune.mjs                 dry run: lists what would be deleted, deletes nothing
//   VERCEL_TOKEN=xxxx node scripts/vercel-prune.mjs --delete        deletes
//   options: --project gta-bedstuy   --keep 5   --team <team id or slug>
//
// The token comes from vercel.com, Account Settings, Tokens. It is read from the environment only and never written anywhere.
// Kept: the newest --keep deployments that are READY, and every deployment that is the current production one.
// Vercel keeps a deleted deployment restorable for a while before removing it for good, so usage may not drop at once.
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const token = process.env.VERCEL_TOKEN;
if (!token) { console.error('Set VERCEL_TOKEN first (vercel.com, Account Settings, Tokens).'); process.exit(1); }
const project = opt('project', 'gta-bedstuy');
const keep = Number(opt('keep', '5'));
const doDelete = args.includes('--delete');
const api = async (path, init = {}) => {
  const res = await fetch('https://api.vercel.com' + path, { ...init, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

let team = opt('team', process.env.VERCEL_TEAM_ID ?? '');
if (!team) { const t = await api('/v2/teams?limit=20'); if (t.teams?.length === 1) team = t.teams[0].id; else if (t.teams?.length > 1) { console.error('Several teams: pass --team <id or slug>. Teams: ' + t.teams.map((x) => x.slug).join(', ')); process.exit(1); } }
const scope = team ? (team.startsWith('team_') ? `&teamId=${team}` : `&slug=${team}`) : '';

const proj = await api(`/v9/projects/${encodeURIComponent(project)}?${scope.slice(1)}`);
const liveIds = new Set(Object.values(proj.targets ?? {}).map((t) => t?.id).filter(Boolean));

const all = [];
for (let until = ''; ;) {
  const page = await api(`/v6/deployments?projectId=${proj.id}&limit=100${until}${scope}`);
  all.push(...page.deployments);
  if (!page.pagination?.next || page.deployments.length === 0) break;
  until = `&until=${page.pagination.next}`;
}
all.sort((a, b) => b.created - a.created);
const keepIds = new Set(all.filter((d) => (d.state ?? d.readyState) === 'READY').slice(0, keep).map((d) => d.uid));
const doomed = all.filter((d) => !keepIds.has(d.uid) && !liveIds.has(d.uid) && !liveIds.has('dpl_' + d.uid));
console.log(`${project}: ${all.length} deployments, keeping ${all.length - doomed.length} (newest ${keep} ready ones and the live one), ${doDelete ? 'deleting' : 'would delete'} ${doomed.length}.`);
if (doomed.length) console.log(`Oldest to go: ${new Date(doomed[doomed.length - 1].created).toISOString().slice(0, 10)}, newest to go: ${new Date(doomed[0].created).toISOString().slice(0, 10)}.`);
if (!doDelete) { console.log('Dry run. Add --delete to remove them.'); process.exit(0); }

let done = 0, failed = 0;
for (const d of doomed) {
  try { await api(`/v13/deployments/${d.uid}?${scope.slice(1)}`, { method: 'DELETE' }); done++; }
  catch (e) { failed++; if (failed <= 5) console.error(String(e.message)); }
  if ((done + failed) % 25 === 0) console.log(`${done + failed} of ${doomed.length}...`);
  await new Promise((r) => setTimeout(r, 120)); // stay well under the API rate limit
}
console.log(`Deleted ${done}, failed ${failed}.`);
