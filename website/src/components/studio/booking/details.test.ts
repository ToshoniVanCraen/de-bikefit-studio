import { describe, expect, it } from 'vitest';
import {
  EMPTY_DETAILS,
  fieldOrder,
  formFieldFor,
  toBookInput,
  validateDetails,
  type DetailsValues,
} from './details';

const FORM = { address: false };

const person = (phone: string): DetailsValues => ({
  ...EMPTY_DETAILS,
  name: 'Anna Peeters',
  email: 'anna@example.com',
  phone,
});

describe('booking form phone: one +32 prefix', () => {
  it.each(['0470 12 34 56', '+32 470 12 34 56', '0032470123456', '+32 0470123456'])(
    '%j is sent as +32 470 12 34 56',
    (phone) => {
      expect(validateDetails(person(phone), FORM)).toEqual({});
      expect(toBookInput(person(phone), FORM).phone).toBe('+32 470 12 34 56');
    },
  );

  it('treats the "+32 " the field starts with as empty', () => {
    expect(validateDetails(person('+32 '), FORM).phone).toBe('Vul je telefoonnummer in.');
  });

  it('refuses what is not a number we can call', () => {
    for (const phone of ['0470', '+32 470 12 34 56 78', 'bel me', '12345678901234567890']) {
      expect(validateDetails(person(phone), FORM).phone, phone).toBe(
        'Dit telefoonnummer lijkt niet te kloppen.',
      );
    }
  });

  it('keeps a foreign number', () => {
    expect(validateDetails(person('+31 6 12345678'), FORM)).toEqual({});
    expect(toBookInput(person('+31 6 12345678'), FORM).phone).toBe('+31612345678');
  });
});

describe('one form for every fit, Jeugd included (Toshoni, 29 Oct 2026)', () => {
  it('asks the same fields and sends no guardian, whoever is fitted', () => {
    expect(fieldOrder(FORM)).toEqual([
      'name',
      'email',
      'phone',
      'age',
      'bikeType',
      'bikeModel',
      'notes',
    ]);
    expect(Object.keys(EMPTY_DETAILS).filter((key) => /child|guardian/i.test(key))).toEqual([]);
    const input = toBookInput({ ...person('0470 12 34 56'), age: '13' }, FORM);
    expect(input).toMatchObject({ name: 'Anna Peeters', email: 'anna@example.com', age: 13 });
    expect(Object.keys(input).filter((key) => /guardian/i.test(key))).toEqual([]);
  });

  it('maps a server error back onto the same fields', () => {
    expect(['name', 'email', 'phone', 'age', 'address', 'bikeDetails'].map(formFieldFor)).toEqual([
      'name',
      'email',
      'phone',
      'age',
      'street',
      'bikeModel',
    ]);
    expect(formFieldFor('guardianName')).toBeNull();
  });
});
