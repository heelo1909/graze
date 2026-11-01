// Labeled bot-difficulty setting, shared by the title (local play) and the online lobby.
import type { Difficulty } from '../bots/bot';
import { el, segGroup } from './dom';

export const DIFFS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Easy: slow reactions, rarely cuts you off' },
  { id: 'normal', label: 'Normal', blurb: 'Normal: quick reactions, cuts you off now and then' },
  { id: 'hard', label: 'Hard', blurb: 'Hard: sharp reactions, plans far ahead, hunts you down' },
];

const blurbOf = (d: Difficulty): string => DIFFS.find((x) => x.id === d)?.blurb ?? '';

/** "Bot difficulty" heading, Easy/Normal/Hard buttons and a line describing the picked level. */
export function difficultyPicker(initial: Difficulty, onPick: (d: Difficulty) => void): HTMLElement {
  let current = initial;
  const blurb = el('p', 'diff-blurb');
  const seg = segGroup('Bot difficulty', DIFFS.map((d) => d.label), (i) => {
    current = DIFFS[i]?.id ?? 'normal';
    paint();
    onPick(current);
  });
  const paint = (): void => {
    seg.paint(DIFFS.findIndex((d) => d.id === current));
    blurb.textContent = blurbOf(current);
  };
  paint();
  const field = el('div', 'field');
  field.append(el('span', 'field-label', 'Bot difficulty'), seg.group, blurb);
  return field;
}

/** Read-only version for joiners: the heading and the host's pick. */
export function difficultyNote(d: Difficulty): HTMLElement {
  const field = el('div', 'field');
  field.append(el('span', 'field-label', 'Bot difficulty'), el('p', 'diff-blurb', blurbOf(d)));
  return field;
}
