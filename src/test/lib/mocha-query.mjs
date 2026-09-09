/**
 * A jQuery-style extension of `describe` or `it` for chainable and conditional
 * skip or xfail.
 *
 * Also globally exposed as:
 *   - $it = $(it) = MochaQuery(it)
 *   - $describe = $(describe) = MochaQuery(describe)
 *
 * Usage:
 *   .skip([reason])           // skip (if not yet skipped)
 *   .skipIf(cond [, reason])  // skip if cond (and not yet skipped)
 *   .xfail([reason])          // expect fail (if not yet skipped/xfailed)
 *   .xfailIf(cond [, reason]) // expect fail if cond (and not yet skipped/xfailed)
 *
 *   $it
 *     .skipIf(cond1, skipReason1)
 *     .skipIf(cond2, skipReason2)
 *     .xfail(xfailReason)
 *     (title, callback)
 *
 *   $describe
 *     .skipIf(cond1, skipReason1)
 *     .skipIf(cond2, skipReason2)
 *     (title, callback)
 */
function MochaQuery(func, data = {}) {
  return data.proxy = new Proxy(func, Object.entries(MochaQuery.handler).reduce((obj, [key, value]) => {
    obj[key] = value.bind(this, data);
    return obj;
  }, {}));
}

MochaQuery.handler = {
  get(data, func, prop) {
    if (prop in MochaQuery.methods) {
      return MochaQuery(func, {...data, method: prop});
    }
    return Reflect.get(func, prop);
  },
  apply(data, func, thisArg, args) {
    const methods = MochaQuery.methods, method = methods[data.method];
    if (method) {
      const d = {...data, method: null};
      method.call(methods, d, ...args);
      return MochaQuery(func, d);
    }

    const [title, callback] = args;
    switch (data.mode) {
      case 'skip': {
        const reason = data.reason ? ` (${data.reason})` : '';
        const titleNew = `${title} - skipped${reason}`;
        return func.skip.call(thisArg, titleNew, callback);
      }
      case 'xfail': {
        const reason = data.reason ? ` (${data.reason})` : '';
        const titleNew = `${title} - expected failure${reason}`;
        const callbackNew = async function (...args) {
          try {
            await callback.apply(this, args);
          } catch (ex) {
            return;
          }
          throw new Error('unexpected success');
        };
        callbackNew.toString = () => callback.toString();
        return func.call(thisArg, titleNew, callbackNew);
      }
    }

    return Reflect.apply(func, thisArg, args);
  },
};

MochaQuery.methods = {
  skip(data, reason) {
    if (data.mode === 'skip') { return; }
    data.mode = 'skip';
    data.reason = reason;
  },
  skipIf(data, condition, reason) {
    if (data.mode === 'skip') { return; }
    if (condition instanceof MochaQuery.Query) {
      [condition, reason] = [condition.condition, reason || condition.reason];
    }
    if (!condition) { return; }
    data.mode = 'skip';
    data.reason = reason;
  },
  xfail(data, reason) {
    if (data.mode) { return; }
    data.mode = 'xfail';
    data.reason = reason;
  },
  xfailIf(data, condition, reason) {
    if (data.mode) { return; }
    if (condition instanceof MochaQuery.Query) {
      [condition, reason] = [condition.condition, reason || condition.reason];
    }
    if (!condition) { return; }
    data.mode = 'xfail';
    data.reason = reason;
  },
};

MochaQuery.Query = class Query {
  constructor(condition, reason) {
    this.condition = condition;
    this.reason = reason;
  }
};

export {MochaQuery};
