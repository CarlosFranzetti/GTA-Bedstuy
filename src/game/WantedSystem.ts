import type { CrimeType, EventBus } from '@/core/Events';

const MAX_STARS = 3;
const DECAY_SECONDS = 20;

/**
 * Stars added per crime type (BIBLE §2 ladder): a hit-and-run on a pedestrian is 2 stars, a cop hit or carjack 1,
 * repeated ramming of parked cars and pavement driving 1 each. hitVehicle is a crime (resets the decay timer)
 * but adds nothing.
 */
const CRIME_STARS: Record<CrimeType, number> = {
  hitPed: 2,
  hitCop: 1,
  carjack: 1,
  hitParked: 1,
  sidewalkDriving: 1,
  hitVehicle: 0,
  assault: 1,
  thrownHit: 1,
  gunshot: 2,
  punch: 0,
  redLight: 0,
};

/** Petty crimes never push the level above this many stars on their own. */
const CRIME_CAP: Partial<Record<CrimeType, number>> = {
  hitParked: 1,
  sidewalkDriving: 1,
  // on foot: a brawl alone never goes past one star, a thrown hit past two; a gunshot is the full ladder
  assault: 1,
  thrownHit: 2,
};

/** One-line names for the toast shown whenever a crime adds a star. */
export const CRIME_LABEL: Record<CrimeType, string> = {
  hitPed: 'Hit a pedestrian',
  hitCop: 'Hit a cop',
  carjack: 'Carjacking',
  hitParked: 'Ramming cars',
  sidewalkDriving: 'Driving on the pavement',
  hitVehicle: 'Hit a vehicle',
  assault: 'Assault',
  thrownHit: 'Throwing things at people',
  gunshot: 'Shots fired',
  punch: 'Fighting',
  redLight: 'Running a red light',
};

export class WantedSystem {
  stars = 0;
  /** Host hook: called with a one-line message whenever a crime adds a star (the HUD shows it as a toast). */
  onStarAdded: ((message: string) => void) | null = null;
  private sinceCrime = 0;
  private readonly off: () => void;
  /**
   * POLICE2: when a PoliceSystem owns the crimes (heat, witnesses) it turns this on: the 'crime' event no longer adds stars by
   * itself and the police call `addStars` / `raiseTo`. Off by default, so every old test and sim sees the old ladder.
   */
  policeDriven = false;
  /** POLICE2: true while an officer can see the player: the stars do not cool then. */
  holdDecay = false;

  constructor(private readonly events: EventBus) {
    this.off = events.on('crime', (c) => this.onCrime(c.type));
  }

  private onCrime(type: CrimeType): void {
    if (this.policeDriven) return;
    this.sinceCrime = 0;
    const cap = CRIME_CAP[type] ?? MAX_STARS;
    const next = this.stars >= cap ? this.stars : Math.min(cap, this.stars + CRIME_STARS[type]);
    const before = this.stars;
    this.setStars(next);
    if (next > before) this.onStarAdded?.(`Wanted: ${CRIME_LABEL[type]}`);
  }

  /** Raise the wanted level to at least `n` stars (missions, scripted events); never lowers it. */
  raiseTo(n: number): void {
    const next = Math.min(MAX_STARS, Math.max(0, Math.round(n)));
    if (next > this.stars) {
      this.sinceCrime = 0;
      this.setStars(next);
    }
  }

  /** POLICE2: add `n` stars for `label` (a crime the police decided on); resets the cool-down. Returns the new level. */
  addStars(n: number, label: string): number {
    const before = this.stars;
    this.sinceCrime = 0;
    this.setStars(Math.min(MAX_STARS, Math.max(0, before + n)));
    if (this.stars > before) this.onStarAdded?.(`Wanted: ${label}`);
    return this.stars;
  }

  /** POLICE2: any fresh act keeps the cool-down from running (the police saw something). */
  touch(): void { this.sinceCrime = 0; }

  /** POLICE2: drop every star (a bust). */
  clear(): void { this.sinceCrime = 0; this.setStars(0); }

  /** Seconds until the next star cools off (for the HUD); 0 with no stars. */
  get coolSecondsLeft(): number { return this.stars > 0 ? Math.max(0, DECAY_SECONDS - this.sinceCrime) : 0; }

  private setStars(n: number): void {
    if (n === this.stars) return;
    this.stars = n;
    this.events.emit('wantedChanged', { stars: n });
  }

  update(dt: number): void {
    if (this.stars <= 0) {
      this.sinceCrime = 0;
      return;
    }
    if (this.holdDecay) { this.sinceCrime = Math.min(this.sinceCrime, 1); return; }
    this.sinceCrime += dt;
    while (this.sinceCrime >= DECAY_SECONDS && this.stars > 0) {
      this.sinceCrime -= DECAY_SECONDS;
      this.setStars(this.stars - 1);
    }
  }

  dispose(): void {
    this.off();
  }
}
