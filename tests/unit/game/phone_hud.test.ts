// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Phone } from '@/game/Phone';
import { PhoneHud } from '@/ui/PhoneHud';

let root: HTMLElement;
let phone: Phone;
let hud: PhoneHud;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  phone = new Phone();
  hud = new PhoneHud(root, phone);
});

const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;

describe('PhoneHud', () => {
  it('shows the button with an unread badge and a text toast, hides the panel', () => {
    expect(q('.ph-button')).not.toBeNull();
    expect(q('.ph-badge').hidden).toBe(true);
    phone.text('Ms. Odette', 'Come in.');
    hud.update();
    expect(q('.ph-badge').hidden).toBe(false);
    expect(q('.ph-badge').textContent).toBe('1');
    expect(q('.ph-toast').hidden).toBe(false);
    expect(q('.ph-toast').textContent).toContain('Text from Ms. Odette');
    expect(q('.ph-panel').hidden).toBe(true);
  });

  it('opens from the touch button / P toggle, marks texts read, lists them newest first', () => {
    phone.text('A', 'first'); phone.text('B', 'second');
    q('.ph-button').click();
    expect(hud.isOpen).toBe(true);
    expect(q('.ph-panel').hidden).toBe(false);
    expect(phone.unread).toBe(0);
    expect(q('.ph-badge').hidden).toBe(true);
    const texts = Array.from(root.querySelectorAll('.ph-text')).map((n) => n.textContent);
    expect(texts).toEqual(['second', 'first']);
    hud.toggle();
    expect(hud.isOpen).toBe(false);
    expect(q('.ph-panel').hidden).toBe(true);
  });

  it('tabs: contacts open a thread; Next shows the pointer or an empty state', () => {
    phone.text('Auntie', 'a1'); phone.text('Rico', 'r1');
    hud.toggle();
    const tabs = root.querySelectorAll<HTMLButtonElement>('.ph-tab');
    tabs[1].click();
    const names = Array.from(root.querySelectorAll('.ph-contact')).map((n) => n.textContent);
    expect(names).toEqual(['Rico', 'Auntie']);
    root.querySelectorAll<HTMLButtonElement>('.ph-contact')[1].click();
    expect(Array.from(root.querySelectorAll('.ph-text')).map((n) => n.textContent)).toEqual(['a1']);
    tabs[2].click();
    expect(root.textContent).toContain('Nothing on your list');
    phone.pointer.title = 'Crate Digger'; phone.pointer.blurb = 'Records.'; phone.pointer.x = 0; phone.pointer.z = -100;
    phone.pointer.distance = 103; phone.pointer.hint = 'Offered all day';
    phone.version++;
    hud.update('', { x: 0, z: 0 }, 0);
    expect(q('.ph-next-title').textContent).toBe('Crate Digger');
    expect(q('.ph-next-dist').textContent).toBe('105 m');
  });

  it('shows and hides the interaction prompt', () => {
    hud.update('F  Talk to Ms. Odette');
    expect(q('.ph-prompt').hidden).toBe(false);
    expect(q('.ph-prompt').textContent).toBe('F  Talk to Ms. Odette');
    hud.update('');
    expect(q('.ph-prompt').hidden).toBe(true);
  });

  it('does not toast while the phone is open', () => {
    hud.toggle();
    phone.text('A', 'while open');
    expect(q('.ph-toast').hidden).toBe(true);
  });
});
