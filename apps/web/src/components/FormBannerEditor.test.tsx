import { useState } from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FormBannerEditor,
  formBannerBody,
  useBannerPreview,
} from "./FormBannerEditor";
import type { FormConfig } from "../lib/types";

const initial: FormConfig = {
  askCpf: false,
  askAddress: false,
  askShirt: false,
  questions: [],
  terms: "Termos gerais da inscrição",
  banner: {
    url: "https://storage.test/banner.webp",
    bucket: "artes-eventos",
    key: "banner.webp",
    width: 1600,
    height: 400,
  },
};
beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:banner-preview");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Controlled({
  save = vi.fn(),
  banner = initial.banner,
}: {
  save?: (body: FormConfig | FormData) => void;
  banner?: FormConfig["banner"];
} = {}) {
  const [config, setConfig] = useState({ ...initial, banner });
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useBannerPreview(file, config.banner?.url);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(formBannerBody(config, file));
      }}
    >
      <FormBannerEditor
        previewUrl={previewUrl}
        onFile={setFile}
        onRemove={() => setConfig((current) => ({ ...current, banner: null }))}
      />
      <button>Publicar</button>
    </form>
  );
}
describe("Banner da ficha", () => {
  it("informa dimensões e formatos e reutiliza o banner existente sem novo upload", async () => {
    const save = vi.fn();
    render(<Controlled save={save} />);
    expect(screen.getByText(/1600 × 400 pixels/)).toBeVisible();
    expect(screen.getByAltText("Prévia do banner da ficha")).toHaveAttribute(
      "src",
      initial.banner!.url,
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(save).toHaveBeenCalledWith(initial);
  });
  it("prepara multipart com arquivo e configuração e exibe a prévia", async () => {
    const save = vi.fn();
    render(<Controlled save={save} banner={null} />);
    const file = new File(["png"], "banner.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText(/Banner da ficha/), file);
    expect(
      await screen.findByAltText("Prévia do banner da ficha"),
    ).toHaveAttribute("src", "blob:banner-preview");
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    const body = save.mock.calls[0][0] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("banner")).toBe(file);
    expect(JSON.parse(body.get("data") as string)).toMatchObject({
      terms: initial.terms,
      banner: null,
    });
  });
  it("remove o banner somente da nova configuração e libera o arquivo de prévia", async () => {
    const save = vi.fn();
    render(<Controlled save={save} />);
    await userEvent.upload(
      screen.getByLabelText(/Banner da ficha/),
      new File(["png"], "banner.png", { type: "image/png" }),
    );
    await screen.findByAltText("Prévia do banner da ficha");
    await userEvent.click(
      screen.getByRole("button", { name: "Remover banner desta versão" }),
    );
    expect(
      screen.queryByAltText("Prévia do banner da ficha"),
    ).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:banner-preview");
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(save).toHaveBeenCalledWith({ ...initial, banner: null });
    expect(initial.banner!.url).toBe("https://storage.test/banner.webp");
  });
  it("recusa arquivo fora do formato ou acima do limite preservando o banner atual", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Controlled />);
    await user.upload(
      screen.getByLabelText(/Banner da ficha/),
      new File(["svg"], "banner.svg", { type: "image/svg+xml" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("até 10 MB");
    const large = new File(["png"], "banner.png", { type: "image/png" });
    Object.defineProperty(large, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText(/Banner da ficha/), large);
    expect(screen.getByRole("alert")).toHaveTextContent("até 10 MB");
    expect(screen.getByAltText("Prévia do banner da ficha")).toHaveAttribute(
      "src",
      initial.banner!.url,
    );
  });
});
