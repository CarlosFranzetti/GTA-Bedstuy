/**
 * Phone threads: texts, voicemails and emails that arrive over time as the story moves. Pure data; the StoryDirector sends each
 * one when its `after` mission completes (so a thread only ever moves forward as you play), `delay` real seconds later, through
 * the existing `Phone.text` with the key `th:<id>` (so a reload or a retry never sends one twice).
 *
 * Every entry has a sender (a cast name or an extra speaker) and a trigger (the mission). Running threads:
 *   Pemberton       the landlord's passive-aggressive notices (emails, NOTICE 01 to 10; he does not exist)
 *   Garrett         the founder's pitch that keeps pivoting (six pivots and a bad week)
 *   Auntie G        forwarded warnings, ALL CAPS, until the one she types herself
 *   CB3 Neighbors   the community board's group chat ("do not reply all")
 *   invitations     the voicemails and texts that point at the side jobs (Priya, Miss Cordy, Tito, Chair Tate, Rivka)
 *
 * House rules as everywhere: punch up (landlords, founders, forms), the neighbours are the heart, dark things are written plain.
 */
import { F } from './flags';

export interface ThreadText {
  id: string;
  /** Sender: a name from cast.ts or EXTRA_SPEAKERS. */
  from: string;
  text: string;
  /** Trigger: sent when this mission completes. */
  after: string;
  /** Real seconds after the trigger. */
  delay: number;
  /** Only when this story flag is set / clear at that moment. */
  ifFlag?: string;
  unlessFlag?: string;
}

const T = (id: string, from: string, after: string, delay: number, text: string, rule: { ifFlag?: string; unlessFlag?: string } = {}): ThreadText => ({ id, from, text, after, delay, ...rule });

