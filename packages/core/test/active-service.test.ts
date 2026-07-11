import { expect, test } from "bun:test";
import { createActiveServiceProxy } from "../src/active-service";

class Service {
  constructor(public value: number) {}

  add(amount: number): number {
    this.value += amount;
    return this.value;
  }
}

test("active service proxies route reflection and bound methods to the current target", () => {
  const first = new Service(1) as Service & { label?: string };
  const second = new Service(10) as Service & { label?: string };
  first.label = "first";
  second.label = "second";
  let active = first;
  const service = createActiveServiceProxy(() => active);

  expect(service).toBeInstanceOf(Service);
  expect(service.add(2)).toBe(3);
  expect("label" in service).toBe(true);
  expect(Object.keys(service)).toContain("label");
  expect(Object.getOwnPropertyDescriptor(service, "label")?.value).toBe(
    "first",
  );

  active = second;
  expect(service.value).toBe(10);
  service.value = 12;
  expect(second.value).toBe(12);
  expect(delete service.label).toBe(true);
  expect(second.label).toBeUndefined();
  expect(first.label).toBe("first");
});
