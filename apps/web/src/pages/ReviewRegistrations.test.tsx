import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewRegistrations } from "./ReviewRegistrations";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  noticeOpened: vi.fn(),
  status: "RECEIVED",
  team: null as { id: string; name: string } | null,
}));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ eventsEnabled: true }) }));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org",
    membership: { role: "ORGANIZER" },
  }),
}));
vi.mock("../components/GuardianNotice", () => ({ GuardianNotice: () => null }));
vi.mock("../components/DecisionNotice", async () => {
  const { useEffect } = await import("react");
  return {
    DecisionNotice: () => {
      useEffect(() => {
        mocks.noticeOpened();
      }, []);
      return null;
    },
  };
});
vi.mock("../lib/hooks", () => ({
  useRemote: (path: string | null) => ({
    loading: false,
    refresh: vi.fn(),
    data: !path
      ? null
      : path.endsWith("/events")
        ? []
        : path.includes("?")
          ? { items: [], total: 0 }
          : {
              id: "existing",
              protocol: "INS-EXISTENTE",
              status: mocks.status,
              team: mocks.team,
              origin: "PUBLIC_FORM",
              snapshot: {
                name: "Maria Teste",
                phone: "44999999999",
                photoAssetId: "photo",
              },
              person: { name: "Maria Teste" },
              history: [],
              campaign: {
                kind: "VOLUNTEER",
                event: { name: "FAC Teste", startsAt: "2027-02-05" },
              },
            },
  }),
}));
afterEach(cleanup);
beforeEach(() => {
  mocks.api.mockResolvedValue({ url: "https://example.test/photo.webp" });
  mocks.status = "RECEIVED";
  mocks.team = null;
  mocks.noticeOpened.mockClear();
});
describe("Link para candidatura correspondente", () => {
  it("recarrega o aviso ao mudar de departamento, mesmo mantendo a situação da candidatura", () => {
    mocks.status = "APPROVED";
    mocks.team = { id: "secretaria", name: "SECRETARIA" };
    const content = () => (
      <MemoryRouter
        initialEntries={["/organizacao/org/inscricoes?inscricao=existing"]}
      >
        <ReviewRegistrations />
      </MemoryRouter>
    );
    const view = render(content());
    expect(mocks.noticeOpened).toHaveBeenCalledTimes(1);
    view.rerender(content());
    expect(mocks.noticeOpened).toHaveBeenCalledTimes(1);
    mocks.team = { id: "anjos", name: "ANJOS" };
    view.rerender(content());
    expect(mocks.noticeOpened).toHaveBeenCalledTimes(2);
    mocks.team = { id: "anjos", name: "ANJOS GUARDIÕES" };
    view.rerender(content());
    expect(mocks.noticeOpened).toHaveBeenCalledTimes(3);
  });
  it("abre a ficha indicada na URL e carrega sua foto mesmo fora da página atual da lista", async () => {
    mocks.api.mockResolvedValue({ url: "https://example.test/photo.webp" });
    render(
      <MemoryRouter
        initialEntries={[
          "/organizacao/org/inscricoes?evento=event&inscricao=existing",
        ]}
      >
        <ReviewRegistrations />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Maria Teste" })).toBeVisible();
    expect(screen.getByText("INS-EXISTENTE")).toBeVisible();
    expect(
      await screen.findByRole("img", { name: "Foto de Maria Teste" }),
    ).toHaveAttribute("src", "https://example.test/photo.webp");
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/existing/photo",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
