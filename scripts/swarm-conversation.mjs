#!/usr/bin/env node
// Turns docs/swarm/transcript.md into a readable conversation log: all-hands first, then one thread per team.
// Usage: node scripts/swarm-conversation.mjs [sinceISO] [outFile]
import { readFileSync, writeFileSync } from 'node:fs';
const since = process.argv[2] ?? '2026-11-11T11:08:00Z';
const out = process.argv[3] ?? 'docs/swarm/transcripts/latest.md';
const TEAMS = {
  Streetscape: { what: 'map, streets, buildings', lead: 'Imani', people: ['Imani', 'Rafael', 'Chidi', 'Gus', 'Noor', 'Bea'] },
  Inkwell: { what: 'characters, cars, interface, controls', lead: 'Tomas', people: ['Tomas', 'Leila', 'Priya', 'Sam', 'Kenji', 'Dmitri', 'Zadie', 'Ines', 'Rocco'] },
  Airwaves: { what: 'radio, voices, effects, music', lead: 'Nia', people: ['Nia', 'Jules', 'Andre', 'Mei', 'Cal', 'Otis'] },
  'Engine (name pending)': { what: 'stability, performance, platforms, testing', lead: 'Greta', people: ['Greta', 'Omar', 'Lena', 'Hana', 'Viktor', 'Ash', 'Theo', 'June', 'Wren'] },
};
const teamOf = (first) => Object.keys(TEAMS).find((t) => TEAMS[t].people.includes(first)) ?? null;
const text = readFileSync('docs/swarm/transcript.md', 'utf8');
const posts = [];
for (const chunk of text.split(/^### /m).slice(1)) {
  const nl = chunk.indexOf('\n');
  const head = chunk.slice(0, nl).trim();
  const m = head.match(/^(\S+) · (.+)$/);
  if (!m || m[1] < since) continue;
  const who = m[2].trim();
  const name = who.replace(/\s*\([^)]*\)\s*$/, '');
  const first = name.split(/\s+/)[0];
  const body = chunk.slice(nl + 1).trim().replace(/\s*\n\s*/g, ' ');
  if (!body) continue;
  posts.push({ t: m[1].slice(11, 16), who, name, first, body });
}
// later posts tell us the chosen full name: show it everywhere
const full = new Map();
for (const p of posts) if (p.name.includes(' ') && p.first !== 'Fable') full.set(p.first, p.name);
full.set('Fable', 'Fable Hart');
const show = (first) => full.get(first) ?? first;
const line = (p) => `**${show(p.first)}** · ${p.t}\n> ${p.body}\n`;
const allHands = posts.filter((p) => p.first === 'Fable');
let md = `# Studio conversations\n\nFrom ${since.slice(0, 16).replace('T', ' ')} UTC. Posts are shown as written, grouped by who was talking. `
  + `Times are UTC.\n\n## All hands: Fable Hart to the studio\n\n${allHands.map(line).join('\n')}\n`;
for (const [team, info] of Object.entries(TEAMS)) {
  const thread = posts.filter((p) => teamOf(p.first) === team || (p.first === 'Fable' && info.people.some((n) => p.body.includes('@' + n))));
  if (!thread.length) continue;
  const cast = [...new Set(thread.filter((p) => p.first !== 'Fable').map((p) => show(p.first)))].join(', ');
  md += `\n## ${team}: ${info.what}\n\nDirector: ${show(info.lead)}. In this thread: ${cast}.\n\n${thread.map(line).join('\n')}\n`;
}
writeFileSync(out, md);
console.log(out, posts.length, 'posts,', md.split(/\s+/).length, 'words');
