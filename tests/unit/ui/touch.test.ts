// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { joystickVector, TouchControls, STICK_RADIUS } from '@/ui/TouchControls';
import { Input } from '@/core/Input';

describe('joystickVector', () => {
  it('maps screen-up drag to forward', () => {
    const v = joystickVector(0, -STICK_RADIUS); expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1);
  });
  it('has a dead zone and clamps to the unit disc', () => {
    expect(joystickVector(2, 2)).toEqual({ x: 0, y: 0 });
    const v = joystickVector(300, 400); expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
});

describe('TouchControls DOM', () => {
  it('builds a stick, a look area and five buttons, and marks the root as touch', () => {
    const root = document.createElement('div'); document.body.appendChild(root);
    new TouchControls(root, new Input(document.body));
    expect(root.classList.contains('touch')).toBe(true);
    expect(root.querySelector('.tc-stick')).not.toBeNull();
    expect(root.querySelector('.tc-look')).not.toBeNull();
    expect(root.querySelectorAll('.tc-btn').length).toBe(5);
  });
});
