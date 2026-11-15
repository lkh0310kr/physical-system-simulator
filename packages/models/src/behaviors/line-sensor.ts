import { defineBehavior, numberOf } from "@physisim/core";

/**
 * 선 센서: 차체 앞 `lookAhead` 지점의 옆 위치와 선(y = amplitude·sin(2π·x/wavelength))의 옆 위치 차이(센서 점 − 선)를 낸다: 로봇이 선의 왼쪽(+y)에 있으면 +.
 * 입력 신호 x, y, heading은 차체 자세. 이상 센서(노이즈·폭 없음)이며 값은 연속이다.
 */
export const lineSensor = defineBehavior<Record<string, never>>({
  id: "behavior.line-sensor",
  init: () => ({}),
  step: (state, inputs, ctx) => {
    const x = Number(inputs.x ?? 0);
    const y = Number(inputs.y ?? 0);
    const h = Number(inputs.heading ?? 0);
    const look = numberOf(ctx.properties, "lookAhead");
    const sx = x + look * Math.cos(h);
    const sy = y + look * Math.sin(h);
    const amplitude = numberOf(ctx.properties, "amplitude");
    const wavelength = numberOf(ctx.properties, "wavelength");
    const lineY = amplitude * Math.sin((2 * Math.PI * sx) / wavelength);
    return { state, outputs: { offset: sy - lineY } };
  },
});
