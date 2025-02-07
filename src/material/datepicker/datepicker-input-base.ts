/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {BooleanInput, coerceBooleanProperty} from '@angular/cdk/coercion';
import {DOWN_ARROW} from '@angular/cdk/keycodes';
import {
  Directive,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnDestroy,
  Optional,
  Output,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  ValidationErrors,
  Validator,
  ValidatorFn,
} from '@angular/forms';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MatDateFormats,
} from '@angular/material/core';
import {Subscription, Subject} from 'rxjs';
import {createMissingDateImplError} from './datepicker-errors';
import {
  ExtractDateTypeFromSelection,
  MatDateSelectionModel,
  DateSelectionModelChange,
} from './date-selection-model';

/**
 * An event used for datepicker input and change events. We don't always have access to a native
 * input or change event because the event may have been triggered by the user clicking on the
 * calendar popup. For consistency, we always use MatDatepickerInputEvent instead.
 *
 * 用于日期选择器的输入框和变更事件。我们并不总是能访问原生的 input 或者 change 事件，因为用户点击日历弹出窗口时可能会触发该事件。为了保持一致性，我们总是要改用 MatDatepickerInputEvent。
 *
 */
export class MatDatepickerInputEvent<D, S = unknown> {
  /**
   * The new value for the target datepicker input.
   *
   * 目标日期选择器输入框控件的新值。
   *
   */
  value: D | null;

  constructor(
      /**
       * Reference to the datepicker input component that emmited the event.
       *
       * 到发出此事件的日期选择器输入框控件的引用。
       *
       */
      public target: MatDatepickerInputBase<S, D>,
      /** Reference to the native input element associated with the datepicker input. */
      public targetElement: HTMLElement) {
    this.value = this.target.value;
  }
}

/**
 * Function that can be used to filter out dates from a calendar.
 *
 * 可以用来过滤日历中日期的函数。
 *
 */
export type DateFilterFn<D> = (date: D | null) => boolean;

/**
 * Base class for datepicker inputs.
 *
 * 日期选择器输入框的基类。
 *
 */
