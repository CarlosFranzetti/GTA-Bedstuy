// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Input } from '@/core/Input';

describe('Input virtual (touch) layer', () => {
  it('setVirtual counts as held and as an edge press once', () => {
    const input = new Input(document.body);
    input.setVirtual('KeyF', true);
    expect(input.isDown('KeyF')).toBe(true);
    expect(input.pressed('KeyF')).toBe(true);
    input.endFrame();
    expect(input.pressed('KeyF')).toBe(false);
    expect(input.isDown('KeyF')).toBe(true);
    input.setVirtual('KeyF', false);
    expect(input.isDown('KeyF')).toBe(false);
  });
  it('touch stick feeds the forward and sideways axes analogically', () => {
    const input = new Input(document.body);
    input.touchAxis.x = 0.4; input.touchAxis.y = -0.7;
    expect(input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).toBeCloseTo(-0.7);
    expect(input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'])).toBeCloseTo(0.4);
  });
  it('keyboard and stick combine but clamp to [-1, 1]', () => {
    const input = new Input(document.body);
    input.setVirtual('KeyW', true); input.touchAxis.y = 0.9;
    expect(input.axis(['KeyS'], ['KeyW'])).toBe(1);
  });
  it('addLook accumulates until endFrame', () => {
    const input = new Input(document.body);
    input.addLook(3, -2); input.addLook(1, 1);
    expect(input.mouseDX).toBe(4); expect(input.mouseDY).toBe(-1);
    input.endFrame();
    expect(input.mouseDX).toBe(0);
  });
});
