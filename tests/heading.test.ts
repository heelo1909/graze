import { expect, test } from 'vitest';
import { matchHeading } from '../src/ui/heading';

const slots = [
  { name: 'Ann', color: '#fff', isBot: false },
  { name: 'Pixel', color: '#f0f', isBot: true },
];

test('human winner reads "You win", never "<Name> wins"', () => {
  expect(matchHeading(slots, 0)).toBe('You win');
});
test('bot winner reads "<Name> wins"', () => expect(matchHeading(slots, 1)).toBe('Pixel wins'));
test('no winner', () => expect(matchHeading(slots, null)).toBe('Match over'));
