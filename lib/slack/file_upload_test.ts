import { assertEquals } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import {
  type SlackApiClient,
  uploadSlackFileToChannel,
} from "./file_upload.ts";

Deno.test("uploadSlackFileToChannel: thread_ts を completeUploadExternal に渡せる", async () => {
  const apiCallArgs: Array<{
    method: string;
    body?: Record<string, unknown>;
  }> = [];

  const client: SlackApiClient = {
    apiCall(method, body) {
      apiCallArgs.push({ method, body });

      if (method === "files.getUploadURLExternal") {
        return Promise.resolve({
          ok: true,
          upload_url: "https://example.com/upload",
          file_id: "F123",
        });
      }

      if (method === "files.completeUploadExternal") {
        return Promise.resolve({
          ok: true,
          files: [{ id: "F123" }],
        });
      }

      throw new Error(`unexpected method: ${method}`);
    },
  };

  const fetchStub = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response(null, {
          status: 200,
        }),
      ),
  );

  try {
    const fileId = await uploadSlackFileToChannel(
      client,
      "C123",
      new Uint8Array([1, 2, 3]),
      {
        filename: "snapshot.jpg",
        title: "snapshot",
        contentType: "image/jpeg",
        threadTs: "1742281200.000100",
      },
    );

    assertEquals(fileId, "F123");
    assertEquals(apiCallArgs.length, 2);
    assertEquals(apiCallArgs[0].method, "files.getUploadURLExternal");
    assertEquals(apiCallArgs[1].method, "files.completeUploadExternal");
    assertEquals(apiCallArgs[1].body, {
      files: [{ id: "F123", title: "snapshot" }],
      channel_id: "C123",
      thread_ts: "1742281200.000100",
    });
  } finally {
    fetchStub.restore();
  }
});
