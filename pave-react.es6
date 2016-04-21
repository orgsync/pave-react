import React, {Component as ReactComponent} from 'react';
import {SyncPromise} from 'pave';

class Deferred {
  constructor() {
    this.promise = new SyncPromise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

const isEqualSubset = (a, b) => {
  for (let key in a) if (a[key] !== b[key]) return false;
  return true;
};

const isEqual = (a, b) => isEqualSubset(a, b) && isEqualSubset(b, a);

const flushProp = c => {
  if (!c.isStale && isEqual(c.prop, c.prevProp)) return;

  c.prevProp = c.prop;
  c.prop = {...c.prop};
  c.isStale = false;
  c.forceUpdate();
};

const shiftQueue = c => {
  const next = c.queue.shift();
  if (next) return update(c, next.options, next.deferred);

  flushProp(c);
};

const update = (c, options = {}, deferred = new Deferred()) => {
  if (c.prop.isLoading) {
    c.queue.push({options, deferred});
    flushProp(c);
    return deferred.promise;
  }

  const {manual, runOptions = {}} = options;
  if (!manual) {
    const {params} = c.prop;
    runOptions.query = c.getQuery && c.getQuery(params);
    if (!runOptions.query) {
      c.store.unwatch(c.setStale);
      deferred.resolve();
      shiftQueue(c);
      return deferred.promise;
    }

    if (!runOptions.force && c.prevParams === params) {
      const {error} = c.prop;
      if (error) deferred.reject(error); else deferred.resolve();
      shiftQueue(c);
      return deferred.promise;
    }

    c.prevParams = params;
    c.store.watch(runOptions.query, c.setStale);
  }

  c.prop.error = null;
  c.prop.isLoading = true;
  c.store.run(runOptions)
    .catch(error => c.prop.error = error)
    .then(() => {
      c.prop.isLoading = false;
      const {error} = c.prop;
      if (error) deferred.reject(error); else deferred.resolve();
      shiftQueue(c);
    });

  flushProp(c);

  return deferred.promise;
};

export const createContainer = ({getQuery, getInitialParams, store}) =>
  Component =>
    class extends ReactComponent {
      static contextTypes = Component.contextTypes;

      store = store;

      getQuery = getQuery;

      queue = [];

      prop = this.prevProp = {
        isLoading: false,

        error: null,

        params: {},

        reload: () => update(this, {runOptions: {force: true}}),

        setParams: params => {
          this.prop.params = {...this.prop.params};
          for (let key in params) this.prop.params[key] = params[key];
          return update(this);
        },

        run: runOptions => update(this, {manual: true, runOptions})
      };

      setStale = () => {
        this.isStale = true;
        if (!this.prop.isLoading) flushProp(this);
      }

      componentWillMount() {
        const {context, props, prop: {setParams}} = this;
        setParams((getInitialParams || (() => ({})))(props, context));
      }

      componentWillUnmount() {
        this.store.unwatch(this.setStale);
      }

      render() {
        return <Component {...this.props} pave={this.prop} />;
      }
    };
