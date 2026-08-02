import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { friendlyExpectationName, friendlyExpectationDescription } from '../src/utils/expectationCatalog';

beforeAll(() => i18n.changeLanguage('en'));

const t = i18n.t.bind(i18n);

describe('expectationCatalog', () => {
  test('EXP-DT-007 ("Not null") tiene nombre y descripción en lenguaje de negocio', () => {
    expect(friendlyExpectationName('EXP-DT-007', t)).toBe('Must not contain empty values');
    expect(friendlyExpectationDescription('EXP-DT-007', t)).toBe(
      'Checks that every record has a value for this field.',
    );
  });

  test('las 35 expectativas del catálogo tienen nombre y descripción amigable', () => {
    for (let n = 1; n <= 35; n += 1) {
      const expId = `EXP-DT-${String(n).padStart(3, '0')}`;
      expect(friendlyExpectationName(expId, t)).not.toBe(`dataTesting.friendlyName.${expId}`);
      expect(friendlyExpectationDescription(expId, t)).not.toBe(
        `dataTesting.friendlyDescription.${expId}`,
      );
    }
  });
});
