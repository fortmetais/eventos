import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BrowserRouter,
  Link,
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { UnsavedChangesProvider, useUnsavedChanges } from "./unsaved-changes";

afterEach(() => {
  cleanup();
});
function Editor() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(false);
  const navigate = useNavigate();
  const { run, markSaved } = useUnsavedChanges(Boolean(text), { busy });
  return (
    <>
      <h1>Editor</h1>
      <input
        aria-label="Rascunho"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Link to="/destino">Outra página</Link>
      <button onClick={() => navigate("/destino", { replace: true })}>
        Substituir página
      </button>
      <button onClick={() => navigate(-1)}>Voltar</button>
      <button
        onClick={() =>
          void run(() => {
            setLocal(true);
            navigate("/destino");
          })
        }
      >
        Ação local e navegação
      </button>
      <button
        onClick={() => {
          markSaved();
          setText("");
          navigate("/destino");
        }}
      >
        Salvar e sair
      </button>
      <button onClick={() => setBusy((value) => !value)}>
        Alternar salvamento
      </button>
      {local && <p>Ação local executada</p>}
    </>
  );
}
function RoutesUnderTest() {
  return (
    <UnsavedChangesProvider>
      <Routes>
        <Route path="/editor" element={<Editor />} />
        <Route
          path="/destino"
          element={
            <>
              <h1>Destino</h1>
              <Link to="/editor">Abrir editor</Link>
            </>
          }
        />
      </Routes>
    </UnsavedChangesProvider>
  );
}
function view() {
  return render(
    <MemoryRouter initialEntries={["/destino", "/editor"]}>
      <RoutesUnderTest />
    </MemoryRouter>,
  );
}
async function dirty() {
  fireEvent.change(await screen.findByRole("textbox", { name: "Rascunho" }), {
    target: { value: "Edição preservada" },
  });
}

describe("Proteção de alterações não salvas", () => {
  it.each([
    "Outra página",
    "Substituir página",
    "Voltar",
    "Ação local e navegação",
  ])("intercepta %s e cancela sem perder a edição", async (action) => {
    const user = userEvent.setup();
    view();
    await dirty();
    await user.click(
      screen.getByRole(action === "Outra página" ? "link" : "button", {
        name: action,
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Alterações não salvas" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(screen.getByRole("textbox", { name: "Rascunho" })).toHaveValue(
      "Edição preservada",
    );
    expect(
      screen.queryByRole("heading", { name: "Destino" }),
    ).not.toBeInTheDocument();
  });
  it("aprova a ação local e a navegação uma única vez", async () => {
    const user = userEvent.setup();
    view();
    await dirty();
    await user.click(
      screen.getByRole("button", { name: "Ação local e navegação" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Descartar alterações" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Destino" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("marca o sucesso antes de navegar e protege a saída nativa somente enquanto sujo", async () => {
    const user = userEvent.setup();
    view();
    await dirty();
    const blocked = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Salvar e sair" }));
    expect(
      await screen.findByRole("heading", { name: "Destino" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const allowed = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });
  it("impede descartar durante o salvamento", async () => {
    const user = userEvent.setup();
    view();
    await dirty();
    await user.click(
      screen.getByRole("button", { name: "Alternar salvamento" }),
    );
    await user.click(screen.getByRole("link", { name: "Outra página" }));
    expect(
      await screen.findByText(/Aguarde a conclusão antes de sair/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Descartar alterações" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(screen.getByRole("textbox", { name: "Rascunho" })).toHaveValue(
      "Edição preservada",
    );
  });
  it("restaura o Back nativo cancelado e reproduz o destino após aprovação", async () => {
    const user = userEvent.setup();
    window.history.replaceState({ idx: 0 }, "", "/destino");
    render(
      <BrowserRouter>
        <RoutesUnderTest />
      </BrowserRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Abrir editor" }));
    await dirty();
    act(() => window.history.back());
    await screen.findByRole("dialog", { name: "Alterações não salvas" });
    await waitFor(() => expect(window.location.pathname).toBe("/editor"));
    await user.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(screen.getByRole("textbox", { name: "Rascunho" })).toHaveValue(
      "Edição preservada",
    );
    act(() => window.history.back());
    await user.click(
      await screen.findByRole("button", { name: "Descartar alterações" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Destino" }),
    ).toBeVisible();
    await waitFor(() => expect(window.location.pathname).toBe("/destino"));
  });
});
