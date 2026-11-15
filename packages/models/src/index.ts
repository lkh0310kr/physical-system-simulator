import {
  createRegistry,
  formatIssues,
  type LibraryInput,
  loadLibrary,
  type Registry,
} from "@physisim/core";
import { battery } from "./behaviors/battery.ts";
import { cameraNode } from "./behaviors/camera-node.ts";
import { digitalIo } from "./behaviors/digital-io.ts";
import { led as ledBehavior } from "./behaviors/led.ts";
import { potentiometer } from "./behaviors/potentiometer.ts";
import { powerSupply } from "./behaviors/power-supply.ts";
import { resistor as resistorBehavior } from "./behaviors/resistor.ts";
import { switchBehavior } from "./behaviors/switch.ts";
import batteryCapability from "./capabilities/battery.json" with { type: "json" };
import cameraNodeCapability from "./capabilities/camera-node.json" with { type: "json" };
import gpio from "./capabilities/gpio.json" with { type: "json" };
import lightEmission from "./capabilities/light-emission.json" with { type: "json" };
import potentiometry from "./capabilities/potentiometry.json" with { type: "json" };
import powerSupplyCapability from "./capabilities/power-supply.json" with { type: "json" };
import resistance from "./capabilities/resistance.json" with { type: "json" };
import switching from "./capabilities/switching.json" with { type: "json" };
import arduinoUno from "./models/arduino-uno.json" with { type: "json" };
import atmega328p from "./models/atmega328p.json" with { type: "json" };
import esp32C6Chip from "./models/esp32-c6-qfn32.json" with { type: "json" };
import esp32P4Camera from "./models/esp32-p4-c6-camera-node.json" with { type: "json" };
import esp32P4Chip from "./models/esp32-p4-qfn104.json" with { type: "json" };
import esp32Camera from "./models/esp32-s3-camera-node.json" with { type: "json" };
import esp32S3Chip from "./models/esp32-s3-qfn56.json" with { type: "json" };
import led from "./models/led.json" with { type: "json" };
import liIonCell from "./models/li-ion-cell.json" with { type: "json" };
import lipo1317 from "./models/lipo-adafruit-1317.json" with { type: "json" };
import ov2640Sensor from "./models/ov2640-sensor.json" with { type: "json" };
import ov5640Sensor from "./models/ov5640-sensor.json" with { type: "json" };
import potentiometerModel from "./models/potentiometer.json" with { type: "json" };
import pushbutton from "./models/pushbutton.json" with { type: "json" };
import resistor from "./models/resistor.json" with { type: "json" };
import toggleSwitch from "./models/toggle-switch.json" with { type: "json" };
import xiaoSense from "./models/xiao-esp32s3-sense.json" with { type: "json" };

export { type DigitalIoEvent, type DigitalIoState, pinPort } from "./behaviors/digital-io.ts";
export { parseRails, type Rail } from "./behaviors/power-supply.ts";
export {
  battery,
  cameraNode,
  digitalIo,
  ledBehavior,
  potentiometer,
  powerSupply,
  resistorBehavior,
  switchBehavior,
};

/** 표준 라이브러리 정의 묶음. */
export const standardLibrary: LibraryInput = {
  behaviors: [
    battery,
    cameraNode,
    digitalIo,
    ledBehavior,
    resistorBehavior,
    switchBehavior,
    potentiometer,
    powerSupply,
  ],
  capabilities: [
    batteryCapability,
    cameraNodeCapability,
    gpio,
    lightEmission,
    resistance,
    switching,
    potentiometry,
    powerSupplyCapability,
  ],
  models: [
    led,
    esp32Camera,
    esp32P4Camera,
    liIonCell,
    lipo1317,
    esp32S3Chip,
    esp32C6Chip,
    esp32P4Chip,
    ov2640Sensor,
    ov5640Sensor,
    xiaoSense,
    resistor,
    pushbutton,
    toggleSwitch,
    potentiometerModel,
    atmega328p,
    arduinoUno,
  ],
};

/** 표준 라이브러리를 실은 Registry. 정의에 문제가 있으면 throw (라이브러리 자체의 버그). */
export function createStandardRegistry(registry: Registry = createRegistry()): Registry {
  const r = loadLibrary(standardLibrary, registry);
  if (!r.ok) throw new Error(`표준 라이브러리 오류:\n${formatIssues(r.issues)}`);
  return r.value;
}
