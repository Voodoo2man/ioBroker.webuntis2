"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var StateWriter_exports = {};
__export(StateWriter_exports, {
  setStateChangedOrInitialize: () => setStateChangedOrInitialize
});
module.exports = __toCommonJS(StateWriter_exports);
const SUBSTITUTE_INITIAL_VALUE_QUALITY = 32;
async function setStateChangedOrInitialize(adapter, id, value) {
  const current = await adapter.getStateAsync(id);
  if ((current == null ? void 0 : current.q) === SUBSTITUTE_INITIAL_VALUE_QUALITY || (current == null ? void 0 : current.ack) === false) {
    await adapter.setStateAsync(id, value, true);
    return;
  }
  await adapter.setStateChangedAsync(id, value, true);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  setStateChangedOrInitialize
});
//# sourceMappingURL=StateWriter.js.map
