// Scripted "tester" used to validate the playtest harness end to end (no model involved).
// It walks, looks around, walks to the nearest parked car, enters it with F, drives, exits, then ends the session
// and asserts the recording artefacts.
//
// Usage: node scripts/playtest/brain-scripted.mjs <sessionDir> [--port 4402] [--attach] [--step-timeout 420] [session.mjs flags...]
//   --attach  do not start session.mjs; talk to one that is already running on <sessionDir>
// Exit code 0 = all assertions passed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
let attach = false, stepTimeout = 420;
const pass = [];
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--attach') attach = true;
  else if (argv[i] === '--step-timeout') stepTimeout = Number(argv[++i]);
  else rest.push(argv[i]);
}
if (!rest.length) { console.error('usage: node scripts/playtest/brain-scripted.mjs <sessionDir> [--attach] [--port 4402]'); process.exit(2); }
const D = resolve(rest[0]);
mkdirSync(D, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log('[brain]', ...a);

let child = null, childExit = null;
if (!attach) {
  child = spawn('node', [join(HERE, 'session.mjs'), D, ...rest.slice(1)], { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('exit', (c) => { childExit = c ?? 1; });
}
const cmdPath = join(D, 'cmd.jsonl');
const waitFor = async (path, secs) => {
  const t0 = Date.now();
  while (!existsSync(path)) {
    if (childExit !== null && !existsSync(path)) throw new Error(`session exited (${childExit}) before ${path} appeared`);
    if ((Date.now() - t0) / 1000 > secs) throw new Error(`timeout waiting for ${path}`);
    await sleep(500);
  }
};
const readState = (n) => JSON.parse(readFileSync(join(D, 'state', `step-${n}.json`), 'utf8'));

let step = 0;
async function act(thought, actions) {
  step++;
  appendFileSync(cmdPath, JSON.stringify({ step, thought, actions }) + '\n');
  await waitFor(join(D, `ready-${step}`), stepTimeout);
  const s = readState(step);
  say(`step ${step}: ${thought.slice(0, 60)} -> (${s.player.x}, ${s.player.z}) ${s.inVehicle ? 'IN CAR ' + (s.vehicle?.speedKmh ?? 0) + ' km/h' : 'on foot'}${s.prompt ? ' prompt=' + JSON.stringify(s.prompt) : ''}`);
  return s;
}
const PX_PER_DEG = Math.PI / 180 / 0.0025; // mouse look: 0.0025 rad per pixel
const nearestCar = (s) => s.nearby.find((n) => (n.type === 'vehicle' || n.type === 'cop') && !n.occupied);

let outcome = { enteredCar: false, exitedCar: false, drove: false };
let failure = null;
try {
  await waitFor(join(D, 'ready-0'), 600);
  let s = readState(0);
  say('step 0 state: street', s.street, 'hour', s.gameHour, 'nearby', s.nearby.length);

  s = await act('Looks like a busy Brooklyn street at golden hour. Let me look around before I move.', [{ look: { dx: 350, dy: 0 } }]);
  s = await act('Looking the other way to see what is behind me.', [{ look: { dx: -700, dy: 0 } }]);
  s = await act('Time to walk. I will jog forward a little with Shift held.', [{ keys: ['KeyW', 'ShiftLeft'], ms: 1200 }]);
  s = await act('Tapping the strafe keys to check the controls respond.', [{ key: 'KeyD', ms: 300 }, { key: 'KeyA', ms: 300 }]);

  // walk to the nearest car until the HUD offers "F  Enter car" (the prompt appears when the DOOR is in reach, not the car centre)
  for (let i = 0; i < 14 && !/enter/i.test(s.prompt); i++) {
    const car = nearestCar(s);
    if (!car) { s = await act('No car in sight. Walking forward to find one.', [{ look: { dx: 300, dy: 0 } }, { key: 'KeyW', ms: 800 }]); continue; }
    const turn = Math.abs(car.bearing_deg) > 8 ? { look: { dx: car.bearing_deg * PX_PER_DEG, dy: 0 } } : null;
    if (car.distance_m < 2.0) { // hugging the car without a prompt: slide along it to find the door
      s = await act(`Right beside the ${car.vehicle ?? 'car'} but no prompt yet. Sliding along it to find the door.`, [{ key: i % 2 ? 'KeyS' : 'KeyW', ms: 350 }]);
      continue;
    }
    const walk = Math.max(250, Math.min(1500, (car.distance_m - 1.8) * 330));
    s = await act(`A ${car.vehicle ?? 'car'} is ${car.distance_m} m away, ${car.direction}. Heading for its door.`, [...(turn ? [turn] : []), { key: 'KeyW', ms: walk }]);
  }
  for (let tries = 0; tries < 3 && !s.inVehicle; tries++) {
    s = await act('I am next to the car. Pressing F to get in.', [{ key: 'KeyF', tap: true }, { wait: 1200 }]);
    outcome.enteredCar = s.inVehicle;
    if (!s.inVehicle) {
      const car = nearestCar(s);
      if (car && car.distance_m > 1.5) s = await act('Not close enough, stepping toward the door.', [{ look: { dx: car.bearing_deg * PX_PER_DEG, dy: 0 } }, { key: 'KeyW', ms: 300 }]);
    }
  }
  outcome.enteredCar = s.inVehicle;
  if (s.inVehicle) {
    s = await act('I am in the car. Flooring it for a few seconds.', [{ key: 'KeyW', ms: 2500 }]);
    outcome.drove = (s.vehicle?.speedKmh ?? 0) > 3;
    s = await act('Steering right while keeping the throttle down.', [{ key: 'KeyW', ms: 1500, look: { dx: 0, dy: 0 } }, { keys: ['KeyW', 'KeyD'], ms: 1200 }]);
    s = await act('Braking to a stop with Space.', [{ key: 'Space', ms: 2500 }]);
    for (let tries = 0; tries < 3 && s.inVehicle; tries++) s = await act('Stopped. Pressing F to get out.', [{ key: 'KeyF', tap: true }, { wait: 800 }]);
    outcome.exitedCar = !s.inVehicle;
    s = await act(outcome.exitedCar ? 'Out of the car. That worked.' : 'I cannot get out of the car. Noting that as a bug.', [{ look: { dx: 200, dy: 0 } }]);
  } else {
    s = await act('I could not get into any car. Noting it and finishing.', [{ wait: 300 }]);
  }
  appendFileSync(cmdPath, JSON.stringify({ end: true, summary: `Scripted validation walk: entered car ${outcome.enteredCar}, drove ${outcome.drove}, exited ${outcome.exitedCar}.` }) + '\n');
  await waitFor(join(D, 'ended'), 180);
} catch (e) {
  failure = e;
  console.error('[brain] FAILED:', e.message);
  try { appendFileSync(cmdPath, JSON.stringify({ end: true, summary: 'brain aborted: ' + e.message }) + '\n'); } catch { /* ignore */ }
}
if (child && childExit === null) await new Promise((r) => { child.on('exit', r); setTimeout(r, 120_000); });

// ------------------------------------------------------------------------------------------------ assertions
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`[brain] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
if (failure) check('scripted run completed', false, failure.message);
const webm = join(D, 'playtest.webm');
const webmSize = existsSync(webm) ? statSync(webm).size : 0;
check('playtest.webm exists and is > 100 KB', webmSize > 100 * 1024, `${(webmSize / 1048576).toFixed(2)} MB`);

const logRows = existsSync(join(D, 'log.jsonl')) ? readFileSync(join(D, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const steps = logRows.filter((r) => r.step !== undefined);
let ok = 0;
for (const r of steps) if (existsSync(join(D, r.framePath)) && statSync(join(D, r.framePath)).size > 1000 && existsSync(join(D, r.statePath)) && existsSync(join(D, `ready-${r.step}`))) ok++;
check('100% of steps have frame + state + ready marker', steps.length > 1 && ok === steps.length, `${ok}/${steps.length} steps (incl. step 0)`);
check('transcript.md written', existsSync(join(D, 'transcript.md')) && statSync(join(D, 'transcript.md')).size > 200);

// subtitle visible in the recording: white text pixels in the bottom bar of a video frame vs. the same region of the clean screenshot
function grayRegion(input, seek) {
  const args = ['-v', 'error', ...(seek !== undefined ? ['-ss', String(seek)] : []), '-i', input, '-frames:v', '1', '-vf', 'crop=iw:ih*0.13:0:ih*0.87,format=gray', '-f', 'rawvideo', '-'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}
const stats = (buf) => { let bright = 0, sum = 0; for (const v of buf) { sum += v; if (v > 235) bright++; } return { bright, mean: sum / buf.length }; };
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 && webmSize > 0) {
  let seen = null;
  const tries = steps.filter((r) => r.tVideoThought !== undefined);
  for (const r of tries.slice(0, 12)) {
    for (const off of [0.6, 1.0, 0.3]) {
      const v = grayRegion(webm, r.tVideoThought + off), c = grayRegion(join(D, r.framePath));
      if (!v || !c) continue;
      const sv = stats(v), sc = stats(c);
      if (sv.bright >= 120 && sv.bright > sc.bright * 1.5 + 60) { seen = { step: r.step, at: +(r.tVideoThought + off).toFixed(2), videoBright: sv.bright, cleanBright: sc.bright, videoMean: +sv.mean.toFixed(1), cleanMean: +sc.mean.toFixed(1) }; break; }
    }
    if (seen) break;
  }
  check('subtitle text visible in the recording', !!seen, seen ? JSON.stringify(seen) : 'no video frame showed the bar text');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm], { encoding: 'utf8' });
  const dur = Number(probe.stdout);
  if (dur) say(`webm duration ${dur.toFixed(1)} s`);
  const mp4 = join(D, 'playtest.mp4');
  if (existsSync(mp4)) {
    const p2 = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
    say(`playtest.mp4 ${(statSync(mp4).size / 1048576).toFixed(2)} MB, ${Number(p2.stdout).toFixed(1)} s (idle time trimmed)`);
  }
} else check('subtitle text visible in the recording', false, 'ffmpeg missing or no video');

say(`outcome: ${JSON.stringify(outcome)}`);
if (!outcome.exitedCar && outcome.enteredCar) say('NOTE: the scripted brain could not leave the car (F). That is the known exit bug (lane V1), not a harness fault.');
const failed = checks.filter((c) => !c.ok);
writeFileSync(join(D, 'validation.json'), JSON.stringify({ checks, outcome, steps: steps.length - 1, webmBytes: webmSize }, null, 2));
console.log(failed.length ? `[brain] ${failed.length} check(s) FAILED` : '[brain] ALL CHECKS PASSED');
process.exit(failed.length ? 1 : 0);
