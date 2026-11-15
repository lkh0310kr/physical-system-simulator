/** 시뮬레이션 Worker를 하나 띄우고, 프로젝트가 다시 불러와질 때마다 새 문서를 넘긴다. */
import { useEffect, useRef, useState } from "react";
import type { ProjectState } from "../use-project.ts";
import type { Frame, FromWorker, ToWorker } from "./protocol.ts";

export function useSimulation(
  project: Pick<ProjectState, "docJson" | "refs" | "revision" | "loaded">,
) {
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

  const { docJson, refs, revision, loaded } = project;
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision이 바뀔 때(= 파일을 다시 불러왔을 때)만 보낸다.
  useEffect(() => {
    setError(undefined);
    if (loaded) worker.current?.postMessage({ type: "load", docJson, refs } satisfies ToWorker);
  }, [revision]);

  return {
    frame,
    error,
    play: () => send({ type: "play" }),
    pause: () => send({ type: "pause" }),
    reset: () => send({ type: "reset" }),
  };
}
