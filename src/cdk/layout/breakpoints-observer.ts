/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {coerceArray} from '@angular/cdk/coercion';
import {Injectable, NgZone, OnDestroy} from '@angular/core';
import {combineLatest, concat, Observable, Observer, Subject} from 'rxjs';
import {debounceTime, map, skip, startWith, take, takeUntil} from 'rxjs/operators';
import {MediaMatcher} from './media-matcher';

/**
 * The current state of a layout breakpoint.
 *
 * 布局断点的当前状态。
 *
 */
export interface BreakpointState {
  /**
   * Whether the breakpoint is currently matching.
   *
   * 现在是否匹配此断点。
   *
   */
  matches: boolean;
  /**
   * A key boolean pair for each query provided to the observe method,
   * with its current matched state.
   *
   * 每次查询要提供给 observe 方法的一个 boolean 型键值对，表示它的当前匹配状态。
   *
   */
  breakpoints: {
    [key: string]: boolean;
  };
}

/**
 * The current state of a layout breakpoint.
 *
 * 布局断点的当前状态。
 *
 */
interface InternalBreakpointState {
  /**
   * Whether the breakpoint is currently matching.
   *
   * 现在是否匹配此断点。
   *
   */
  matches: boolean;
  /**
   * The media query being to be matched
   *
   * 要匹配的媒体查询
   *
   */
  query: string;
}

interface Query {
  observable: Observable<InternalBreakpointState>;
  mql: MediaQueryList;
}

/**
 * Utility for checking the matching state of @media queries.
 *
 * 检查 @media 查询的匹配状态的工具。
 *
 */
@Injectable({providedIn: 'root'})
export class BreakpointObserver implements OnDestroy {
  /**
   *  A map of all media queries currently being listened for.
   *
   * 当前正在监听的所有媒体查询的映射表。
   *
   */
  private _queries = new Map<string, Query>();
  /**
   * A subject for all other observables to takeUntil based on.
   *
   * 供所有其他可观察对象的 takeUntil 使用的主体对象（Subject）。
   *
   */
  private readonly _destroySubject = new Subject<void>();

  constructor(private _mediaMatcher: MediaMatcher, private _zone: NgZone) {}

  /**
   * Completes the active subject, signalling to all other observables to complete.
   *
   * 完成活动的主体，这会向所有其他可观察对象发出完成信号。
   *
   */
  ngOnDestroy() {
    this._destroySubject.next();
    this._destroySubject.complete();
  }

  /**
   * Whether one or more media queries match the current viewport size.
   *
   * 一个或多个媒体查询是否与当前视口的大小匹配。
   *
   * @param value One or more media queries to check.
   *
   * 要检查的一个或多个媒体查询。
   *
   * @returns Whether any of the media queries match.
   *
   * 是否任何一个媒体查询都能匹配上。
   *
   */
  isMatched(value: string | readonly string[]): boolean {
    const queries = splitQueries(coerceArray(value));
    return queries.some(mediaQuery => this._registerQuery(mediaQuery).mql.matches);
  }

  /**
   * Gets an observable of results for the given queries that will emit new results for any changes
   * in matching of the given queries.
   *
   * 获取指定查询的结果的可观察对象，这些查询会在对指定查询的匹配出现任何变化时发出新的结果。
   *
   * @param value One or more media queries to check.
   *
   * 要检查的一个或多个媒体查询。
   *
   * @returns A stream of matches for the given queries.
   *
   * 指定查询的匹配流。
   *
   */
  observe(value: string | readonly string[]): Observable<BreakpointState> {
    const queries = splitQueries(coerceArray(value));
    const observables = queries.map(query => this._registerQuery(query).observable);

    let stateObservable = combineLatest(observables);
    // Emit the first state immediately, and then debounce the subsequent emissions.
    stateObservable = concat(
      stateObservable.pipe(take(1)),
      stateObservable.pipe(skip(1), debounceTime(0)));
    return stateObservable.pipe(map(breakpointStates => {
      const response: BreakpointState = {
        matches: false,
        breakpoints: {},
      };
      breakpointStates.forEach(({matches, query}) => {
        response.matches = response.matches || matches;
        response.breakpoints[query] = matches;
      });
      return response;
    }));
  }

  /**
   * Registers a specific query to be listened for.
   *
   * 注册一个要监听的特定查询。
   *
   */
  private _registerQuery(query: string): Query {
    // Only set up a new MediaQueryList if it is not already being listened for.
    if (this._queries.has(query)) {
      return this._queries.get(query)!;
    }

    const mql = this._mediaMatcher.matchMedia(query);

    // Create callback for match changes and add it is as a listener.
    const queryObservable = new Observable((observer: Observer<MediaQueryList>) => {
      // Listener callback methods are wrapped to be placed back in ngZone. Callbacks must be placed
      // back into the zone because matchMedia is only included in Zone.js by loading the
      // webapis-media-query.js file alongside the zone.js file.  Additionally, some browsers do not
      // have MediaQueryList inherit from EventTarget, which causes inconsistencies in how Zone.js
      // patches it.
      const handler = (e: any) => this._zone.run(() => observer.next(e));
      mql.addListener(handler);

      return () => {
        mql.removeListener(handler);
      };
    }).pipe(
      startWith(mql),
      map(({matches}) => ({query, matches})),
      takeUntil(this._destroySubject)
    );

    // Add the MediaQueryList to the set of queries.
    const output = {observable: queryObservable, mql};
    this._queries.set(query, output);
    return output;
  }
}

/**
 * Split each query string into separate query strings if two queries are provided as comma
 * separated.
 *
 * 如果两个查询都是以逗号分隔的，那么就把每个查询字符串都拆分成一些独立的查询字符串
 *
 */
function splitQueries(queries: readonly string[]): readonly string[] {
  return queries.map(query => query.split(','))
                .reduce((a1, a2) => a1.concat(a2))
                .map(query => query.trim());
}
