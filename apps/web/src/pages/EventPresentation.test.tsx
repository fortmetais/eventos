import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ManageEvents } from "./ManageEvents";
import { EventDetail } from "./EventDetail";
import { publicEventPath } from "../lib/event-presentation";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ eventsEnabled: true }) }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org-a",
    membership: { role: "ORGANIZER" },
  }),
}));
const event = {
  id: "event-a",
  slug: "3-fac-2027",
  name: "FAC 2027",
  type: { name: "FAC" },
  description: "Acampamento comunitário de 2027.",
  location: "Salão paroquial",
  city: "Toledo",
  startsAt: "2027-02-05",
  endsAt: "2027-02-09",
  status: "PUBLISHED",
  imageUrl: "https://storage.test/desktop.webp",
  mobileImageUrl: "https://storage.test/mobile.webp",
  campaigns: [],
};
beforeEach(() => {
  mocks.api.mockReset();
  vi.stubGlobal("scrollTo", vi.fn());
  URL.createObjectURL = vi.fn(() => "blob:test-banner");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("o cadastro completo usa os mesmos banners e endereço personalizado", async () => {
  mocks.api.mockResolvedValue([event]);
  render(
    <MemoryRouter>
      <ManageEvents />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("link", { name: /Ver página pública/ }),
  ).toHaveAttribute("href", "/eventos/3-fac-2027");
  await userEvent.click(
    screen.getByRole("button", { name: "Editar informações" }),
  );
  expect(
    screen.queryByRole("heading", { name: event.name }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Ver página pública/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Endereço personalizado/), {
    target: { value: "4 FAC 2028" },
  });
  fireEvent.blur(screen.getByLabelText(/^Endereço personalizado/));
  const mobile = new File(["imagem"], "mobile.webp", { type: "image/webp" });
  await userEvent.upload(screen.getByLabelText(/^Banner para celular/), mobile);
  await userEvent.click(screen.getByRole("button", { name: "Salvar edição" }));
  await waitFor(() =>
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(true),
  );
  const call = mocks.api.mock.calls.find(
    ([, options]) => options?.method === "PUT",
  )!;
  expect(call[1].body.get("mobileArtwork")).toBe(mobile);
  expect(JSON.parse(call[1].body.get("data"))).toMatchObject({
    slug: "4-fac-2028",
    imageUrl: event.imageUrl,
  });
  expect(
    await screen.findByRole("heading", { name: event.name }),
  ).toBeInTheDocument();
});
it("a página pública recebe o slug e oferece a imagem de celular sem recortar o banner", async () => {
  mocks.api.mockResolvedValue(event);
  const view = render(
    <MemoryRouter initialEntries={["/eventos/3-fac-2027"]}>
      <Routes>
        <Route path="/eventos/:id" element={<EventDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  const image = await screen.findByRole("img", { name: event.name });
  expect(mocks.api).toHaveBeenCalledWith(
    "/public/events/3-fac-2027",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(image).toHaveAttribute("src", event.imageUrl);
  expect(view.container.querySelector("picture source")).toHaveAttribute(
    "srcset",
    event.mobileImageUrl,
  );
  expect(view.container.querySelector("picture source")).toHaveAttribute(
    "media",
    "(max-width: 767px)",
  );
  expect(publicEventPath({ id: "original" })).toBe("/eventos/original");
});
it("o evento antigo continua exibindo a imagem de computador quando não há banner de celular", async () => {
  mocks.api.mockResolvedValue({ ...event, slug: null, mobileImageUrl: null });
  const view = render(
    <MemoryRouter initialEntries={["/eventos/event-a"]}>
      <Routes>
        <Route path="/eventos/:id" element={<EventDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole("img", { name: event.name })).toHaveAttribute(
    "src",
    event.imageUrl,
  );
  expect(view.container.querySelector("picture source")).toBeNull();
});
