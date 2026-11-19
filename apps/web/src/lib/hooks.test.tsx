import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRemote } from "./hooks";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
describe("useRemote context isolation", () => {
  beforeEach(() => vi.resetAllMocks());
  it("hides the previous participant immediately and ignores late replies", async () => {
    const first = deferred<unknown>(), second = deferred<unknown>();
    mockApi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ path }) => useRemote<{ name: string }>(path), { initialProps: { path: "/first" } });
    rerender({ path: "/second" });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => first.resolve({ name: "Previous" }));
    expect(result.current.data).toBeNull();
    await act(async () => second.resolve({ name: "Current" }));
    expect(result.current.data).toEqual({ name: "Current" });
  });
  it("does not show a loaded record under a new context or after clearing selection", async () => {
    mockApi.mockResolvedValueOnce({ name: "First" }).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ path }) => useRemote(path), { initialProps: { path: "/first" as string | null } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ path: "/second" });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("");
    rerender({ path: null });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
  it("keeps the same context visible during a background refresh", async () => {
    const update = deferred<unknown>();
    mockApi.mockResolvedValueOnce({ total: 1 }).mockReturnValueOnce(update.promise);
    const { result } = renderHook(() => useRemote("/same"));
    await waitFor(() => expect(result.current.data).toEqual({ total: 1 }));
    act(() => result.current.refreshInBackground());
    expect(result.current.data).toEqual({ total: 1 });
    expect(result.current.loading).toBe(false);
    await act(async () => update.resolve({ total: 2 }));
    expect(result.current.data).toEqual({ total: 2 });
  });
  it("shows a failure for the current request without an endless loading state", async () => {
    mockApi.mockRejectedValueOnce(new Error("Connection unavailable"));
    const { result } = renderHook(() => useRemote("/failed"));
    await waitFor(() => expect(result.current.error).toBe("Connection unavailable"));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });
  it("supports local updates without merging records from another context", async () => {
    mockApi.mockResolvedValueOnce({ total: 1 });
    const { result } = renderHook(() => useRemote<{ total: number }>("/same"));
    await waitFor(() => expect(result.current.data?.total).toBe(1));
    act(() => result.current.setData((previous) => ({ total: (previous?.total ?? 0) + 1 })));
    expect(result.current.data?.total).toBe(2);
  });
  it("ignores a local updater retained by a previous participant", async () => {
    mockApi.mockResolvedValueOnce({ name: "First" }).mockResolvedValueOnce({ name: "Second" });
    const { result, rerender } = renderHook(({ path }) => useRemote<{ name: string }>(path), { initialProps: { path: "/first" } });
    await waitFor(() => expect(result.current.data?.name).toBe("First"));
    const updatePrevious = result.current.setData;
    rerender({ path: "/second" });
    await waitFor(() => expect(result.current.data?.name).toBe("Second"));
    act(() => updatePrevious({ name: "Late first" }));
    expect(result.current.data?.name).toBe("Second");
    expect(result.current.loading).toBe(false);
  });

});
