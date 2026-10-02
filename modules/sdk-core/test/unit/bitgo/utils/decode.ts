import assert from 'assert';
import * as E from 'fp-ts/Either';
import * as t from 'io-ts';

import { decode } from '../../../../src/bitgo/utils/decode';

describe('decode', function () {
  const Options = t.intersection(
    [
      t.strict({ label: t.string, nested: t.intersection([t.type({ id: t.string }), t.partial({ note: t.string })]) }),
      t.partial({ tag: t.union([t.literal('a'), t.literal('b')]) }),
    ],
    'Options'
  );

  function errorFor(value: unknown): string {
    const result = decode('Options', Options, value);
    assert.ok(E.isLeft(result));
    return result.left;
  }

  it('leaves intersection member indices out of the reported path', function () {
    assert.strictEqual(
      errorFor({ nested: { id: 'x' } }),
      "Invalid value 'undefined' supplied to Options.label, expected string."
    );
  });

  it('leaves out member indices of nested intersections', function () {
    assert.strictEqual(
      errorFor({ label: 'l', nested: { note: 'n' } }),
      "Invalid value 'undefined' supplied to Options.nested.id, expected string."
    );
  });

  it('keeps union member indices in the reported path', function () {
    assert.strictEqual(
      errorFor({ label: 'l', nested: { id: 'x' }, tag: 'c' }),
      [
        `Invalid value '"c"' supplied to Options.tag.0, expected "a".`,
        `Invalid value '"c"' supplied to Options.tag.1, expected "b".`,
      ].join('\n')
    );
  });
});
