/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';
import {Migration} from '../../update-tool/migration';
import {getAllChanges} from '../../update-tool/version-changes';
import {UpgradeData} from '../upgrade-data';

/**
 * List of diagnostic codes that refer to pre-emit diagnostics which indicate invalid
 * new expression or super call signatures. See the list of diagnostics here:
 *
 * 诊断代码列表，代表发出前诊断信息，它会指出无效的新表达式或 super 调用签名。请在此处查看诊断列表：
 *
 * <https://github.com/Microsoft/TypeScript/blob/master/src/compiler/diagnosticMessages.json>
 */
const signatureErrorDiagnostics = [
  // Type not assignable error diagnostic.
  2345,
  // Constructor argument length invalid diagnostics
  2554,
  2555,
  2556,
  2557,
];

/**
 * Migration that visits every TypeScript new expression or super call and checks if
 * the parameter type signature is invalid and needs to be updated manually.
 *
 * 此迁移将访问每个 TypeScript new 表达式或 super 调用，并检查参数类型签名是否无效并且需要手动更新。
 *
 */
export class ConstructorSignatureMigration extends Migration<UpgradeData> {
  // Note that the data for this rule is not distinguished based on the target version because
  // we don't keep track of the new signature and don't want to update incrementally.
  // See: https://github.com/angular/components/pull/12970#issuecomment-418337566
  data = getAllChanges(this.upgradeData.constructorChecks);

  // Only enable the migration rule if there is upgrade data.
  enabled = this.data.length !== 0;

  visitNode(node: ts.Node): void {
    if (ts.isSourceFile(node)) {
      this._visitSourceFile(node);
    }
  }

  /**
   * Method that will be called for each source file of the upgrade project. In order to
   * properly determine invalid constructor signatures, we take advantage of the pre-emit
   * diagnostics from TypeScript.
   *
   * 将针对升级项目的每个源文件调用的方法。为了正确确定无效的构造函数签名，我们利用了 TypeScript 的发出前诊断功能。
   *
   * By using the diagnostics, the migration can handle type assignability. Not using
   * diagnostics would mean that we need to use simple type equality checking which is
   * too strict. See related issue: <https://github.com/Microsoft/TypeScript/issues/9879>
   *
   * 通过使用这些诊断，本迁移可以处理类型的赋值兼容。不使用诊断程序意味着我们需要使用简单类型相等性检查，那样就过于严格了。请参阅相关问题：<https://github.com/Microsoft/TypeScript/issues/9879>
   *
   */
  private _visitSourceFile(sourceFile: ts.SourceFile) {
    // List of classes of which the constructor signature has changed.
    const diagnostics =
        ts.getPreEmitDiagnostics(this.program, sourceFile)
            .filter(diagnostic => signatureErrorDiagnostics.includes(diagnostic.code))
            .filter(diagnostic => diagnostic.start !== undefined);

    for (const diagnostic of diagnostics) {
      const node = findConstructorNode(diagnostic, sourceFile);

      if (!node) {
        continue;
      }

      const classType = this.typeChecker.getTypeAtLocation(node.expression);
      const className = classType.symbol && classType.symbol.name;
      const isNewExpression = ts.isNewExpression(node);

      // Determine the class names of the actual construct signatures because we cannot assume that
      // the diagnostic refers to a constructor of the actual expression. In case the constructor
      // is inherited, we need to detect that the owner-class of the constructor is added to the
      // constructor checks upgrade data. e.g. `class CustomCalendar extends MatCalendar {}`.
      const signatureClassNames =
          classType.getConstructSignatures()
              .map(signature => getClassDeclarationOfSignature(signature))
              .map(declaration => declaration && declaration.name ? declaration.name.text : null)
              .filter(Boolean);

      // Besides checking the signature class names, we need to check the actual class name because
      // there can be classes without an explicit constructor.
      if (!this.data.includes(className) &&
          !signatureClassNames.some(name => this.data.includes(name!))) {
        continue;
      }

      const classSignatures = classType.getConstructSignatures().map(
          signature => getParameterTypesFromSignature(signature, this.typeChecker));

      const expressionName = isNewExpression ? `new ${className}` : 'super';
      const signatures =
          classSignatures.map(signature => signature.map(t => this.typeChecker.typeToString(t)))
              .map(signature => `${expressionName}(${signature.join(', ')})`)
              .join(' or ');

      this.createFailureAtNode(
          node,
          `Found "${className}" constructed with ` +
              `an invalid signature. Please manually update the ${expressionName} expression to ` +
              `match the new signature${classSignatures.length > 1 ? 's' : ''}: ${signatures}`);
    }
  }
}

/**
 * Resolves the type for each parameter in the specified signature.
 *
 * 解析指定签名中每个参数的类型。
 *
 */
function getParameterTypesFromSignature(
    signature: ts.Signature, typeChecker: ts.TypeChecker): ts.Type[] {
  return signature.getParameters().map(
      param => typeChecker.getTypeAtLocation(param.declarations[0]));
}

/**
 * Walks through each node of a source file in order to find a new-expression node or super-call
 * expression node that is captured by the specified diagnostic.
 *
 * 遍历源文件的每个节点，以查找由指定诊断捕获的 new 表达式节点或 super 调用表达式节点。
 *
 */
function findConstructorNode(
    diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile): ts.CallExpression|ts.NewExpression|null {
  let resolvedNode: ts.Node|null = null;

  const _visitNode = (node: ts.Node) => {
    // Check whether the current node contains the diagnostic. If the node contains the diagnostic,
    // walk deeper in order to find all constructor expression nodes.
    if (node.getStart() <= diagnostic.start! && node.getEnd() >= diagnostic.start!) {
      if (ts.isNewExpression(node) ||
          (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword)) {
        resolvedNode = node;
      }

      ts.forEachChild(node, _visitNode);
    }
  };

  ts.forEachChild(sourceFile, _visitNode);

  return resolvedNode;
}

/**
 * Determines the class declaration of the specified construct signature.
 *
 * 确定指定构造签名的类声明。
 *
 */
function getClassDeclarationOfSignature(signature: ts.Signature): ts.ClassDeclaration|null {
  let node: ts.Node = signature.getDeclaration();
  // Handle signatures which don't have an actual declaration. This happens if a class
  // does not have an explicitly written constructor.
  if (!node) {
    return null;
  }
  while (!ts.isSourceFile(node = node.parent)) {
    if (ts.isClassDeclaration(node)) {
      return node;
    }
  }
  return null;
}
