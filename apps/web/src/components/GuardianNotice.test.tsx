import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GuardianNotice } from "./GuardianNotice";

const mocks = vi.hoisted(() => ({
  state: {
    ready: true,
    needsAuthorization: true,
    authorization: null as null | Record<string, unknown>,
  },
}));
vi.mock("../lib/hooks", () => ({
  useRemote: () => ({
    loading: false,
    error: "",
    data: mocks.state,
    refresh: vi.fn(),
  }),
}));
beforeEach(() => {
  mocks.state = { ready: true, needsAuthorization: true, authorization: null };
});
afterEach(cleanup);

describe("Autorização pendente e confirmação de vaga", () => {
  it("mantém a orientação de bloqueio para inscrições nativas por padrão", () => {
    render(<GuardianNotice organizationId="org" registrationId="native" />);
    expect(
      screen.getByText(/Crie a solicitação antes de confirmar a participação/),
    ).toBeVisible();
    expect(
      screen.queryByText(/A vaga pode ser confirmada/),
    ).not.toBeInTheDocument();
  });
  it.each([
    "sem termo",
    "aguardando assinatura",
    "link expirado",
    "sem configuração",
  ])(
    "explica confirmação de vaga importada sem conceder autorização: %s",
    (status) => {
      if (status === "aguardando assinatura" || status === "link expirado")
        mocks.state.authorization = {
          id: "term",
          signedAt: null,
          active: false,
          expired: status === "link expirado",
          emailStatus: "PENDENTE",
        };
      if (status === "sem configuração") mocks.state.ready = false;
      render(
        <GuardianNotice
          organizationId="org"
          registrationId="imported"
          allowPendingConfirmation
        />,
      );
      expect(
        screen.getByText(
          /A vaga pode ser confirmada; a autorização do responsável permanece obrigatória antes do evento/,
        ),
      ).toBeVisible();
      expect(
        screen.queryByText(/A participação ainda não pode ser confirmada/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Assinado por/)).not.toBeInTheDocument();
    },
  );
});
