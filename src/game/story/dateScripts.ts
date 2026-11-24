/**
 * PLACEHOLDER date scripts for ACT1-07 (BIBLE 4.8: Margo at Glenda's Long Room, Remy at Mothhouse). Adults only. The writer's
 * ACT1-07 page replaces the lines; the shape (beats, liking, endings) stays. Warm endings are suggestive at most (see DateScene).
 */
import type { DateScript } from './dates';

export const DATE_MARGO: DateScript = {
  id: 'date-margo', partner: 'Margo', adult: true, venue: 'bar-dive', invite: 'Margo: Coffee. Not a date. Park, two o\'clock. Bring the book question.', from: 14, to: 20, warmAt: 4, friendlyAt: 1,
  beats: [
    { id: 'm1', line: 'She has a paperback in her coat pocket and does not take it out.', choices: [
      { id: 'm1a', text: 'Ask what she is reading.', delta: 2, reply: 'Margo: "Third time through. It gets sadder and funnier."', flag: 'pico.margo.book' },
      { id: 'm1b', text: 'Talk about the scene.', delta: -1, reply: 'Margo: "The scene. Right."' },
      { id: 'm1c', text: 'Say nothing. Walk.', delta: 1, reply: 'Margo: "Good. I like walking more than talking."' },
    ] },
    { id: 'm2', line: 'You pass a kid\'s radio on a bench, playing a salsa record you know.', choices: [
      { id: 'm2a', text: 'Name the record.', delta: 1, reply: 'Margo: "Show-off. Correct, but show-off."' },
      { id: 'm2b', text: 'Ask her to dance, badly, on purpose.', delta: 2, reply: 'Margo laughs out loud, once, like a door banging.' },
      { id: 'm2c', text: 'Check your phone.', delta: -2, reply: 'Margo: "Take your call."' },
    ] },
    { id: 'm3', line: 'The light is going. Her bus is one block away.', choices: [
      { id: 'm3a', text: 'Walk her to the stop.', delta: 1, reply: 'Margo: "You can walk me further than that."' },
      { id: 'm3b', text: 'Say it was good to see her.', delta: 0, reply: 'Margo: "It was."' },
    ] },
  ],
  endings: {
    warm: 'The bus leaves without her. Her door is up two flights; the camera stays on the stairs. Morning: coffee, a borrowed T-shirt, a text.',
    friendly: 'She kisses your cheek at the bus stop. "Tuesday. Come by the bar."', cold: 'She waves from the window of the bus, politely.', stoodUp: 'Margo waited an hour in the park with her book, and then left.',
  },
};

export const DATE_REMY: DateScript = {
  id: 'date-remy', partner: 'Remy', adult: true, venue: 'club', invite: 'Remy: Sound check at five. Bring your own cables, they say it is a joke, it is not.', from: 15, to: 21, warmAt: 4, friendlyAt: 1,
  beats: [
    { id: 'r1', line: 'Remy is on one knee behind the booth with a torch in his teeth.', choices: [
      { id: 'r1a', text: 'Ask about the cables.', delta: 2, reply: 'Remy lights up like the room: "Finally. Someone."', flag: 'pico.remy.cables' },
      { id: 'r1b', text: 'Tell him the room sounds fine.', delta: -2, reply: 'Remy: "It does not."' },
      { id: 'r1c', text: 'Hand him the torch.', delta: 1, reply: 'Remy: "Thank you."' },
    ] },
    { id: 'r2', line: 'He plays a test tone and gestures: stand there, listen.', choices: [
      { id: 'r2a', text: 'Close your eyes.', delta: 1, reply: 'Remy, quietly: "Right? The low end sits on your chest."' },
      { id: 'r2b', text: 'Ask for more bass.', delta: -1, reply: 'Remy winces in a friendly way.' },
      { id: 'r2c', text: 'Point out the dead spot by the pillar.', delta: 2, reply: 'Remy: "You heard it too."' },
    ] },
    { id: 'r3', line: 'The room is empty and the lights are on work-setting. Nobody is in a hurry.', choices: [
      { id: 'r3a', text: 'Ask him to dinner, plainly.', delta: 2, reply: 'Remy: "Yes. Somewhere quiet. I will bring a limiter."' },
      { id: 'r3b', text: 'Say goodnight.', delta: 0, reply: 'Remy: "Goodnight, Pedro."' },
    ] },
  ],
  endings: {
    warm: 'Dinner turns into a long walk and a door that closes behind two people; the camera stays outside. Morning: toast, a borrowed sweater, a text.',
    friendly: 'He shakes your hand and holds it a second longer.', cold: 'He goes back to his cables with a small, polite nod.', stoodUp: 'Remy packed the cables away at nine.',
  },
};

export const DATE_SCRIPTS: Readonly<Record<string, DateScript>> = { margo: DATE_MARGO, remy: DATE_REMY };
