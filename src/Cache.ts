import { Key, KeyIndexGetter, Keys, Memoized, Options, Values } from './types';

// utils
import { slice } from './utils';

export class Cache {
  canTransformKey: boolean;
  getKeyIndex: KeyIndexGetter;
  keys: Keys;
  options: Options;
  shouldCloneArguments: boolean;
  shouldUpdateOnAdd: boolean;
  shouldUpdateOnChange: boolean;
  shouldUpdateOnHit: boolean;
  values: Values;

  constructor(options: Options) {
    this.keys = [];
    this.values = [];
    this.options = options;

    const { isMatchingKey, maxSize } = options;

    const isMatchingKeyFunction = typeof isMatchingKey === 'function';

    if (isMatchingKeyFunction) {
      this.getKeyIndex = this._getKeyIndexFromMatchingKey;
    } else if (maxSize > 1) {
      this.getKeyIndex = this._getKeyIndexForMany;
    } else {
      this.getKeyIndex = this._getKeyIndexForSingle;
    }

    this.canTransformKey = typeof options.transformKey === 'function';
    this.shouldCloneArguments = this.canTransformKey || isMatchingKeyFunction;

    this.shouldUpdateOnAdd = typeof options.onCacheAdd === 'function';
    this.shouldUpdateOnChange = typeof options.onCacheChange === 'function';
    this.shouldUpdateOnHit = typeof options.onCacheHit === 'function';
  }

  get size() {
    return this.keys.length;
  }

  get snapshot() {
    return {
      keys: slice(this.keys, 0),
      size: this.size,
      values: slice(this.values, 0),
    };
  }

  _getKeyIndexFromMatchingKey(keyToMatch: Key) {
    const { isMatchingKey, maxSize } = this.options;
    const allKeys = this.keys;

    if (isMatchingKey(allKeys[0], keyToMatch)) {
      return 0;
    }

    if (maxSize > 1) {
      const keysLength = allKeys.length;

      for (let index = 1; index < keysLength; index++) {
        if (isMatchingKey(allKeys[index], keyToMatch)) {
          return index;
        }
      }
    }

    return -1;
  }

  _getKeyIndexForMany(keyToMatch: Key) {
    const { isEqual } = this.options;
    const allKeys = this.keys;

    const keysLength = allKeys.length;
    const keyLength = keyToMatch.length;

    let existingKey;

    for (let index = 0; index < keysLength; index++) {
      existingKey = allKeys[index];

      if (existingKey.length === keyLength) {
        let argIndex = 0;

        for (; argIndex < keyLength; argIndex++) {
          if (!isEqual(existingKey[argIndex], keyToMatch[argIndex])) {
            break;
          }
        }

        if (argIndex === keyLength) {
          return index;
        }
      }
    }

    return -1;
  }

  _getKeyIndexForSingle(keyToMatch: Key) {
    const { isEqual } = this.options;

    const existingKey = this.keys[0];
    const keyLength = existingKey.length;

    if (keyToMatch.length !== keyLength) {
      return -1;
    }

    for (let index = 0; index < keyLength; index++) {
      if (!isEqual(existingKey[index], keyToMatch[index])) {
        return -1;
      }
    }

    return 0;
  }

  add(key: Key, value: any) {
    this.orderByLru(key, value, this.size);
  }

  orderByLru(key: Key, value: any, startingIndex: number) {
    let index = startingIndex;

    while (index--) {
      this.keys[index + 1] = this.keys[index];
      this.values[index + 1] = this.values[index];
    }

    this.keys[0] = key;
    this.values[0] = value;

    const { maxSize } = this.options;

    if (startingIndex >= maxSize) {
      this.keys.length = maxSize;
      this.values.length = maxSize;
    }
  }

  updateAsyncCache(memoized: Memoized<Function>) {
    const { onCacheChange, onCacheHit } = this.options;

    const [key] = this.keys;
    const [firstValue] = this.values;

    this.values[0] = firstValue
      .then((value: any) => {
        if (this.shouldUpdateOnHit) {
          onCacheHit(this, this.options, memoized);
        }

        if (this.shouldUpdateOnChange) {
          onCacheChange(this, this.options, memoized);
        }

        return value;
      })
      .catch((error: Error) => {
        const keyIndex = this.getKeyIndex(key);

        if (keyIndex !== -1) {
          this.keys.splice(keyIndex, 1);
          this.values.splice(keyIndex, 1);
        }

        throw error;
      });
  }
}
