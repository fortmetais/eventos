import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Members } from "./Organization";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    refresh: async () => {},
    access: { account: { platformAdmin: false } },
  }),
}));

const email = "organizador@example.com";
function response(accepted: boolean) {
  return {
    functions: [
      {
        id: "organizer-function",
        name: "Organizador",
        role: "ORGANIZER",
        defaultRole: "ORGANIZER",
        active: true,
      },
    ],
    members: accepted
      ? [
          {
            id: "member",
            organizationId: "org",
            accountId: "user",
            role: "ORGANIZER",
            active: true,
            healthEventIds: [],
            account: { id: "user", email },
          },
        ]
      : [],
    invitations: [
      {
        id: "invitation",
        email,
        role: "ORGANIZER",
        expiresAt: "2099-01-01T00:00:00Z",
        acceptedAt: accepted ? "2026-10-08T12:00:00Z" : null,
        revokedAt: null as string | null,
      },
    ],
    events: [],
  };
}
function renderMembers() {
  return render(
    <MemoryRouter initialEntries={["/organizacao/org/membros"]}>
      <Routes>
        <Route
          path="/organizacao/:organizationId/membros"
          element={<Members />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
function expectAccepted() {
  expect(screen.getByText("Organizador · Aceito")).toBeInTheDocument();
  expect(
    within(screen.getByRole("table")).getByText(email),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Aguardando aceite/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Revogar" }),
  ).not.toBeInTheDocument();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Cópia dos links de convite", () => {
  const link = "https://encontro.example/convite/" + "a".repeat(43);
  const path = "/organizations/org/invitations/invitation/link";
  const expiry = "2099-01-01T00:00:00Z";
  function prepared(canCopyLink = true) {
    const data = response(false);
    return {
      ...data,
      invitationLinksReady: true,
      invitations: data.invitations.map((invitation) => ({
        ...invitation,
        canCopyLink,
      })),
    };
  }
  function serve(data = prepared()) {
    mocks.api.mockImplementation(async (_url, options) =>
      options?.method === "POST"
        ? { link, expiresAt: expiry, regenerated: false }
        : data,
    );
  }

  it("busca o mesmo link só ao clicar e copia sem expô-lo na listagem", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    serve();
    renderMembers();
    const button = await screen.findByRole("button", {
      name: "Copiar link do convite",
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue(link)).not.toBeInTheDocument();
    await user.click(button);
    await screen.findByText("Link do convite copiado.");
    expect(write).toHaveBeenCalledWith(link);
    expect(mocks.api).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ method: "POST", body: {} }),
    );
    expect(screen.queryByDisplayValue(link)).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  });

  it("explica a troca do link antigo e só gera depois da confirmação explícita", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    let generated = false;
    mocks.api.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") {
        generated = true;
        return { link, expiresAt: expiry, regenerated: true };
      }
      return prepared(generated);
    });
    renderMembers();
    await user.click(
      await screen.findByRole("button", { name: "Gerar link para copiar" }),
    );
    expect(
      screen.getByText(/Gerar um novo link invalida o anterior/),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancelar geração" }));
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Gerar link para copiar" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Gerar novo link e copiar" }),
    );
    await screen.findByText(/Novo link gerado e copiado/);
    expect(write).toHaveBeenCalledWith(link);
    expect(mocks.api).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ method: "POST", body: { regenerate: true } }),
    );
    expect(
      await screen.findByRole("button", { name: "Copiar link do convite" }),
    ).toBeEnabled();
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.filter(([, options]) => !options?.method),
      ).toHaveLength(2),
    );
  });

  it("oferece cópia manual após bloqueio, revelando o link só por escolha explícita", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Bloqueado"),
    );
    serve();
    renderMembers();
    await user.click(
      await screen.findByRole("button", { name: "Copiar link do convite" }),
    );
    const fallback = await screen.findByRole("button", {
      name: "Exibir link para copiar manualmente",
    });
    expect(screen.queryByDisplayValue(link)).not.toBeInTheDocument();
    await user.click(fallback);
    const input = screen.getByRole("textbox", {
      name: `Link do convite para ${email}`,
    });
    expect(input).toHaveValue(link);
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveFocus();
  });

  it("não mostra sucesso nem link manual quando o servidor recusa a consulta", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    mocks.api.mockImplementation(async (_url, options) => {
      if (options?.method === "POST")
        throw new Error("Convite não está mais disponível.");
      return prepared();
    });
    renderMembers();
    await user.click(
      await screen.findByRole("button", { name: "Copiar link do convite" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Convite não está mais disponível.",
    );
    expect(write).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Link do convite copiado."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Exibir link para copiar manualmente",
      }),
    ).not.toBeInTheDocument();
  });

  it("mantém convites aceitos, revogados ou expirados sem ação de copiar ou gerar", async () => {
    const data = prepared();
    data.invitations = [
      {
        ...data.invitations[0],
        id: "accepted",
        acceptedAt: "2026-10-08T12:00:00Z",
      },
      {
        ...data.invitations[0],
        id: "revoked",
        revokedAt: "2026-10-08T12:00:00Z",
      },
      {
        ...data.invitations[0],
        id: "expired",
        expiresAt: "2000-01-01T00:00:00Z",
      },
    ];
    serve(data);
    renderMembers();
    await screen.findByText("Organizador · Expirado");
    expect(
      screen.queryByRole("button", { name: "Copiar link do convite" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gerar link para copiar" }),
    ).not.toBeInTheDocument();
  });

  it("informa indisponibilidade quando o servidor não tem a configuração dos links", async () => {
    mocks.api.mockResolvedValue({ ...prepared(), invitationLinksReady: false });
    renderMembers();
    expect(
      await screen.findByText(
        /A cópia dos links de convite aguarda configuração/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copiar link do convite" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gerar link para copiar" }),
    ).not.toBeInTheDocument();
  });

  it("não duplica solicitações enquanto prepara o link", async () => {
    const user = userEvent.setup();
    let finish!: (result: {
      link: string;
      expiresAt: string;
      regenerated: boolean;
    }) => void;
    mocks.api.mockImplementation((_url, options) =>
      options?.method === "POST"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(prepared()),
    );
    renderMembers();
    const button = await screen.findByRole("button", {
      name: "Copiar link do convite",
    });
    await user.dblClick(button);
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Copiando link…" }),
    ).toBeDisabled();
    await act(async () =>
      finish({ link, expiresAt: expiry, regenerated: false }),
    );
    await screen.findByText("Link do convite copiado.");
  });

  it("descarta uma resposta atrasada após sair da lista", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    let finish!: (result: {
      link: string;
      expiresAt: string;
      regenerated: boolean;
    }) => void;
    mocks.api.mockImplementation((_url, options) =>
      options?.method === "POST"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(prepared()),
    );
    const view = renderMembers();
    await user.click(
      await screen.findByRole("button", { name: "Copiar link do convite" }),
    );
    view.unmount();
    await act(async () =>
      finish({ link, expiresAt: expiry, regenerated: false }),
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("inicia o acesso à área de transferência no clique antes de resolver a consulta", async () => {
    let finish!: (result: {
      link: string;
      expiresAt: string;
      regenerated: boolean;
    }) => void;
    mocks.api.mockImplementation((_url, options) =>
      options?.method === "POST"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(prepared()),
    );
    class TestClipboardItem {
      constructor(public data: Record<string, Promise<Blob>>) {}
    }
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText },
    });
    renderMembers();
    fireEvent.click(
      await screen.findByRole("button", { name: "Copiar link do convite" }),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    const content = (write.mock.calls[0][0] as TestClipboardItem[])[0].data[
      "text/plain"
    ];
    expect(content).toBeInstanceOf(Promise);
    await act(async () =>
      finish({ link, expiresAt: expiry, regenerated: false }),
    );
    const blob = await content;
    expect(blob.type).toBe("text/plain");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toBe(link);
    expect(await screen.findByText("Link do convite copiado.")).toBeVisible();
  });
});

