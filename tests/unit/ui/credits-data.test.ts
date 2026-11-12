import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allPeople, AI_NOTE, DISCLAIMER, DIRECTORS, OWNER, STUDIO_LEAD, TEAMS, THANKS } from '@/ui/creditsData';

const org = readFileSync('docs/swarm/ORG.md', 'utf8');
const credits = readFileSync('docs/CREDITS.md', 'utf8');
const names = allPeople().map((p) => p.name);

describe('creditsData', () => {
  it('puts the owner first and the studio lead second', () => {
    expect(names[0]).toBe('Carlos Franzetti');
    expect(OWNER.role).toMatch(/created and directed/i);
    expect(names[1]).toBe('Fable Hart');
    expect(STUDIO_LEAD.name).toBe('Fable Hart');
  });

  it('lists the four directors in order', () => {
    expect(DIRECTORS.map((d) => d.name)).toEqual(['Imani Adeyemi', 'Tomas Inkwell', 'Nia', 'Greta Voss']);
  });

  it('has no duplicate names and no empty roles', () => {
    expect(new Set(names).size).toBe(names.length);
    for (const p of allPeople()) { expect(p.name.trim()).not.toBe(''); expect(p.role.trim()).not.toBe(''); }
  });

  it('credits every chosen name of the Names table in ORG.md', () => {
    const table = org.slice(org.indexOf('| Person | Chosen name'));
    const chosen = [...table.matchAll(/^\| \w+ \| ([^|]+?) \|/gm)].map((m) => m[1]).filter((n) => n !== 'Chosen name');
    expect(chosen.length).toBeGreaterThan(10);
    for (const n of chosen) expect(names, n).toContain(n);
    expect(names).toContain('Zadie Okafor');
  });

  it('credits every worker and alumnus of the reporting lines in ORG.md', () => {
    const lines = org.slice(org.indexOf('| Team (working title)'), org.indexOf('Alumni are finished lanes'));
    const first = new Set<string>();
    for (const row of lines.split('\n').filter((l: string) => /^\| (WORLD|ART|SOUND|ENGINE)/.test(l))) {
      for (const m of row.matchAll(/(?:\*\*)?([A-Z][a-z]+)(?:\*\*)? \(/g)) first.add(m[1]);
      for (const m of row.matchAll(/\*\*([A-Z][a-z]+)\*\*/g)) first.add(m[1]);
    }
    expect(first.size).toBeGreaterThan(25);
    for (const f of first) expect(names.some((n) => n === f || n.startsWith(`${f} `)), f).toBe(true);
  });

  it('keeps the honest AI line and the title-screen disclaimer', () => {
    expect(AI_NOTE).toBe('Fable Hart and the studio team are AI agents working under Carlos Franzetti’s direction.');
    expect(DISCLAIMER).toBe('a fan tribute · not affiliated with Rockstar Games or Take-Two');
    expect(TEAMS.map((t) => t.title)).toEqual(['Streetscape', 'Inkwell', 'Airwaves', 'Foundry']);
  });

  it('names only third-party sources that docs/CREDITS.md names', () => {
    const lower = credits.toLowerCase();
    for (const term of ['ambientCG', 'Poly Haven', 'Kenney', 'Quaternius', 'MakeHuman', 'NYC Open Data', 'Kokoro', 'Boiler Room', 'Dekmantel', 'Resident Advisor', 'Mixmag', 'FACT', 'Rinse FM', 'Soulection', 'The Lot Radio', 'dublab', 'KEXP', 'Radio Paradise', 'WFMU', 'SomaFM', 'WNYC']) {
      expect(lower, term).toContain(term.toLowerCase());
      expect(THANKS.map((t) => t.text).join(' '), term).toContain(term);
    }
  });

  it('puts a Studio section at the top of docs/CREDITS.md with the same people', () => {
    expect(credits.indexOf('## Studio')).toBeGreaterThan(-1);
    expect(credits.indexOf('## Studio')).toBeLessThan(credits.indexOf('## Textures'));
    for (const n of names) expect(credits.slice(0, credits.indexOf('## Textures')), n).toContain(n);
  });
});
