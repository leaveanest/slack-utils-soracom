import { assertEquals } from "std/testing/asserts.ts";
import { formatSoraCamDeviceListMessage } from "./mod.ts";
import type { SoraCamDevice } from "../../lib/soracom/mod.ts";

Deno.test({
  name: "ソラカメデバイス一覧が正常にフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const devices: SoraCamDevice[] = [
      {
        deviceId: "7C12345678AB",
        name: "Office Camera",
        status: "online",
        firmwareVersion: "2.0.1",
        lastConnectedTime: 1700000000000,
      },
      {
        deviceId: "7C98765432CD",
        name: "Entrance Camera",
        status: "offline",
        firmwareVersion: "1.9.8",
        lastConnectedTime: 1699900000000,
      },
    ];

    const message = formatSoraCamDeviceListMessage(devices);

    assertEquals(message.includes("Office Camera"), true);
    assertEquals(message.includes("Entrance Camera"), true);
    assertEquals(message.includes("online"), true);
    assertEquals(message.includes("offline"), true);
  },
});

Deno.test({
  name: "ソラカメデバイスが0台の場合は適切なメッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatSoraCamDeviceListMessage([]);
    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "名前のないデバイスはdeviceIdを表示する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const devices: SoraCamDevice[] = [
      {
        deviceId: "7C12345678AB",
        name: "",
        status: "online",
        firmwareVersion: "",
        lastConnectedTime: 0,
      },
    ];

    const message = formatSoraCamDeviceListMessage(devices);
    assertEquals(message.includes("7C12345678AB"), true);
  },
});
