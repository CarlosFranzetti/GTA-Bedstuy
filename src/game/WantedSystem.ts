import type { CrimeType, EventBus } from '@/core/Events';

const MAX_STARS = 3;
const DECAY_SECONDS = 20;

/** Stars added per crime type. hitVehicle is a crime (resets the decay timer) but adds nothing. */
const CRIME_STARS: Record<CrimeType, number> = {
  hitPed: 1,
  hitCop: 1,
  carjack: 1,
  hitVehicle: 0,
};

export class WantedSystem {
  stars = 0;
  private sinceCrime = 0;
  private readonly off: () => void;

  constructor(private readonly events: EventBus) {
    this.off = events.on('crime', (c) => this.onCrime(c.type));
  }

  private onCrime(type: CrimeType): void {
    this.sinceCrime = 0;
    const next = Math.min(MAX_STARS, this.stars + CRIME_STARS[type]);
    this.setStars(next);
  }

  /** Raise the wanted level to at least `n` stars (missions, scripted events); never lowers it. */
  raiseTo(n: number): void {
    const next = Math.min(MAX_STARS, Math.max(0, Math.round(n)));
    if (next > this.stars) {
      this.sinceCrime = 0;
      this.setStars(next);
    }
  }

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
