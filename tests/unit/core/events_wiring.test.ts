import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/Events';

describe('EventBus club / shop events', () => {
  it('delivers the interior, shop and DJ events with typed payloads', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('interior:entered', (e) => seen.push(`in:${e.id}`));
    bus.on('shop:bought', (e) => seen.push(`buy:${e.recordId}:${e.price}:${e.shop}`));
    bus.on('dj:setFinished', (e) => seen.push(`set:${e.venue}:${e.score}:${e.minutes}`));
    bus.on('mission:twist', (e) => seen.push(`twist:${e.id}`));
    bus.emit('interior:entered', { id: 'home' });
    bus.emit('shop:bought', { recordId: 'wax-01', price: 12, shop: 'wax-deli' });
    bus.emit('dj:setFinished', { venue: 'aftersloth', score: 80, minutes: 4 });
    bus.emit('mission:twist', { id: 'aftersloth-residency', text: 'x' });
    expect(seen).toEqual(['in:home', 'buy:wax-01:12:wax-deli', 'set:aftersloth:80:4', 'twist:aftersloth-residency']);
  });
});
