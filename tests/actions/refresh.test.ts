import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), run: vi.fn(), service: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/env", () => ({ isOwner: (email?: string) => email === "owner@example.test" }));
vi.mock("@/lib/corpus/refresh", () => ({ runRefresh: mocks.run }));
vi.mock("@/lib/db/service", () => ({ serviceClient: mocks.service }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { triggerRefresh } from "@/app/actions/refresh";
import { getRefreshHealth } from "@/lib/corpus/refreshHealth";

beforeEach(() => { vi.clearAllMocks(); });
test.each([null, { email: "other@example.test" }])("non-owner cannot refresh or read operational history", async user => {
  mocks.user.mockResolvedValue(user);
  await expect(triggerRefresh()).rejects.toThrow("owner only");
  await expect(getRefreshHealth()).rejects.toThrow("owner only");
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.service).not.toHaveBeenCalled();
});
test("owner refresh delegates to guarded workflow and refreshes feed state", async () => {
  mocks.user.mockResolvedValue({ email: "owner@example.test" });
  mocks.run.mockResolvedValue({ status: "cooldown" });
  expect(await triggerRefresh()).toEqual({ status: "cooldown" });
  expect(mocks.run).toHaveBeenCalledWith("manual");
  expect(mocks.revalidate).toHaveBeenCalledWith("/");
});
