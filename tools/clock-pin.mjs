/* Pins Date to KIWI_PIN_AT (ms), time flowing from there, in this process
 * AND in every vm sandbox it creates (a sandbox otherwise has its own Date). */
import vm from 'node:vm';
import { syncBuiltinESMExports } from 'node:module';
const RealDate = Date;
const T = Number(process.env.KIWI_PIN_AT);
if (Number.isFinite(T) && T > 0) {
  const offset = T - RealDate.now();
  class PinnedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = PinnedDate;
  const inject = (ctx) => { if (ctx && typeof ctx === 'object' && !Object.prototype.hasOwnProperty.call(ctx, 'Date')) ctx.Date = PinnedDate; return ctx; };
  const create = vm.createContext, runNew = vm.runInNewContext;
  vm.createContext = (ctx, ...rest) => create.call(vm, inject(ctx === undefined ? {} : ctx), ...rest);
  vm.runInNewContext = (code, ctx, ...rest) => runNew.call(vm, code, inject(ctx === undefined ? {} : ctx), ...rest);
  syncBuiltinESMExports();
}
