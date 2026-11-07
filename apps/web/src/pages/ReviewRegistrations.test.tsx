import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewRegistrations } from "./ReviewRegistrations";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ eventsEnabled: true }) }));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org",
    membership: { role: "ORGANIZER" },
  }),
}));
vi.mock("../components/GuardianNotice", () => ({ GuardianNotice: () => null }));
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
              status: "RECEIVED",
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
describe("Link para candidatura correspondente", () => {
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
