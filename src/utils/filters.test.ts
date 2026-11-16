import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  accentInsensitiveRegex,
  buildPlacementFilter,
  buildTransmitterPipelineFilters,
  splitList
} from './filters';

describe('splitList', () => {
  it('splits on commas and trims items', () => {
    expect(splitList('FM, DAB+ ,TDT')).toEqual(['FM', 'DAB+', 'TDT']);
  });

  it('keeps empty items so the validator can reject them', () => {
    expect(splitList('FM,,TDT,')).toEqual(['FM', '', 'TDT', '']);
  });
});

describe('accentInsensitiveRegex', () => {
  it.each([
    ['espana', 'Radio España'],
    ['españa', 'ESPANA'],
    ['cancion', 'Canción'],
    ['catala', 'Ràdio Català'],
    ['CATALUNYA', 'catalunya'],
    ['franca', 'França'],
    ['pinguino', 'Pingüino'],
    ['ÁVILA', 'avila']
  ])('%s matches %s', (term, text) => {
    expect(accentInsensitiveRegex(term).test(text)).toBe(true);
  });

  it('is a partial match', () => {
    expect(accentInsensitiveRegex('nacio').test('Radio Nacional de España')).toBe(true);
  });

  it('does not fold unrelated letters', () => {
    expect(accentInsensitiveRegex('ana').test('Ama')).toBe(false);
  });

  it.each(['.*', 'a(b', 'R+', '[x]', 'a|b', '^$', 'a\\b'])('escapes %s literally', (term) => {
    const regex = accentInsensitiveRegex(term);
    expect(regex.test(`foo ${term} bar`)).toBe(true);
    expect(regex.test('something else entirely')).toBe(false);
  });

  it('builds classes for foldable letters and keeps a leading letter readable', () => {
    expect(accentInsensitiveRegex('Esp').source).toBe('[eéèêë]sp');
  });

  it('keeps whitespace literal instead of writing \\u escapes (rejected by PCRE2)', () => {
    const regex = accentInsensitiveRegex('a　b');
    expect(regex.source).not.toContain('\\u');
    expect(regex.test('a　b')).toBe(true);
  });

  it('matches precomposed text when the term is decomposed', () => {
    expect(accentInsensitiveRegex('España').test('España')).toBe(true);
  });
});

describe('buildPlacementFilter', () => {
  it('returns an empty filter with no query', () => {
    expect(buildPlacementFilter({})).toEqual({});
  });

  it('builds $in for list filters and regexes for text', () => {
    expect(
      buildPlacementFilter({
        id: ['507f1f77bcf86cd799439011'],
        status: ['active', 'unknown'],
        postcode: ['28001', '28002'],
        siteOperator: 'cellnex'
      })
    ).toEqual({
      _id: { $in: ['507f1f77bcf86cd799439011'] },
      status: { $in: ['active', 'unknown'] },
      postcode: { $in: ['28001', '28002'] },
      siteOperator: accentInsensitiveRegex('cellnex')
    });
  });

  it('combines every transmitter filter in one $elemMatch', () => {
    expect(
      buildPlacementFilter({
        type: ['radio'],
        technology: ['FM', 'DAB+'],
        stationName: 'espana',
        broadcaster: 'rtve'
      })
    ).toEqual({
      transmitters: {
        $elemMatch: {
          type: { $in: ['radio'] },
          technology: { $in: ['FM', 'DAB+'] },
          stationName: accentInsensitiveRegex('espana'),
          broadcaster: accentInsensitiveRegex('rtve')
        }
      }
    });
  });

  it('ANDs placement and transmitter filters', () => {
    expect(buildPlacementFilter({ status: ['active'], technology: ['TDT'] })).toEqual({
      status: { $in: ['active'] },
      transmitters: { $elemMatch: { technology: { $in: ['TDT'] } } }
    });
  });
});

describe('buildTransmitterPipelineFilters', () => {
  const ID = '507f1f77bcf86cd799439011';

  it('returns an empty placement match and no transmitter match with no query', () => {
    expect(buildTransmitterPipelineFilters({})).toEqual({
      placementMatch: {},
      transmitterMatch: undefined
    });
  });

  it('casts placement ids to ObjectId', () => {
    const { placementMatch } = buildTransmitterPipelineFilters({ placementId: [ID] });
    const ids = (placementMatch._id as { $in: unknown[] }).$in;

    expect(ids).toHaveLength(1);
    expect(ids[0]).toBeInstanceOf(Types.ObjectId);
    expect(String(ids[0])).toBe(ID);
  });

  it('keeps placement filters before $unwind only', () => {
    expect(
      buildTransmitterPipelineFilters({
        status: ['active'],
        postcode: ['28001'],
        siteOperator: 'cellnex'
      })
    ).toEqual({
      placementMatch: {
        status: { $in: ['active'] },
        postcode: { $in: ['28001'] },
        siteOperator: accentInsensitiveRegex('cellnex')
      },
      transmitterMatch: undefined
    });
  });

  it('matches transmitter filters with $elemMatch before $unwind and prefixed after', () => {
    expect(
      buildTransmitterPipelineFilters({
        status: ['active'],
        type: ['radio'],
        technology: ['FM', 'DAB+'],
        stationName: 'espana',
        broadcaster: 'rtve'
      })
    ).toEqual({
      placementMatch: {
        status: { $in: ['active'] },
        transmitters: {
          $elemMatch: {
            type: { $in: ['radio'] },
            technology: { $in: ['FM', 'DAB+'] },
            stationName: accentInsensitiveRegex('espana'),
            broadcaster: accentInsensitiveRegex('rtve')
          }
        }
      },
      transmitterMatch: {
        'transmitters.type': { $in: ['radio'] },
        'transmitters.technology': { $in: ['FM', 'DAB+'] },
        'transmitters.stationName': accentInsensitiveRegex('espana'),
        'transmitters.broadcaster': accentInsensitiveRegex('rtve')
      }
    });
  });
});
