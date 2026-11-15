/** 시뮬레이션 Worker를 하나 띄우고, 프로젝트가 다시 불러와질 때마다 새 문서를 넘긴다. */
import { useEffect, useRef, useState } from "react";
import type { ProjectState } from "../use-project.ts";
import type { Frame, FromWorker, ToWorker } from "./protocol.ts";

export function useSimulation(project: Pick<ProjectState, "docJson" | "refs" | "loaded">) {
  const worker = useRef<Worker | undefined>(undefined);
  const [frame, setFrame] = useState<Frame | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.type === "frame") setFrame(e.data);
      else setError(e.data.message);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const send = (m: ToWorker) => worker.current?.postMessage(m);

  // 회로가 바뀔 때만 다시 만든다. 화면 배치(layout)만 바뀌면 실행 중인 시뮬레이션을 건드리지 않는다.
  const { docJson, refs, loaded } = project;
  const circuitKey = loaded
    ? JSON.stringify([{ ...(docJson as Record<string, unknown>), layout: undefined }, refs])
    : "";
  useEffect(() => {
    setError(undefined);
    if (!circuitKey) return;
    const [doc, files] = JSON.parse(circuitKey) as [unknown, Record<string, string>];
    worker.current?.postMessage({ type: "load", docJson: doc, refs: files } satisfies ToWorker);
  }, [circuitKey]);

  return {
    frame,
    error,
    play: () => send({ type: "play" }),
    pause: () => send({ type: "pause" }),
    reset: () => send({ type: "reset" }),
  };
}
