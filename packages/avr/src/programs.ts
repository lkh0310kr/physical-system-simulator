/**
 * System의 MCU 프로그램들을 시뮬레이션에 붙인다 (브라우저·Node 공용).
 * `.ino` → 미리 컴파일된 펌웨어(hex)를 avr8js로, `.js` → 엔진의 JS 런타임으로.
 */
import { type LoadedSystem, numberOf, resolveProperties } from "@physisim/core";
import { loadProgram, type Program, type Simulation } from "@physisim/engine";
import { loadFirmware } from "./firmware.ts";

export const isSketch = (path: string) => path.toLowerCase().endsWith(".ino");

/** Instance의 GPIO 설정(핀 수·접두어·HIGH 전압). GPIO가 없으면 `undefined`. */
function gpioConfig(loaded: LoadedSystem, instanceId: string) {
  const inst = loaded.doc.instances.find((i) => i.id === instanceId);
  const binding = loaded.registry
    .getModel(inst?.model ?? "")
    ?.capabilities.find((c) => c.capability === "capability.gpio");
  const cap = loaded.registry.getCapability("capability.gpio");
  if (!binding || !cap) return undefined;
  const config = resolveProperties(cap.parameters, binding.config);
  if (!config.ok) return undefined;
  return {
    pinCount: numberOf(config.value, "pinCount"),
    prefix: String(config.value.pinPrefix ?? "D"),
    logicLevel: numberOf(config.value, "logicLevel"),
  };
}

/**
 * @param firmware Instance ID → 컴파일된 Intel HEX (`.ino` 프로그램용).
 * @returns Instance ID와 실행 중인 프로그램. `.ino`인데 hex가 없으면 그 프로그램은 오류 상태로 돌려준다.
 */
export function startPrograms(
  sim: Simulation,
  loaded: LoadedSystem,
  firmware: ReadonlyMap<string, string>,
): [string, Program][] {
  return loaded.doc.instances.flatMap((inst): [string, Program][] => {
    if (!inst.program) return [];
    if (isSketch(inst.program)) {
      const hex = firmware.get(inst.id);
      if (!hex)
        return [
          [inst.id, { error: new Error(`컴파일되지 않은 스케치: ${inst.program}`), serial: [] }],
        ];
      const gpio = gpioConfig(loaded, inst.id);
      const options = gpio && {
        pinCount: gpio.pinCount,
        // 입력 핀은 회로 전압으로 읽는다: HIGH 판정은 GPIO Behavior와 같은 logicLevel/2.
        readPin: (pin: number) =>
          sim.voltage(`${inst.id}:${gpio.prefix}${pin}`) > gpio.logicLevel / 2,
      };
      return [[inst.id, loadFirmware(sim, inst.id, hex, options ?? {})]];
    }
    const source = loaded.programs.get(inst.id);
    return source === undefined ? [] : [[inst.id, loadProgram(sim, inst.id, source)]];
  });
}
