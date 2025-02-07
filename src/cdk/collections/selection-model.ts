/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Subject} from 'rxjs';

/**
 * Class to be used to power selecting one or more options from a list.
 *
 * 用来表示从列表中选择的一个或多个选项的类。
 *
 */
export class SelectionModel<T> {
  /**
   * Currently-selected values.
   *
   * 当前选定的值。
   *
   */
  private _selection = new Set<T>();

  /**
   * Keeps track of the deselected options that haven't been emitted by the change event.
   *
   * 跟踪那些已取消选定但尚未通过变更事件发送出去的选项。
   *
   */
  private _deselectedToEmit: T[] = [];

  /**
   * Keeps track of the selected options that haven't been emitted by the change event.
   *
   * 跟踪那些已选定但尚未通过变更事件发送出去的选项。
   *
   */
  private _selectedToEmit: T[] = [];

  /**
   * Cache for the array value of the selected items.
   *
   * 缓存所有选定项的数组。
   *
   */
  private _selected: T[] | null;

  /**
   * Selected values.
   *
   * 选定的值。
   *
   */
  get selected(): T[] {
    if (!this._selected) {
      this._selected = Array.from(this._selection.values());
    }

    return this._selected;
  }

  /**
   * Event emitted when the value has changed.
   *
   * 当值发生变化时会发出本事件。
   *
   */
  readonly changed = new Subject<SelectionChange<T>>();

  constructor(
    private _multiple = false,
    initiallySelectedValues?: T[],
    private _emitChanges = true) {

    if (initiallySelectedValues && initiallySelectedValues.length) {
      if (_multiple) {
        initiallySelectedValues.forEach(value => this._markSelected(value));
      } else {
        this._markSelected(initiallySelectedValues[0]);
      }

      // Clear the array in order to avoid firing the change event for preselected values.
      this._selectedToEmit.length = 0;
    }
  }

  /**
   * Selects a value or an array of values.
   *
   * 选定一个值或一个值数组。
   *
   */
  select(...values: T[]): void {
    this._verifyValueAssignment(values);
    values.forEach(value => this._markSelected(value));
    this._emitChangeEvent();
  }

  /**
   * Deselects a value or an array of values.
   *
   * 取消选定一个值或一个值数组。
   *
   */
  deselect(...values: T[]): void {
    this._verifyValueAssignment(values);
    values.forEach(value => this._unmarkSelected(value));
    this._emitChangeEvent();
  }

  /**
   * Toggles a value between selected and deselected.
   *
   * 在选定和取消选定之间切换一个值。
   *
   */
  toggle(value: T): void {
    this.isSelected(value) ? this.deselect(value) : this.select(value);
  }

  /**
   * Clears all of the selected values.
   *
   * 清除所有选定的值。
   *
   */
  clear(): void {
    this._unmarkAll();
    this._emitChangeEvent();
  }

  /**
   * Determines whether a value is selected.
   *
   * 确定是否选定了某个值。
   *
   */
  isSelected(value: T): boolean {
    return this._selection.has(value);
  }

  /**
   * Determines whether the model does not have a value.
   *
   * 确定模型中是否没有值。
   *
   */
  isEmpty(): boolean {
    return this._selection.size === 0;
  }

  /**
   * Determines whether the model has a value.
   *
   * 确定模型中是否有值。
   *
   */
  hasValue(): boolean {
    return !this.isEmpty();
  }

  /**
   * Sorts the selected values based on a predicate function.
   *
   * 根据谓词函数对选定的值进行排序。
   *
   */
  sort(predicate?: (a: T, b: T) => number): void {
    if (this._multiple && this.selected) {
      this._selected!.sort(predicate);
    }
  }

  /**
   * Gets whether multiple values can be selected.
   *
   * 获取是否可以选择多个值。
   *
   */
  isMultipleSelection() {
    return this._multiple;
  }

  /**
   * Emits a change event and clears the records of selected and deselected values.
   *
   * 发出一个 change 事件，清除其选定值和取消选定值的记录。
   *
   */
  private _emitChangeEvent() {
    // Clear the selected values so they can be re-cached.
    this._selected = null;

    if (this._selectedToEmit.length || this._deselectedToEmit.length) {
      this.changed.next({
        source: this,
        added: this._selectedToEmit,
        removed: this._deselectedToEmit
      });

      this._deselectedToEmit = [];
      this._selectedToEmit = [];
    }
  }

  /**
   * Selects a value.
   *
   * 选定一个值。
   *
   */
  private _markSelected(value: T) {
    if (!this.isSelected(value)) {
      if (!this._multiple) {
        this._unmarkAll();
      }

      this._selection.add(value);

      if (this._emitChanges) {
        this._selectedToEmit.push(value);
      }
    }
  }

  /**
   * Deselects a value.
   *
   * 取消选定一个值。
   *
   */
  private _unmarkSelected(value: T) {
    if (this.isSelected(value)) {
      this._selection.delete(value);

      if (this._emitChanges) {
        this._deselectedToEmit.push(value);
      }
    }
  }

  /**
   * Clears out the selected values.
   *
   * 清除选定的值。
   *
   */
  private _unmarkAll() {
    if (!this.isEmpty()) {
      this._selection.forEach(value => this._unmarkSelected(value));
    }
  }

  /**
   * Verifies the value assignment and throws an error if the specified value array is
   * including multiple values while the selection model is not supporting multiple values.
   *
   * 如果指定的值数组包含多个值而选择模型不支持多个值，则验证这次赋值并抛出错误。
   *
   */
  private _verifyValueAssignment(values: T[]) {
    if (values.length > 1 && !this._multiple && (typeof ngDevMode === 'undefined' || ngDevMode)) {
      throw getMultipleValuesInSingleSelectionError();
    }
  }
}

/**
 * Event emitted when the value of a MatSelectionModel has changed.
 *
 * 当 MatSelectionModel 的值发生了变化时，发出的事件。
 *
 * @docs-private
 */
export interface SelectionChange<T> {
  /**
   * Model that dispatched the event.
   *
   * 派发此事件的模型。
   *
   */
  source: SelectionModel<T>;
  /**
   * Options that were added to the model.
   *
   * 那些添加到模型中的选项。
   *
   */
  added: T[];
  /**
   * Options that were removed from the model.
   *
   * 那些从模型中删除的选项。
   *
   */
  removed: T[];
}

/**
 * Returns an error that reports that multiple values are passed into a selection model
 * with a single value.
 *
 * 返回一个错误，它表示把多个值传入了要求单选值的选择模型中。
 *
 * @docs-private
 */
export function getMultipleValuesInSingleSelectionError() {
  return Error('Cannot pass multiple values into SelectionModel with single-value mode.');
}
