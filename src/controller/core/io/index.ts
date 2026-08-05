/*
 * @Author: hhr
 * @Date: 2026-07-01 11:13:05
 * @LastEditTime: 2026-07-02 14:10:17
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\io\index.ts
 */
import { InputController } from './InputController';
import { OutputController } from './OutputController';
import type { BusinessController } from '../business';
import { GenericController } from '../generic';

export class IOController {
  public input: InputController;
  public output: OutputController;

  constructor(genericController: GenericController, businessController: BusinessController) {
    this.input = new InputController(genericController, businessController);
    this.output = new OutputController();
  }
}

export * from './InputController';
export * from './OutputController';