export const THREADS: readonly ThreadText[] = [
  // ---- Pemberton: NOTICE 01 to 10 (emails)
  T('pem-01', 'Pemberton', 'bodega-run', 300, 'Subject: Welcome to your building (NOTICE 01). We are delighted to remind you that the building has no "issues", only opportunities to be patient. Direct all concerns to the portal. The portal is under construction.'),
  T('pem-02', 'Pemberton', 'notice-of-intent', 200, 'Subject: NOTICE 02. Heat is provided on a seasonal basis. The season is under review. A committee has been formed. The committee has been formed in a warm room.'),
  T('pem-03', 'Pemberton', 'public-comment', 240, 'Subject: NOTICE 03. Per my last notice, which you did not read: please stop using the word "leak". Moisture events are a normal part of a building\'s life cycle. So are residents.'),
  T('pem-04', 'Pemberton', 'back-rent', 200, 'Subject: NOTICE 04. Rent is due on the 1st. The 1st is a state of mind. Late fee: also a state of mind, $85.'),
  T('pem-05', 'Pemberton', 'fleece-vest', 200, 'Subject: NOTICE 05. We are aware that residents are "talking". Talking is not covered by your lease. Please see Section 14(c): Vibes.'),
  T('pem-06', 'Pemberton', 'open-house', 200, 'Subject: NOTICE 06. The roof deck is closed for reimagining. There is no roof deck. We are reimagining one. Please enjoy the idea of it responsibly.'),
  T('pem-07', 'Pemberton', 'repo-the-repo', 200, 'Subject: NOTICE 07. Package theft is rising. Residents are asked to stop receiving packages.'),
  T('pem-08', 'Pemberton', 'crate-expectations', 220, 'Subject: NOTICE 08. The elevator is out of service. There is no elevator. The sign has said "out of service" since 2009 and we see no reason to be hasty.'),
  T('pem-09', 'Pemberton', 'smoke-signals', 300, 'Subject: NOTICE 09. We are aware of the fire. We are aware of your feelings about the fire. Please send both to the portal, which is down.'),
  T('pem-10a', 'Pemberton', 'last-call-on-throop', 240, 'Subject: NOTICE 10. This portfolio has been sold to a land trust. We wish you well. We wish ourselves better. This inbox will no longer be monitored, as before.', { ifFlag: F.END_TRUST }),
  T('pem-10b', 'Pemberton', 'last-call-on-throop', 240, 'Subject: NOTICE 10. Welcome to Parallax Living. All previous notices are rescinded, except the ones that are not. Please enjoy your new notices.', { ifFlag: F.END_BUYOUT }),
  T('pem-10c', 'Pemberton', 'last-call-on-throop', 240, 'Subject: NOTICE 10. Your new landlord is a familiar face. He asks that you stop saying "familiar". The heat is on. I am asked to say it twice, so you know it is true.', { ifFlag: F.END_LANDLORD }),

  // ---- Garrett: the pitch that keeps pivoting
  T('gar-01', 'Garrett', 'public-comment', 150, 'hey!! Garrett (BlockBlock). saw you at the CB meeting, great energy. we are building the stoop layer of the internet. coffee? i am free any time between 3 and 3:15'),
  T('gar-02', 'Garrett', 'handle-with-care', 170, 'quick update, we pivoted. we are not a stoop protocol anymore, we are "hyperlocal trust infrastructure". same deck, new font'),
  T('gar-03', 'Garrett', 'back-rent', 240, 'pivot #3: we are a DAO now. everyone on the block is a member. membership is mandatory. it is decentralised mandatory'),
  T('gar-04', 'Garrett', 'fleece-vest', 260, 'btw have you thought about tokenising your stoop? you would retain 40% of the sitting'),
  T('gar-05', 'Garrett', 'open-house', 240, 'pivot #4: wellness. Stillwater is a client now. Hallie says i have "a lot of energy". i do. it is seed-stage energy'),
  T('gar-06', 'Garrett', 'walk-dee-home', 260, 'pivot #5: AI. we added "AI" to the deck. it is the same deck. the AI is me'),
  T('gar-07', 'Garrett', 'repo-the-repo', 260, 'pivot #6: dog wellness. dogs have no stakeholders, dogs have only stoops. this is the vision. please share the vision with a dog'),
  T('gar-08', 'Garrett', 'the-binder', 200, 'i deleted the Binder scans. all of them. i read page 41 first. page 41 made me call my mom. thank you? sorry? both'),
  T('gar-09', 'Garrett', 'smoke-signals', 420, 'hey. i heard about the fire. i am not going to pitch you.'),
  T('gar-10', 'Garrett', 'smoke-signals', 540, 'ok i started a pitch about fire safety. it was bad. i deleted it. i am sorry. is everyone ok'),
  T('gar-11', 'Garrett', 'borough-hall-express', 300, 'update: runway is 11 days. no one needs to know. i told my mom we are "scaling". she asked if scaling is the same as fish'),
  T('gar-12', 'Garrett', 'last-call-on-throop', 300, 'final pivot: i am moving to Queens. going to try being a person. wish me luck. also thank you for the casserole node. it was the only node that ever worked'),

  // ---- Auntie G: forwarded warnings
  T('aun-01', 'Auntie G', 'notice-of-intent', 330, 'FWD: FWD: FWD: DO NOT OPEN. A MAN IN FLATBUSH OPENED AN EMAIL FROM A PRINCE AND NOW HE HAS NO STOOP.'),
  T('aun-02', 'Auntie G', 'handle-with-care', 330, 'FWD: IF YOU READ THIS YOU HAVE ONE MORE DAY OF GOOD LUCK. IF YOU DO NOT FORWARD YOU WILL STEP IN SOMETHING.'),
  T('aun-03', 'Auntie G', 'back-rent', 330, 'FWD: THE PIGEONS ARE REPORTING TO SOMEONE. WATCH THE PIGEONS. I AM NOT SAYING WHO.'),
  T('aun-04', 'Auntie G', 'fleece-vest', 330, 'FWD: SOMEONE IS GOING DOOR TO DOOR WITH A CLIPBOARD AND A SMILE. THE SMILE IS HOW THEY GET YOU. DO NOT SMILE BACK.'),
  T('aun-05', 'Auntie G', 'open-house', 330, 'FWD: NEW SCAM. THEY SAY "COMMUNITY PARTNER". HALLIE I LOVE YOU THIS IS NOT ABOUT YOU.'),
  T('aun-06', 'Auntie G', 'walk-dee-home', 330, 'FWD: WHITE VAN ON GREENE. NO NAME ON THE SIDE. A VAN WITHOUT A NAME IS A VAN WITH A PLAN. I AM NOT ASKING YOU TO GO. I AM TELLING YOU WHERE IT IS.'),
  T('aun-07', 'Auntie G', 'repo-the-repo', 330, 'FWD: CASSEROLE RECALL. IF YOUR CASSEROLE HAS A BLUE LID IT IS MINE. RETURN IT. NO QUESTIONS. SEVERAL QUESTIONS.'),
  T('aun-08', 'Auntie G', 'crate-expectations', 360, 'I am not forwarding this one. I am typing it. Odette closed. Thirty-eight years. I am on my stoop and I cannot see the shutter from here, and I am glad.'),
  T('aun-09', 'Auntie G', 'smoke-signals', 450, 'Come by when you can. I have something to tell you. Bring nothing. Bring yourself.'),

  // ---- CB3 Neighbors: the board's group chat
  T('cb3-01', 'CB3 Neighbors', 'public-comment', 360, 'Chair Tate added you to "CB3 Neighbors (do not reply all)". Mr. Alvin: reply all. Mr. Alvin: reply all again.'),
  T('cb3-02', 'CB3 Neighbors', 'handle-with-care', 400, 'Hallie: hi all!! can we hold space for the agenda?? Mr. Alvin: The agenda is not a space. Hallie: that is so true. Mr. Alvin: It is not a compliment.'),
  T('cb3-03', 'CB3 Neighbors', 'back-rent', 400, 'Chair Tate: Reminder, public comment is THREE minutes. Mr. Alvin: It was three minutes and fourteen seconds last time. I timed it. Chair Tate: You timed yourself.'),
  T('cb3-04', 'CB3 Neighbors', 'fleece-vest', 400, 'Garrett: hey all, new here! would love to workshop a block-chain for the block. Mr. Alvin: We have a chain. It is on my gate. Garrett: is it open-source. Mr. Alvin: It is open. It is a gate.'),
  T('cb3-05', 'CB3 Neighbors', 'open-house', 400, 'Rivka: The minutes from the last meeting are attached. They are also correct. Mr. Alvin: I object to the word "correct". Rivka: Noted. It is correct that you object.'),
  T('cb3-06', 'CB3 Neighbors', 'walk-dee-home', 400, 'Chair Tate: The vote to rename the block "Throop Row District" is Thursday. Quorum is 11. Last time we were 9. Two of them were pigeons. Tito: they were visiting.'),
  T('cb3-07', 'CB3 Neighbors', 'crate-expectations', 420, 'Priya: Off the record, a form has been lost. I am telling this group because I cannot tell the form. Mr. Alvin: Noted. Not on the record. Priya: Thank you. Not on any record.'),
  T('cb3-08', 'CB3 Neighbors', 'smoke-signals', 500, 'Chair Tate: Thursday\'s meeting is moved to the church. Bring blankets. Bring anyone. We will not take attendance.'),
  T('cb3-09a', 'CB3 Neighbors', 'borough-hall-express', 420, 'Mr. Alvin: I have an announcement. Chair Tate: You have three minutes. Mr. Alvin: I need one sentence. I was wrong about the air rights, and I am sorry. Chair Tate: ... Mr. Alvin: That was twelve seconds. I timed it.', { ifFlag: F.ALVIN_EXPOSED }),
  T('cb3-09b', 'CB3 Neighbors', 'borough-hall-express', 420, 'Mr. Alvin: A sentence for the record. Thank you for the loading bay. Chair Tate: Noted. Mr. Alvin: I am not timing it. Chair Tate: Mr. Greaves. Mr. Alvin: I am not.', { ifFlag: F.ALVIN_SPARED }),
  T('cb3-10', 'CB3 Neighbors', 'gavel-to-gavel', 200, 'Chair Tate: For the record, the board was moved. Mr. Alvin: By what? Chair Tate: A kick drum. Mr. Alvin: I second the kick drum.'),

  // ---- Invitations: the side jobs begin with a call, a voicemail or a text
  T('inv-rivka', 'Rivka', 'handle-with-care', 300, 'Rivka, copy shop. I print. I do not talk. Today I will talk. Odette needs a stamp. Three, actually. Come when you have a pen. Not that pen.'),
  T('inv-pemberton', 'Pemberton', 'notice-of-intent', 420, 'Subject: Courier opportunity. Our super has transitioned to opportunities. Compensation is competitive with nothing. A milk crate of notices is on the stoop of the building on the west side of Throop.'),
  T('inv-priya', 'Priya', 'fleece-vest', 160, 'Hi, Priya, Bureau of Buildings. Off the record. A friend says you are good at staying quiet. After 8 tonight, east edge of the map, Garvey side. I need a second pair of eyes. Bring nothing that beeps.'),
  T('inv-cordy', 'Miss Cordy', 'open-house', 200, 'Voicemail (0:48): Baby, it is Cordelia. I called to tell you something and now I have forgotten it. It will come back. It always comes back. Eat something.'),
  T('inv-tito', 'Tito', 'walk-dee-home', 380, 'Roof of 411. If you ever see a flock of forty with a leader that refuses to fly, that is mine. Call me. Or yell. Birds like yelling, they just do not like being told what to do.'),
  T('inv-tate', 'Chair Tate', 'open-decks', 260, 'Mr. Greaves says you have decks. I say you have a pulse. Both help. Keep Thursday evening free. I may need a miracle in a church lot.'),
  T('inv-hallie', 'Hallie', 'open-house', 560, 'hi!! no pressure at all but Bryce has been at a "silent thing" since Sunday and i just want to know if silence is supposed to have a front door buzzer. call me? or just show up. i will be in the van'),
];

/** Texts triggered by one mission, in delay order. */
export function threadsFor(missionId: string): ThreadText[] {
  return THREADS.filter((t) => t.after === missionId).sort((a, b) => a.delay - b.delay);
}
