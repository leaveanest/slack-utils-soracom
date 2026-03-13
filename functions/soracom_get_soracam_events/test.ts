import { assertEquals } from "std/testing/asserts.ts";
import { formatSoraCamEventsMessage } from "./mod.ts";
import type { SoraCamEvent } from "../../lib/soracom/mod.ts";

Deno.test({
  name: "ソラカメイベントが正常にフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const events: SoraCamEvent[] = [
      {
        deviceId: "7C12345678AB",
        eventType: "motion",
        eventTime: 1700000000000,
        eventInfo: {},
      },
      {
        deviceId: "7C12345678AB",
        eventType: "sound",
        eventTime: 1700003600000,
        eventInfo: {},
      },
    ];

    const message = formatSoraCamEventsMessage("7C12345678AB", events);

    assertEquals(message.includes("7C12345678AB"), true);
    assertEquals(message.includes("motion"), true);
    assertEquals(message.includes("sound"), true);
  },
});

Deno.test({
  name: "ソラカメイベントが空の場合は適切なメッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatSoraCamEventsMessage("7C12345678AB", []);
    assertEquals(message.length > 0, true);
  },
});