@Directive()
export abstract class MatDatepickerInputBase<S, D = ExtractDateTypeFromSelection<S>>
  implements ControlValueAccessor, AfterViewInit, OnChanges, OnDestroy, Validator {

  /**
   * Whether the component has been initialized.
   *
   * 该组件是否已初始化。
   *
   */
  private _isInitialized: boolean;

  /**
   * The value of the input.
   *
   * 输入框的值。
   *
   */
  @Input()
  get value(): D | null {
    return this._model ? this._getValueFromModel(this._model.selection) : this._pendingValue;
  }
  set value(value: D | null) {
    this._assignValueProgrammatically(value);
  }
  protected _model: MatDateSelectionModel<S, D> | undefined;

  /**
   * Whether the datepicker-input is disabled.
   *
   * datepicker-input 是否已禁用了。
   *
   */
  @Input()
  get disabled(): boolean { return !!this._disabled || this._parentDisabled(); }
  set disabled(value: boolean) {
    const newValue = coerceBooleanProperty(value);
    const element = this._elementRef.nativeElement;

    if (this._disabled !== newValue) {
      this._disabled = newValue;
      this.stateChanges.next(undefined);
    }

    // We need to null check the `blur` method, because it's undefined during SSR.
    // In Ivy static bindings are invoked earlier, before the element is attached to the DOM.
    // This can cause an error to be thrown in some browsers (IE/Edge) which assert that the
    // element has been inserted.
    if (newValue && this._isInitialized && element.blur) {
      // Normally, native input elements automatically blur if they turn disabled. This behavior
      // is problematic, because it would mean that it triggers another change detection cycle,
      // which then causes a changed after checked error if the input element was focused before.
      element.blur();
    }
  }
  private _disabled: boolean;

  /**
   * Emits when a `change` event is fired on this `<input>`.
   *
   * `<input>` 上触发 `change` 事件时发出通知。
   *
   */
  @Output() readonly dateChange: EventEmitter<MatDatepickerInputEvent<D, S>> =
      new EventEmitter<MatDatepickerInputEvent<D, S>>();

  /**
   * Emits when an `input` event is fired on this `<input>`.
   *
   * `<input>` 上触发 `input` 事件时发出通知。
   *
   */
  @Output() readonly dateInput: EventEmitter<MatDatepickerInputEvent<D, S>> =
      new EventEmitter<MatDatepickerInputEvent<D, S>>();

  /**
   * Emits when the internal state has changed
   *
   * 当内部状态发生变化时触发
   *
   */
  readonly stateChanges = new Subject<void>();

  _onTouched = () => {};
  _validatorOnChange = () => {};

  private _cvaOnChange: (value: any) => void = () => {};
  private _valueChangesSubscription = Subscription.EMPTY;
  private _localeSubscription = Subscription.EMPTY;

  /**
   * Since the value is kept on the model which is assigned in an Input,
   * we might get a value before we have a model. This property keeps track
   * of the value until we have somewhere to assign it.
   *
   * 由于这个值保存在由输入属性赋值的模型上的，所以在有模型之前，我们就可能得到了一个值。这个属性会跟踪这个值，直到我们在别的地方对它赋值为止。
   *
   */
  private _pendingValue: D | null;

  /**
   * The form control validator for whether the input parses.
   *
   * 表单控件验证器，用于判断输入值是否解析过。
   *
   */
  private _parseValidator: ValidatorFn = (): ValidationErrors | null => {
    return this._lastValueValid ?
        null : {'matDatepickerParse': {'text': this._elementRef.nativeElement.value}};
  }

  /**
   * The form control validator for the date filter.
   *
   * 日期过滤器的表单控件验证器
   *
   */
  private _filterValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const controlValue = this._dateAdapter.getValidDateOrNull(
      this._dateAdapter.deserialize(control.value));
    return !controlValue || this._matchesFilter(controlValue) ?
        null : {'matDatepickerFilter': true};
  }

  /**
   * The form control validator for the min date.
   *
   * 最小日期的表单控件验证器。
   *
   */
  private _minValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const controlValue = this._dateAdapter.getValidDateOrNull(
      this._dateAdapter.deserialize(control.value));
    const min = this._getMinDate();
    return (!min || !controlValue ||
        this._dateAdapter.compareDate(min, controlValue) <= 0) ?
        null : {'matDatepickerMin': {'min': min, 'actual': controlValue}};
  }

  /**
   * The form control validator for the max date.
   *
   * 表单控件验证器的最大日期。
   *
   */
  private _maxValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const controlValue = this._dateAdapter.getValidDateOrNull(
      this._dateAdapter.deserialize(control.value));
    const max = this._getMaxDate();
    return (!max || !controlValue ||
        this._dateAdapter.compareDate(max, controlValue) >= 0) ?
        null : {'matDatepickerMax': {'max': max, 'actual': controlValue}};
  }

  /**
   * Gets the base validator functions.
   *
   * 获取基本的验证函数。
   *
   */
  protected _getValidators(): ValidatorFn[] {
    return [this._parseValidator, this._minValidator, this._maxValidator, this._filterValidator];
  }

  /**
   * Gets the minimum date for the input. Used for validation.
   *
   * 获取输入框的最小日期。用于验证。
   *
   */
  abstract _getMinDate(): D | null;

  /**
   * Gets the maximum date for the input. Used for validation.
   *
   * 获取输入框的最大日期。用于验证。
   *
   */
  abstract _getMaxDate(): D | null;

  /**
   * Gets the date filter function. Used for validation.
   *
   * 获取日期过滤函数。用于验证。
   *
   */
  protected abstract _getDateFilter(): DateFilterFn<D> | undefined;

  /**
   * Registers a date selection model with the input.
   *
   * 为输入注册一个日期选择模型。
   *
   */
  _registerModel(model: MatDateSelectionModel<S, D>): void {
    this._model = model;
    this._valueChangesSubscription.unsubscribe();

    if (this._pendingValue) {
      this._assignValue(this._pendingValue);
    }

    this._valueChangesSubscription = this._model.selectionChanged.subscribe(event => {
      if (this._shouldHandleChangeEvent(event)) {
        const value = this._getValueFromModel(event.selection);
        this._lastValueValid = this._isValidValue(value);
        this._cvaOnChange(value);
        this._onTouched();
        this._formatValue(value);
        this.dateInput.emit(new MatDatepickerInputEvent(this, this._elementRef.nativeElement));
        this.dateChange.emit(new MatDatepickerInputEvent(this, this._elementRef.nativeElement));
      }
    });
  }

  /**
   * Opens the popup associated with the input.
   *
   * 打开与该输入框关联的弹出窗口。
   *
   */
  protected abstract _openPopup(): void;

  /**
   * Assigns a value to the input's model.
   *
   * 为输入框的模型赋值。
   *
   */
  protected abstract _assignValueToModel(model: D | null): void;

  /**
   * Converts a value from the model into a native value for the input.
   *
   * 将模型中的值转换为输入框的原生值。
   *
   */
  protected abstract _getValueFromModel(modelValue: S): D | null;

  /**
   * Combined form control validator for this input.
   *
   * 该输入框的组合表单控件验证器。
   *
   */
  protected abstract _validator: ValidatorFn | null;

  /**
   * Predicate that determines whether the input should handle a particular change event.
   *
   * 一个谓词函数，用于决定输入框是否应该处理特定的变更事件。
   *
   */
  protected abstract _shouldHandleChangeEvent(event: DateSelectionModelChange<S>): boolean;

  /**
   * Whether the last value set on the input was valid.
   *
   * 输入框的最后一个值是否有效。
   *
   */
  protected _lastValueValid = false;

  constructor(
      protected _elementRef: ElementRef<HTMLInputElement>,
      @Optional() public _dateAdapter: DateAdapter<D>,
      @Optional() @Inject(MAT_DATE_FORMATS) private _dateFormats: MatDateFormats) {

    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (!this._dateAdapter) {
        throw createMissingDateImplError('DateAdapter');
      }
      if (!this._dateFormats) {
        throw createMissingDateImplError('MAT_DATE_FORMATS');
      }
    }

    // Update the displayed date when the locale changes.
    this._localeSubscription = _dateAdapter.localeChanges.subscribe(() => {
      this._assignValueProgrammatically(this.value);
    });
  }

  ngAfterViewInit() {
    this._isInitialized = true;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (dateInputsHaveChanged(changes, this._dateAdapter)) {
      this.stateChanges.next(undefined);
    }
  }

  ngOnDestroy() {
    this._valueChangesSubscription.unsubscribe();
    this._localeSubscription.unsubscribe();
    this.stateChanges.complete();
  }

  /** @docs-private */
  registerOnValidatorChange(fn: () => void): void {
    this._validatorOnChange = fn;
  }

  /** @docs-private */
  validate(c: AbstractControl): ValidationErrors | null {
    return this._validator ? this._validator(c) : null;
  }

  // Implemented as part of ControlValueAccessor.
  writeValue(value: D): void {
    this._assignValueProgrammatically(value);
  }

  // Implemented as part of ControlValueAccessor.
  registerOnChange(fn: (value: any) => void): void {
    this._cvaOnChange = fn;
  }

  // Implemented as part of ControlValueAccessor.
  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  // Implemented as part of ControlValueAccessor.
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  _onKeydown(event: KeyboardEvent) {
    const isAltDownArrow = event.altKey && event.keyCode === DOWN_ARROW;

    if (isAltDownArrow && !this._elementRef.nativeElement.readOnly) {
      this._openPopup();
      event.preventDefault();
    }
  }

  _onInput(value: string) {
    const lastValueWasValid = this._lastValueValid;
    let date = this._dateAdapter.parse(value, this._dateFormats.parse.dateInput);
    this._lastValueValid = this._isValidValue(date);
    date = this._dateAdapter.getValidDateOrNull(date);

    if (!this._dateAdapter.sameDate(date, this.value)) {
      this._assignValue(date);
      this._cvaOnChange(date);
      this.dateInput.emit(new MatDatepickerInputEvent(this, this._elementRef.nativeElement));
    } else {
      // Call the CVA change handler for invalid values
      // since this is what marks the control as dirty.
      if (value && !this.value) {
        this._cvaOnChange(date);
      }

      if (lastValueWasValid !== this._lastValueValid) {
        this._validatorOnChange();
      }
    }
  }

  _onChange() {
    this.dateChange.emit(new MatDatepickerInputEvent(this, this._elementRef.nativeElement));
  }

  /**
   * Handles blur events on the input.
   *
   * 处理输入框中的失焦（blur）事件。
   *
   */
  _onBlur() {
    // Reformat the input only if we have a valid value.
    if (this.value) {
      this._formatValue(this.value);
    }

    this._onTouched();
  }

  /**
   * Formats a value and sets it on the input element.
   *
   * 格式化值并把它设置在输入框元素上。
   *
   */
  protected _formatValue(value: D | null) {
    this._elementRef.nativeElement.value =
        value ? this._dateAdapter.format(value, this._dateFormats.display.dateInput) : '';
  }

  /**
   * Assigns a value to the model.
   *
   * 为模型赋值。
   *
   */
  private _assignValue(value: D | null) {
    // We may get some incoming values before the model was
    // assigned. Save the value so that we can assign it later.
    if (this._model) {
      this._assignValueToModel(value);
      this._pendingValue = null;
    } else {
      this._pendingValue = value;
    }
  }

  /**
   * Whether a value is considered valid.
   *
   * 决定值是否有效。
   *
   */
  private _isValidValue(value: D | null): boolean {
    return !value || this._dateAdapter.isValid(value);
  }

  /**
   * Checks whether a parent control is disabled. This is in place so that it can be overridden
   * by inputs extending this one which can be placed inside of a group that can be disabled.
   *
   * 检查父控件是否已禁用。输入框可以通过扩展这个值来改写它，可以把它放在一个可禁用的控件组中。
   *
   */
  protected _parentDisabled() {
    return false;
  }

  /**
   * Programmatically assigns a value to the input.
   *
   * 以编程方式为输入框赋值。
   *
   */
  protected _assignValueProgrammatically(value: D | null) {
    value = this._dateAdapter.deserialize(value);
    this._lastValueValid = this._isValidValue(value);
    value = this._dateAdapter.getValidDateOrNull(value);
    this._assignValue(value);
    this._formatValue(value);
  }

  /**
   * Gets whether a value matches the current date filter.
   *
   * 获取某个值是否与当前日期过滤器匹配。
   *
   */
  _matchesFilter(value: D | null): boolean {
    const filter = this._getDateFilter();
    return !filter || filter(value);
  }

  // Accept `any` to avoid conflicts with other directives on `<input>` that
  // may accept different types.
  static ngAcceptInputType_value: any;
  static ngAcceptInputType_disabled: BooleanInput;
}

/**
 * Checks whether the `SimpleChanges` object from an `ngOnChanges`
 * callback has any changes, accounting for date objects.
 *
 * 检查 `ngOnChanges` 回调函数中 `SimpleChanges` 对象是否有任何变更，支持日期对象。
 *
 */
export function dateInputsHaveChanged(
  changes: SimpleChanges,
  adapter: DateAdapter<unknown>): boolean {
  const keys = Object.keys(changes);

  for (let key of keys) {
    const {previousValue, currentValue} = changes[key];

    if (adapter.isDateInstance(previousValue) && adapter.isDateInstance(currentValue)) {
      if (!adapter.sameDate(previousValue, currentValue)) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
}
