// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Phone } from '@/game/Phone';
import { PhoneHud } from '@/ui/PhoneHud';

let root: HTMLElement;
let phone: Phone;
let hud: PhoneHud;
let reached: string[];

const press = (code: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, key: code.replace('Key', '').replace(/^Arrow/, 'Arrow'), bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};
const activeTab = (): string => root.querySelector('.ph-tab.active')!.textContent!;

beforeEach(() => {
  document.body.className = '';
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  phone = new Phone();
  phone.text('Ms. Odette', 'Buy three records.');
  phone.text('Rico', 'Where are you?');
  hud = new PhoneHud(root, phone);
  reached = [];
  // a bubble-phase listener standing in for the game's Input: swallowed keys must never get here
  window.addEventListener('keydown', (e) => reached.push(e.code));
});

describe('phone keyboard', () => {
  it('open phone marks the body and swallows arrow keys before they reach the camera', () => {
    hud.toggle();
    expect(document.body.classList.contains('phone-open')).toBe(true);
    expect(document.body.classList.contains('ui-panel-open')).toBe(true);
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const e = press(k);
      expect(e.defaultPrevented, k).toBe(true);
    }
    expect(reached.filter((c) => c.startsWith('Arrow'))).toEqual([]);
  });

  it('left/right arrows and Q/E change tabs (wrapping)', () => {
    hud.toggle();
    expect(activeTab()).toBe('Texts');
    press('ArrowRight'); expect(activeTab()).toBe('Contacts');
    press('KeyE'); expect(activeTab()).toBe('Next');
    press('KeyE'); expect(activeTab()).toBe('Texts'); // wraps
    press('KeyQ'); expect(activeTab()).toBe('Next');
    press('ArrowLeft'); expect(activeTab()).toBe('Contacts');
  });

  it('up/down move the list selection; Enter opens the contact thread; Enter again goes back', () => {
    hud.toggle();
    press('ArrowRight'); // Contacts: Rico, Ms. Odette
    const rows = () => Array.from(root.querySelectorAll('.ph-contact'));
    expect(rows()[0].classList.contains('sel')).toBe(true);
    press('ArrowDown');
    expect(rows()[1].classList.contains('sel')).toBe(true);
    press('ArrowDown'); // clamps at the end
    expect(rows()[1].classList.contains('sel')).toBe(true);
    press('Enter');
    expect(activeTab()).toBe('Texts');
    expect(Array.from(root.querySelectorAll('.ph-text')).map((n) => n.textContent)).toEqual(['Buy three records.']);
    press('Enter');
    expect(root.querySelectorAll('.ph-text').length).toBe(2);
  });

  it('P and Escape close the phone, release the body class, and stop swallowing keys', () => {
    hud.toggle();
    expect(press('KeyP').defaultPrevented).toBe(true);
    expect(phone.isOpen).toBe(false);
    expect(document.body.classList.contains('phone-open')).toBe(false);
    expect(document.body.classList.contains('ui-panel-open')).toBe(false);
    expect(press('ArrowLeft').defaultPrevented).toBe(false);
    hud.toggle();
    press('Escape');
    expect(phone.isOpen).toBe(false);
  });

  it('WASD still reaches the game while the phone is open (walk and read the Next arrow)', () => {
    hud.toggle();
    press('KeyW');
    expect(reached).toContain('KeyW');
  });

  it('gamepad: navigate() drives tabs and closes on back', () => {
    hud.toggle();
    hud.navigate('right'); expect(activeTab()).toBe('Contacts');
    hud.navigate('left'); expect(activeTab()).toBe('Texts');
    hud.navigate('back'); expect(phone.isOpen).toBe(false);
  });

  it('releases the pointer lock when it opens (mouse look stops)', () => {
    const exit = vi.fn();
    Object.defineProperty(document, 'pointerLockElement', { value: root, configurable: true });
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exit;
    hud.toggle();
    expect(exit).toHaveBeenCalled();
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });
});
