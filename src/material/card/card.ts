/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  Component,
  ViewEncapsulation,
  ChangeDetectionStrategy,
  Directive,
  Input,
  Optional,
  Inject,
} from '@angular/core';
import {ANIMATION_MODULE_TYPE} from '@angular/platform-browser/animations';

/**
 * Content of a card, needed as it's used as a selector in the API.
 *
 * 卡片的内容，当需要在 API 中用作选择器时才会用到它。
 *
 * @docs-private
 */
@Directive({
  selector: 'mat-card-content, [mat-card-content], [matCardContent]',
  host: {'class': 'mat-card-content'}
})
export class MatCardContent {}

/**
 * Title of a card, needed as it's used as a selector in the API.
 *
 * 卡片的标题，当需要在 API 中用作选择器时才会用到它。
 *
 * @docs-private
 */
@Directive({
  selector: `mat-card-title, [mat-card-title], [matCardTitle]`,
  host: {
    'class': 'mat-card-title'
  }
})
export class MatCardTitle {}

/**
 * Sub-title of a card, needed as it's used as a selector in the API.
 *
 * 卡片的副标题，当需要在 API 中用作选择器时才会用到它。
 *
 * @docs-private
 */
@Directive({
  selector: `mat-card-subtitle, [mat-card-subtitle], [matCardSubtitle]`,
  host: {
    'class': 'mat-card-subtitle'
  }
})
export class MatCardSubtitle {}

/**
 * Action section of a card, needed as it's used as a selector in the API.
 *
 * 卡片的动作栏部分，当需要在 API 中用作选择器时才会用到它。
 *
 * @docs-private
 */
@Directive({
  selector: 'mat-card-actions',
  exportAs: 'matCardActions',
  host: {
    'class': 'mat-card-actions',
    '[class.mat-card-actions-align-end]': 'align === "end"',
  }
})
export class MatCardActions {
  /**
   * Position of the actions inside the card.
   *
   * 动作栏在卡片内的位置。
   *
   */
  @Input() align: 'start' | 'end' = 'start';
}

/**
 * Footer of a card, needed as it's used as a selector in the API.
 *
 * 卡片的尾部，当需要在 API 中用作选择器时才会用到它。
 *
 * @docs-private
 */
@Directive({
  selector: 'mat-card-footer',
  host: {'class': 'mat-card-footer'}
})
export class MatCardFooter {}

/**
 * Image used in a card, needed to add the mat- CSS styling.
 *
 * 卡片中使用的图像，需要添加 mat- CSS 样式。
 *
 * @docs-private
 */
@Directive({
  selector: '[mat-card-image], [matCardImage]',
  host: {'class': 'mat-card-image'}
})
export class MatCardImage {}

/**
 * Image used in a card, needed to add the mat- CSS styling.
 *
 * 卡片中使用的图像，需要添加 mat- CSS 样式。
 *
 * @docs-private
 */
@Directive({
  selector: '[mat-card-sm-image], [matCardImageSmall]',
  host: {'class': 'mat-card-sm-image'}
})
export class MatCardSmImage {}

/**
 * Image used in a card, needed to add the mat- CSS styling.
 *
 * 卡片中使用的图像，需要添加 mat- CSS 样式。
 *
 * @docs-private
 */
@Directive({
  selector: '[mat-card-md-image], [matCardImageMedium]',
  host: {'class': 'mat-card-md-image'}
})
export class MatCardMdImage {}

/**
 * Image used in a card, needed to add the mat- CSS styling.
 *
 * 卡片中使用的图像，需要添加 mat- CSS 样式。
 *
 * @docs-private
 */
@Directive({
  selector: '[mat-card-lg-image], [matCardImageLarge]',
  host: {'class': 'mat-card-lg-image'}
})
export class MatCardLgImage {}

/**
 * Large image used in a card, needed to add the mat- CSS styling.
 *
 * 卡片中使用的大图，需要添加 mat- CSS 样式。
 *
 * @docs-private
 */
@Directive({
  selector: '[mat-card-xl-image], [matCardImageXLarge]',
  host: {'class': 'mat-card-xl-image'}
})
export class MatCardXlImage {}

/**
 * Avatar image used in a card, needed to add the mat- CSS styling.
 *
 * 卡片中使用的头像图，需要添加 mat- CSS 样式。
 *
 * @docs-private
 */
@Directive({
  selector: '[mat-card-avatar], [matCardAvatar]',
  host: {'class': 'mat-card-avatar'}
})
export class MatCardAvatar {}

/**
 * A basic content container component that adds the styles of a Material design card.
 *
 * 一个基本的内容容器组件，它添加了一些 Material Design 卡片的样式。
 *
 * While this component can be used alone, it also provides a number
 * of preset styles for common card sections, including:
 *
 * 虽然这个组件可以单独使用，但它也为普通的卡片区段提供了一些预设的样式，包括：
 *
 * - mat-card-title
 * - mat-card-subtitle
 * - mat-card-content
 * - mat-card-actions
 * - mat-card-footer
 */
@Component({
  selector: 'mat-card',
  exportAs: 'matCard',
  templateUrl: 'card.html',
  styleUrls: ['card.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'mat-card mat-focus-indicator',
    '[class._mat-animation-noopable]': '_animationMode === "NoopAnimations"',
  }
})
export class MatCard {
  // @breaking-change 9.0.0 `_animationMode` parameter to be made required.
  constructor(@Optional() @Inject(ANIMATION_MODULE_TYPE) public _animationMode?: string) {}
}

/**
 * Component intended to be used within the `<mat-card>` component. It adds styles for a
 * preset header section (i.e. a title, subtitle, and avatar layout).
 *
 * 那些打算用于 `<mat-card>` 中的组件。它为预设的页头添加了一些样式（比如标题、副标题和头像布局）。
 *
 * @docs-private
 */
@Component({
  selector: 'mat-card-header',
  templateUrl: 'card-header.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'class': 'mat-card-header'}
})
export class MatCardHeader {}

/**
 * Component intended to be used within the `<mat-card>` component. It adds styles for a preset
 * layout that groups an image with a title section.
 *
 * 那些打算用于 `<mat-card>` 中的组件。它为预设的布局添加了一些样式，用于对带标题的图像进行分组。
 *
 * @docs-private
 */
@Component({
  selector: 'mat-card-title-group',
  templateUrl: 'card-title-group.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'class': 'mat-card-title-group'}
})
export class MatCardTitleGroup {}
