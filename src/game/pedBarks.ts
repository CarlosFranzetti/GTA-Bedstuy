/**
 * What pedestrians say out loud: short, neighbourly, a little funny, never about anybody's background. Lines are keyed by situation;
 * `pickBark` draws without repeating the last few lines. Pitch and rate come from the person's sex, age and a per-person hash, so a voice
 * is the same person all game (and never follows ethnicity or dress). All lines are invented.
 */
import type { Rng } from '@/core/Rng';

export type BarkKind =
  | 'greet' | 'greetMorning' | 'greetEvening' | 'stoopHello' | 'stoopReply' | 'chat' | 'chatReply' | 'laugh' | 'bye'
  | 'excuse' | 'bumped' | 'nearMiss' | 'crash' | 'horn' | 'sirens' | 'phone';

export const BARKS: Record<BarkKind, readonly string[]> = {
  greet: ['Hey, how you doing?', 'Look who it is!', 'There she is.', 'What is good?', 'Long time!', 'Hey, neighbour.', 'Yo, you good?', 'Nice day for it.'],
  greetMorning: ['Morning!', 'Morning, did you eat?', 'Good morning, neighbour.', 'Early one today.', 'Morning. Coffee first, then talk.'],
  greetEvening: ['Evening!', 'Long day?', 'Evening, stay cool.', 'Almost home, right?', 'Hey, good evening.'],
  stoopHello: ['Hey up there!', 'Nice stoop today.', 'Save me a step!', 'You live there or you just sit there?', 'How is the family?', 'Hi, neighbour!'],
  stoopReply: ['Hey, you!', 'Same spot, same me.', 'Tell everybody I said hi.', 'Doing fine, baby.', 'Keep walking, you look busy.', 'Good to see you.'],
  chat: ['So I told him, bring the receipt.', 'The train was packed again.', 'Did you see the new place on the corner?', 'You will not believe the rent.', 'My cousin is coming Sunday.', 'It was a good pie, I will say that.', 'Parking is a sport here.', 'I am just saying, the bus is late.', 'We should do a cookout.', 'No, the other one.', 'That block is getting loud.', 'I had the best sandwich today.'],
  chatReply: ['Right?', 'Stop it.', 'No way.', 'That is crazy.', 'Tell me about it.', 'Mm-hm, go on.', 'I knew it.', 'For real?', 'You are not wrong.', 'Say that again.'],
  laugh: ['Ha, stop!', 'Oh, that is good.', 'You are too much.', 'I cannot.', 'Hah, I needed that.'],
  bye: ['Catch you later.', 'Walk safe.', 'Tell your mother hi.', 'See you around.', 'Okay, I am late now.', 'Take care.'],
  excuse: ['Excuse me.', 'Pardon me.', 'Sorry, sorry.', 'Coming through, thanks.', 'After you.', 'Oh, go ahead.'],
  bumped: ['Hey, watch it!', 'Whoa, easy!', 'Excuse you!', 'Wide sidewalk, my friend.', 'You okay there?', 'Oof!'],
  nearMiss: ['Whoa! Slow down!', 'Watch the road!', 'Hey, people live here!', 'Not on the sidewalk!', 'My goodness!', 'Easy on the gas!'],
  crash: ['Oh no, did you see that?', 'Is everyone okay?', 'Somebody call someone!', 'That was loud!', 'Are they all right?'],
  horn: ['Okay, okay, we all heard you!', 'Someone is in a mood.', 'Honk louder, that will help.', 'Calm down, it is a street.'],
  sirens: ['What is going on?', 'Is that for us?', 'Not again.', 'Everybody stay calm.'],
  phone: ['Yeah, I am outside.', 'I will be there in five.', 'No, you hang up first.', 'Can you hear me now?', 'I said the blue door.'],
};

export interface BarkVoice { pitch: number; rate: number }
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** A stable voice per person: sex and age set the range, the id picks a point in it. Not tied to group or dress. */
export function voiceFor(id: string, sex: 'm' | 'f' | 'x', age: 'kid' | 'teen' | 'adult' | 'old'): BarkVoice {
  const a = hash(id + ':pitch'), b = hash(id + ':rate');
  const base = sex === 'f' ? 1.14 : sex === 'x' ? 1.0 : 0.9;
  let pitch = base + (a - 0.5) * 0.22, rate = 1.0 + (b - 0.5) * 0.22;
  if (age === 'kid') { pitch += 0.38; rate += 0.06; } else if (age === 'teen') pitch += 0.12; else if (age === 'old') { pitch -= 0.1; rate -= 0.1; }
  return { pitch: Math.max(0.5, Math.min(2, pitch)), rate: Math.max(0.7, Math.min(1.4, rate)) };
}

const recent: string[] = [];
/** One line for the situation; avoids the last eight lines said by anybody. */
export function pickBark(kind: BarkKind, rng: Rng): string {
  const list = BARKS[kind];
  let line = list[Math.floor(rng.next() * list.length) % list.length];
  for (let i = 0; i < 4 && recent.includes(line); i++) line = list[Math.floor(rng.next() * list.length) % list.length];
  recent.push(line); if (recent.length > 8) recent.shift();
  return line;
}

/** greeting by hour: morning 5-11, evening 17-22, otherwise a plain hello */
export function greetKind(hour: number): BarkKind { return hour >= 5 && hour < 11 ? 'greetMorning' : hour >= 17 && hour < 22 ? 'greetEvening' : 'greet'; }
/** how loud a situation is spoken (0..1): shouts carry, small talk does not */
export const LOUDNESS: Record<BarkKind, number> = {
  greet: 0.7, greetMorning: 0.7, greetEvening: 0.7, stoopHello: 0.9, stoopReply: 0.8, chat: 0.55, chatReply: 0.5, laugh: 0.6, bye: 0.65,
  excuse: 0.5, bumped: 0.85, nearMiss: 1, crash: 1, horn: 0.8, sirens: 0.9, phone: 0.5,
};
