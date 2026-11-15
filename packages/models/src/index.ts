import {
  createRegistry,
  formatIssues,
  type LibraryInput,
  loadLibrary,
  type Registry,
} from "@physisim/core";
import { digitalIo } from "./behaviors/digital-io.ts";
import { led as ledBehavior } from "./behaviors/led.ts";
import gpio from "./capabilities/gpio.json" with { type: "json" };
import lightEmission from "./capabilities/light-emission.json" with { type: "json" };
import arduinoUno from "./models/arduino-uno.json" with { type: "json" };
import atmega328p from "./models/atmega328p.json" with { type: "json" };
import led from "./models/led.json" with { type: "json" };
import resistor from "./models/resistor.json" with { type: "json" };

export { digitalIo, ledBehavior };

/** 표준 라이브러리 정의 묶음. */
export const standardLibrary: LibraryInput = {
  behaviors: [digitalIo, ledBehavior],
  capabilities: [gpio, lightEmission],
  models: [led, resistor, atmega328p, arduinoUno],
};

/** 표준 라이브러리를 실은 Registry. 정의에 문제가 있으면 throw (라이브러리 자체의 버그). */
export function createStandardRegistry(registry: Registry = createRegistry()): Registry {
  const r = loadLibrary(standardLibrary, registry);
  if (!r.ok) throw new Error(`표준 라이브러리 오류:\n${formatIssues(r.issues)}`);
  return r.value;
}
