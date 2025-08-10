/******************************************************************************
 * A JavaScript implementation for MapWithDefault
 *
 * ref: https://stackoverflow.com/questions/51319147/map-default-value
 *
 * Copyright Danny Lin 2017-2025
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 *****************************************************************************/

class MapWithDefault extends Map {
  constructor(fn, entries) {
    super(entries);
    this.default = fn;
  }

  get(key) {
    if (!super.has(key)) {
      super.set(key, this.default.call(this, key));
    }
    return super.get(key);
  }
}

export {
  MapWithDefault,
};