describe("Lista de membros após aceite em outra aba", () => {
  it("consulta o estado salvo ao retornar à aba e apresenta o membro e o convite aceito", async () => {
    mocks.api.mockResolvedValue(response(false));
    renderMembers();
    await screen.findByText("Organizador · Aguardando aceite");
    mocks.api.mockResolvedValue(response(true));
    fireEvent(window, new Event("focus"));
    await screen.findByText("Organizador · Aceito");
    expectAccepted();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.mock.calls.every(
        ([path, options]) =>
          path === "/organizations/org/members" && !options.method,
      ),
    ).toBe(true);
  });
  it("atualiza periodicamente enquanto está visível e encerra a consulta periódica após o aceite", async () => {
    vi.useFakeTimers();
    mocks.api
      .mockResolvedValueOnce(response(false))
      .mockResolvedValue(response(true));
    renderMembers();
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByText("Organizador · Aguardando aceite"),
    ).toBeInTheDocument();
    const initialCalls = mocks.api.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expectAccepted();
    expect(mocks.api).toHaveBeenCalledTimes(initialCalls + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mocks.api).toHaveBeenCalledTimes(initialCalls + 1);
  });
  it("mantém a lista visível durante a consulta em segundo plano", async () => {
    let finishRefresh!: (data: ReturnType<typeof response>) => void;
    mocks.api.mockResolvedValueOnce(response(true)).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    renderMembers();
    await screen.findByText("Organizador · Aceito");
    fireEvent(window, new Event("focus"));
    expectAccepted();
    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
    await act(async () => {
      finishRefresh(response(true));
    });
    expectAccepted();
  });
  it("não consulta enquanto a aba está oculta e atualiza quando volta a ficar visível", async () => {
    mocks.api.mockResolvedValue(response(false));
    renderMembers();
    await screen.findByText("Organizador · Aguardando aceite");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("focus"));
    expect(mocks.api).toHaveBeenCalledTimes(1);
    mocks.api.mockResolvedValue(response(true));
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByText("Organizador · Aceito");
    expectAccepted();
  });
  it("permite atualizar manualmente sem aceitar o convite novamente", async () => {
    mocks.api.mockResolvedValue(response(false));
    renderMembers();
    await screen.findByText("Organizador · Aguardando aceite");
    mocks.api.mockResolvedValue(response(true));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Atualizar lista" }));
    await screen.findByText("Organizador · Aceito");
    expectAccepted();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("ignora uma resposta antiga que chega depois da atualização", async () => {
    let finishOldRequest!: (data: ReturnType<typeof response>) => void;
    mocks.api
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldRequest = resolve;
          }),
      )
      .mockResolvedValue(response(true));
    renderMembers();
    fireEvent(window, new Event("focus"));
    await screen.findByText("Organizador · Aceito");
    await act(async () => {
      finishOldRequest(response(false));
    });
    expectAccepted();
  });
});
