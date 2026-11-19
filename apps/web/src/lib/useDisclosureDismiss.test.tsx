import { useRef, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useDisclosureDismiss } from "./useDisclosureDismiss";
afterEach(cleanup);
function Example() {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), container = useRef<HTMLDivElement>(null);
  useDisclosureDismiss(open, () => setOpen(false), trigger, container);
  return <><div ref={container}><button ref={trigger} aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
    {open && <a href="#content">Página</a>}</div><input aria-label="Fora do menu" /></>;
}
describe("Disclosure dismissal", () => {
  it("closes by Escape even when pointer activation did not focus the trigger", async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    screen.getByRole("textbox").focus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });
  it("closes outside without stealing focus from the chosen control", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    await userEvent.click(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
});
