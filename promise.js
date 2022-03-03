const noop = "noop";

const isFunction = (f) => typeof f === "function";
const isThenable = (v) => isFunction(v?.then);

class Promisee {
  static STATE = {
    REJECTED: "rejected",
    FULFILLED: "fulfilled",
    PENDING: "pending",
  };

  subscribers = [];

  // Returns a new Promise object that is resolved with the given value.
  //  a. If the value is a thenable (i.e. has a then method), the returned promise will "follow" that thenable, adopting its eventual state;
  //  b. otherwise, the returned promise will be fulfilled with the value
  static resolve(value) {
    return new Promisee((resolve) => {
      if (isThenable(value)) {
        value.then(resolve);
      } else {
        resolve(value);
      }
    });
  }

  // Returns a new Promise object that is rejected with the given reason.
  static reject(error) {
    return new Promisee((reolve, reject) => reject(error));
  }

  // Wait for all promises to be resolved, or for any to be rejected.
  //  a. If the returned promise resolves, it is resolved with an aggregating array of the values from the resolved promises,
  //     in the same order as defined in the iterable of multiple promises
  //  b. If it rejects, it is rejected with the reason from the first promise in the iterable that was rejected.
  static all(promises) {
    return new Promisee((resolve, reject) => {
      const result = [];
      let remain = promises.length;
      promises.forEach((promise, index) => {
        promise.then((ret) => {
          remain--;
          result[index] = ret;
          if (!remain) resolve(result);
        }, reject);
      });
    });
  }

  constructor(resolver) {
    this.state = Promisee.STATE.PENDING;

    // noop: to chain promises internally
    if (resolver !== noop) {
      if (!isFunction(resolver)) {
        throw new Error(
          `Promise resolver ${typeof resolver} is not a function`
        );
      }

      try {
        resolver(this._resolve.bind(this), this._reject.bind(this));
      } catch (error) {
        this._reject(error);
      }
    }
  }

  _resolve(result) {
    this.state = Promisee.STATE.FULFILLED;
    this.result = result;

    this.subscribers.forEach((promise) => this._notify(promise));
  }

  _reject(result) {
    this.state = Promisee.STATE.REJECTED;
    this.result = result;

    this.subscribers.forEach((promise) => this._notify(promise));
  }

  // Propagate result to the chained promise
  //  a. resolving to the return value of the called handler,
  //  b. or to its original settled value if the promise was not handled (i.e. if the relevant handler onFulfilled or onRejected is not a function).
  _notify(promise) {
    const fulfilled = this.state === Promisee.STATE.FULFILLED;
    const handler = fulfilled ? promise.onFulfilled : promise.onRejected;

    queueMicrotask(() => {
      try {
        if (isFunction(handler)) {
          promise._resolve(handler(this.result));
        } else if (fulfilled) {
          promise._resolve(this.result);
        } else {
          promise._reject(this.result);
        }
      } catch (e) {
        promise._reject(e);
      }
    });
  }

  // Appends fulfillment and rejection handlers to the promise, and returns a new promise
  then(onFulfilled, onRejected) {
    const promise = new Promisee(noop);
    promise.onFulfilled = onFulfilled;
    promise.onRejected = onRejected;

    if (this.state === Promisee.STATE.PENDING) {
      this.subscribers.push(promise);
    } else {
      this._notify(promise);
    }

    return promise;
  }

  // Appends a rejection handler callback to the promise, and returns a new promise
  catch(onRejected) {
    return this.then(undefined, onRejected);
  }

  // Appends a handler to the promise, and returns a new promise that is resolved when the original promise is resolved.
  finally(onSettled) {
    const promise = new Promisee(noop);

    // onSettled will be called when the promise is settled, whether fulfilled or rejected.
    // and the promise is resolving to original promise result
    const handler = (result) => {
      onSettled?.();
      return result;
    };
    promise.onFulfilled = handler;
    promise.onRejected = handler;

    if (this.state === Promisee.STATE.PENDING) {
      this.subscribers.push(promise);
    } else {
      this._notify(promise);
    }

    return promise;
  }
}

/////////// Tests
const isEqual = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  return a === b;
};

window.originalPromise = Promise;
window.Promise = Promisee;

const testAll = [4, 3, 2, 1];
Promise.all(
  testAll.map(
    (v) => new Promise((resolve) => setTimeout(() => resolve(v), 100 * v))
  )
).then((ret) => {
  console.log("Promise.all resolve to ", ret);
  console.assert(
    isEqual(ret, testAll),
    `Promise.all should resolve when all promises fulfilled with results in order`
  );
});

Promise.resolve(1)
  .then((v) => v + 1)
  .finally(() => console.log("finally"))
  .then((v) => {
    console.assert(v === 2, "finally should resolve to original promise");
  });
