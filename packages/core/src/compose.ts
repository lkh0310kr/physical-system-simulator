/**
 * System 문서를 실행 가능한 구조로 만든다: Instance 생성 + 핀-핀 연결을 Net으로 묶기 (스펙 §8).
 * Net은 서로 연결된 Port의 집합이다. 전기 도메인에서는 하나의 노드(같은 전위)가 된다.
 */
import { createInstance, type Instance } from "./instance.ts";
import { fail, type Issue, joinPath, ok, type Result } from "./issues.ts";
import type { PortDomain } from "./model.ts";
import type { Registry } from "./registry.ts";
import { type SystemDoc, splitPortRef } from "./system.ts";

export interface Net {
  /** "n1", "n2", … — 연결 목록에 처음 등장한 순서. */
  readonly id: string;
  readonly domain: PortDomain;
  /** 이 Net에 속한 Port 참조 ("instance:port"), 처음 등장한 순서. */
  readonly ports: readonly string[];
}

export interface BuiltSystem {
  readonly name: string;
  readonly instances: readonly Instance[];
  /** 연결된 Port만 Net에 속한다. 아무것도 연결되지 않은 Port는 Net이 없다. */
  readonly nets: readonly Net[];
}

/** 유니온-파인드. 키 삽입 순서를 기억해 결과 순서를 결정적으로 만든다. */
function unionFind() {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  return {
    add: (x: string) => void (parent.has(x) || parent.set(x, x)),
    union: (a: string, b: string) => void parent.set(find(a), find(b)),
    groups: () => {
      const groups = new Map<string, string[]>();
      for (const x of parent.keys()) {
        const root = find(x);
        groups.set(root, [...(groups.get(root) ?? []), x]);
      }
      return [...groups.values()];
    },
  };
}

export function buildSystem(registry: Registry, doc: SystemDoc): Result<BuiltSystem> {
  const issues: Issue[] = [];

  const instances: Instance[] = [];
  doc.instances.forEach((decl, i) => {
    const r = createInstance(registry, decl, joinPath("instances", i));
    if (r.ok) instances.push(r.value);
    else issues.push(...r.issues);
  });

  /** Port 참조 → 도메인. 존재하지 않으면 issue를 남기고 undefined. */
  const domainOf = (ref: string, path: string): PortDomain | undefined => {
    const { instance, port } = splitPortRef(ref);
    const decl = doc.instances.find((d) => d.id === instance);
    if (!decl) {
      issues.push({ path, message: `없는 Instance: ${instance}` });
      return undefined;
    }
    const p = registry.getModel(decl.model)?.ports.find((x) => x.name === port);
    if (!p) issues.push({ path, message: `${decl.model}에 없는 Port: ${port}` });
    return p?.domain;
  };

  const uf = unionFind();
  const domains = new Map<string, PortDomain>();
  doc.connections.forEach(([a, b], i) => {
    const path = joinPath("connections", i);
    if (a === b) {
      issues.push({ path, message: `자기 자신과 연결: ${a}` });
      return;
    }
    const da = domainOf(a, joinPath(path, 0));
    const db = domainOf(b, joinPath(path, 1));
    if (!da || !db) return;
    if (da !== db) {
      issues.push({
        path,
        message: `도메인이 다른 Port는 연결할 수 없다: ${a}(${da}) ↔ ${b}(${db})`,
      });
      return;
    }
    for (const ref of [a, b]) {
      uf.add(ref);
      domains.set(ref, da);
    }
    uf.union(a, b);
  });

  if (issues.length) return fail(issues);
  const nets = uf.groups().map((ports, i) => ({
    id: `n${i + 1}`,
    domain: domains.get(ports[0] ?? "") ?? "electrical",
    ports,
  }));
  return ok({ name: doc.name, instances, nets });
}
