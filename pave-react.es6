import PaveSubscription from 'pave-subscription';
import {Store, toDelta} from 'pave';
import React, {Component as ReactComponent, PropTypes} from 'react';

let contextId = 0;

export const createComponent = (Component, {
  createContextPaths = {},
  getCache = () => ({}),
  getQuery = () => {},
  params = {},
  store
}) =>
  class extends ReactComponent {
    static static = Component;

    static childContextTypes = {
      paveContextPaths: PropTypes.object,
      paveStore: PropTypes.instanceOf(Store)
    };

    static contextTypes = {
      ...Component.childContextTypes,
      paveContextPaths: PropTypes.object,
      paveStore: PropTypes.instanceOf(Store)
    };

    getChildContext() {
      return {
        paveContextPaths: this.getContextPaths(),
        paveStore: this.getStore()
      };
    }

    params = params;

    componentWillMount() {
      this.sub = new PaveSubscription({
        onChange: sub => {
          this.sub = sub;
          this.updatePave();
          sub.setQuery(this.getQuery());
        },
        query: this.getQuery(),
        store: this.getStore()
      });
    }

    componentWillReceiveProps(props, context) {
      this.updatePave(props, context);
      this.sub.setQuery(this.getQuery(props, context));
    }

    componentWillUnmount() {
      this.sub.destroy();
      this.unsetCreatedContextPaths();
    }

    getStore(props = this.props, context = this.context) {
      if (this.store) return this.store;

      this.store = store || props.paveStore || context.paveStore;
      if (!this.store) throw new Error('A Pave store is required');

      return this.store;
    }

    getContextPaths(context = this.context) {
      if (this.contextPaths) return this.contextPaths;

      const inherited = context.paveContextPaths;
      const created = {};
      for (let key in createContextPaths) {
        const {inherit = false, prefix = []} = createContextPaths[key];
        if (!inherit || !inherited[key]) {
          created[key] = prefix.concat(`${key}-${++contextId}`);
        }
      }

      this.createdContextPaths = created;

      return this.contextPaths = {...inherited, ...created};
    }

    unsetCreatedContextPaths() {
      const paths = this.createdContextPaths;
      const deltas = [];
      for (let key in paths) deltas.push(toDelta(paths[key], {$unset: true}));
      if (deltas.length) this.getStore().update(deltas);
    }

    getArgs(props = this.props, context = this.context) {
      const {params, sub: {error = null, isLoading = false} = {}} = this;
      const contextPaths = this.getContextPaths(context);
      const store = this.getStore(props, context);
      return {context, contextPaths, error, isLoading, params, props, store};
    }

    getCache(props, context) {
      return getCache(this.getArgs(props, context));
    }

    getQuery(props, context) {
      return getQuery(this.getArgs(props, context));
    }

    getPave(props, context) {
      const {params, sub, sub: {error, isLoading}} = this;
      return {
        cache: this.getCache(props, context),
        contextPaths: this.getContextPaths(context),
        error,
        isLoading,
        params,
        reload: ::sub.reload,
        run: ::sub.run,
        setParams: ::this.setParams,
        store: this.getStore(props, context)
      };
    }

    updatePave(props, context) {
      this.setState({pave: this.getPave(props, context)});
    }

    setParams(params) {
      this.params = {...this.params, ...params};
      this.sub.setQuery(this.getQuery());
    }

    render() {
      return <Component {...this.props} {...this.state} />;
    }
  };
