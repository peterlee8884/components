/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  CDK_TABLE_TEMPLATE,
  CdkTable,
  CDK_TABLE,
  _CoalescedStyleScheduler, _COALESCED_STYLE_SCHEDULER, STICKY_POSITIONING_LISTENER
} from '@angular/cdk/table';
import {ChangeDetectionStrategy, Component, Directive, ViewEncapsulation} from '@angular/core';
import {
  _DisposeViewRepeaterStrategy,
  _RecycleViewRepeaterStrategy,
  _VIEW_REPEATER_STRATEGY
} from '@angular/cdk/collections';

/**
 * Enables the recycle view repeater strategy, which reduces rendering latency. Not compatible with
 * tables that animate rows.
 *
 * 启用复写器的视图回收策略，从而减少渲染延迟。与为行设置动画的表格不兼容。
 *
 */
@Directive({
  selector: 'mat-table[recycleRows], table[mat-table][recycleRows]',
  providers: [
    {provide: _VIEW_REPEATER_STRATEGY, useClass: _RecycleViewRepeaterStrategy},
  ],
})
export class MatRecycleRows {}

/**
 * Wrapper for the CdkTable with Material design styles.
 *
 * 采用 Material Design 样式的 CdkTable 封装器。
 *
 */
@Component({
  selector: 'mat-table, table[mat-table]',
  exportAs: 'matTable',
  template: CDK_TABLE_TEMPLATE,
  styleUrls: ['table.css'],
  host: {
    'class': 'mat-table',
    '[class.mat-table-fixed-layout]': 'fixedLayout',
  },
  providers: [
    // TODO(michaeljamesparsons) Abstract the view repeater strategy to a directive API so this code
    //  is only included in the build if used.
    {provide: _VIEW_REPEATER_STRATEGY, useClass: _DisposeViewRepeaterStrategy},
    {provide: CdkTable, useExisting: MatTable},
    {provide: CDK_TABLE, useExisting: MatTable},
    {provide: _COALESCED_STYLE_SCHEDULER, useClass: _CoalescedStyleScheduler},
    // Prevent nested tables from seeing this table's StickyPositioningListener.
    {provide: STICKY_POSITIONING_LISTENER, useValue: null},
  ],
  encapsulation: ViewEncapsulation.None,
  // See note on CdkTable for explanation on why this uses the default change detection strategy.
  // tslint:disable-next-line:validate-decorators
  changeDetection: ChangeDetectionStrategy.Default,
})
export class MatTable<T> extends CdkTable<T> {
  /**
   * Overrides the sticky CSS class set by the `CdkTable`.
   *
   * `CdkTable` 设置的粘性 CSS 类。
   *
   */
  protected stickyCssClass = 'mat-table-sticky';

  /**
   * Overrides the need to add position: sticky on every sticky cell element in `CdkTable`.
   *
   * 改写在 `CdkTable` 每个粘性单元元素上添加 position: sticky 的需求。
   *
   */
  protected needsPositionStickyOnElement = false;
}
