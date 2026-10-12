import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SignedPhoto } from "./SignedPhoto";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const endpoint = "/public/drafts/draft-one/photos/photo-one";
const draftToken = "authorized-draft-token";
const initialUrl = "https://storage.test/photo.webp?token=initial";
const renewedUrl = "https://storage.test/photo.webp?token=renewed";
const photo = () => screen.getByRole("img", { name: "Sua foto" });
const retry = () =>
  screen.getByRole("button", { name: "Tentar carregar foto" });

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue({ url: initialUrl });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Foto privada com link temporário", () => {
  it("busca um link autorizado ao montar, sem modificar os dados do rascunho", async () => {
    const savedDraft = JSON.stringify({ id: "draft-one", photoAssetId: "photo-one" });
    localStorage.setItem("fac:draft:test", savedDraft);
    const writeStorage = vi.spyOn(Storage.prototype, "setItem");
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    expect(photo()).toHaveAttribute("src", initialUrl);
    expect(api).toHaveBeenCalledExactlyOnceWith(endpoint, {
      draftToken,
      signal: expect.any(AbortSignal),
    });
    expect(writeStorage).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(localStorage.getItem("fac:draft:test")).toBe(savedDraft);
    localStorage.removeItem("fac:draft:test");
  });

  it("renova após 90 segundos e suspende as consultas periódicas enquanto a aba está oculta", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const hidden = vi.spyOn(document, "hidden", "get");
    visibility.mockReturnValue("visible");
    vi.mocked(api).mockResolvedValueOnce({ url: initialUrl }).mockResolvedValue({ url: renewedUrl });
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(89_999);
    });
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(photo()).toHaveAttribute("src", renewedUrl);
    expect(api).toHaveBeenCalledTimes(2);

    visibility.mockReturnValue("hidden");
    hidden.mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(api).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    await settle();
    expect(api).toHaveBeenCalledTimes(3);
    expect(api).toHaveBeenLastCalledWith(endpoint, {
      draftToken,
      signal: expect.any(AbortSignal),
    });
  });

  it("aguarda a aba ficar visível antes de obter o link quando a etapa abre em segundo plano", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const hidden = vi.spyOn(document, "hidden", "get");
    visibility.mockReturnValue("hidden");
    hidden.mockReturnValue(true);
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    fireEvent(window, new Event("online"));
    await settle();
    expect(api).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    await settle();
    expect(photo()).toHaveAttribute("src", initialUrl);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("obtém um novo link quando a conexão volta, sem precisar recarregar a página", async () => {
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    vi.mocked(api).mockResolvedValue({ url: renewedUrl });
    fireEvent(window, new Event("online"));
    await settle();
    expect(photo()).toHaveAttribute("src", renewedUrl);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("renova uma imagem expirada uma vez e oferece tentativa manual após uma segunda falha consecutiva", async () => {
    vi.useFakeTimers();
    vi.mocked(api).mockResolvedValueOnce({ url: initialUrl }).mockResolvedValue({ url: renewedUrl });
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    fireEvent.error(photo());
    await settle();
    expect(photo()).toHaveAttribute("src", renewedUrl);
    expect(api).toHaveBeenCalledTimes(2);
    fireEvent.error(photo());
    await settle();
    expect(screen.getByText("Não foi possível carregar a foto.")).toBeVisible();
    expect(retry()).toHaveAttribute("type", "button");
    expect(api).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(270_000);
    });
    expect(api).toHaveBeenCalledTimes(2);
    fireEvent.click(retry());
    await settle();
    expect(photo()).toHaveAttribute("src", renewedUrl);
    expect(api).toHaveBeenCalledTimes(3);
    expect(api).toHaveBeenLastCalledWith(endpoint, {
      draftToken,
      signal: expect.any(AbortSignal),
    });
  });

  it("permite renovar outra expiração depois de a foto recuperada carregar com sucesso", async () => {
    vi.mocked(api).mockResolvedValueOnce({ url: initialUrl }).mockResolvedValue({ url: renewedUrl });
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    fireEvent.error(photo());
    await settle();
    fireEvent.load(photo());
    vi.mocked(api).mockResolvedValue({ url: "https://storage.test/photo.webp?token=third" });
    fireEvent.error(photo());
    await settle();
    expect(api).toHaveBeenCalledTimes(3);
    expect(photo()).toHaveAttribute("src", "https://storage.test/photo.webp?token=third");
    expect(screen.queryByText("Não foi possível carregar a foto.")).not.toBeInTheDocument();
  });

  it("permite tentar novamente quando a obtenção do link falha, preservando a autorização do rascunho", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("Falha de conexão"));
    render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    expect(screen.getByText("Não foi possível carregar a foto.")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(retry());
    await settle();
    expect(photo()).toHaveAttribute("src", initialUrl);
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith(endpoint, {
      draftToken,
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ["outra foto", "/public/drafts/draft-one/photos/photo-two", draftToken],
    ["outra credencial", endpoint, "replacement-draft-token"],
  ])("ignora uma resposta atrasada ao receber %s", async (_description, nextEndpoint, nextToken) => {
    let finishOldRequest!: (value: { url: string }) => void;
    vi.mocked(api).mockImplementationOnce(
      () => new Promise((resolve) => { finishOldRequest = resolve; }),
    ).mockResolvedValue({ url: renewedUrl });
    const view = render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    const originalSignal = vi.mocked(api).mock.calls[0][1]?.signal;
    view.rerender(<SignedPhoto endpoint={nextEndpoint} draftToken={nextToken} alt="Sua foto" />);
    await settle();
    expect(originalSignal?.aborted).toBe(true);
    expect(api).toHaveBeenLastCalledWith(nextEndpoint, {
      draftToken: nextToken,
      signal: expect.any(AbortSignal),
    });
    expect(photo()).toHaveAttribute("src", renewedUrl);
    await act(async () => {
      finishOldRequest({ url: initialUrl });
    });
    expect(photo()).toHaveAttribute("src", renewedUrl);
  });

  it("cancela a requisição em andamento ao sair da etapa", async () => {
    vi.useFakeTimers();
    vi.mocked(api).mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    const signal = vi.mocked(api).mock.calls[0][1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("online"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(270_000);
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("remove a renovação agendada e os listeners ao desmontar uma foto já carregada", async () => {
    vi.useFakeTimers();
    const view = render(<SignedPhoto endpoint={endpoint} draftToken={draftToken} alt="Sua foto" />);
    await settle();
    expect(photo()).toHaveAttribute("src", initialUrl);
    view.unmount();
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("online"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(270_000);
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
