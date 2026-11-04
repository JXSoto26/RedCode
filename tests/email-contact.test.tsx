// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailContact } from "@/components/sections/email-contact";
import { emailHref, site } from "@/lib/site";

afterEach(cleanup);

const EMAIL = "redcodepr@gmail.com";

function renderContact() {
  render(<EmailContact email={site.contact.email!} href={emailHref!} primary />);
}

describe("email contact", () => {
  it("uses exactly mailto:<address> from lib/site.ts", () => {
    expect(site.contact.email).toBe(EMAIL);
    expect(emailHref).toBe(`mailto:${EMAIL}`);
    renderContact();
    const link = screen.getByRole("link", { name: /Abrir en tu app de correo/ });
    expect(link.getAttribute("href")).toBe(`mailto:${EMAIL}`);
    expect(link.getAttribute("target")).toBeNull();
  });

  it("shows the full address so it can be selected by hand", () => {
    renderContact();
    expect(screen.getByText(EMAIL).className).toContain("select-all");
  });

  it("copies the address and confirms it accessibly, without claiming anything was sent", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderContact();
    await user.click(screen.getByRole("button", { name: "Copiar email" }));
    expect(writeText).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByRole("status").textContent).toContain(`Dirección copiada: ${EMAIL}`);
    expect(screen.getByRole("button", { name: "Copiado" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/email enviado|mensaje enviado|enviamos/i);
  });

  it("explains how to copy by hand when the clipboard fails, and selects the address", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    renderContact();
    await user.click(screen.getByRole("button", { name: "Copiar email" }));
    expect(screen.getByRole("status").textContent).toMatch(/No se pudo copiar automáticamente.*Ctrl\+C/);
    expect(window.getSelection()?.toString()).toBe(EMAIL);
  });

  it("tells a missing mail app apart from a broken link", () => {
    renderContact();
    expect(document.body.textContent).toMatch(/no tenga una app de correo configurada/);
  });
});

describe("email links across the site", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("build mailto links only from lib/site.ts (the panel's client links aside)", () => {
    const offending = ["app", "components", "lib"]
      .flatMap(files)
      .filter((f) => !/[\\/]admin[\\/]/.test(f) && !f.endsWith(join("lib", "site.ts")))
      .filter((f) => /mailto:/.test(readFileSync(f, "utf8")));
    expect(offending).toEqual([]);
  });
});
