import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkDisponibilidad } from "./availability.js";

const ORIGINAL_FETCH = globalThis.fetch;

describe("checkDisponibilidad — cliente del availability-engine", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("retorna el JSON del engine cuando todo va bien", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fecha: "2026-06-15",
        num_personas: 3,
        hay_disponibilidad: true,
        opciones: [
          { salida_id: "S1", hora: "08:30", hora_display: "8:30 AM", suficiente: true },
          { salida_id: "S2", hora: "10:00", hora_display: "10:00 AM", suficiente: true },
        ],
        horarios_disponibles: ["8:30 AM", "10:00 AM"],
      }),
    });

    const r = await checkDisponibilidad("2026-06-15", 3);
    expect(r.hay_disponibilidad).toBe(true);
    expect(r.horarios_disponibles).toEqual(["8:30 AM", "10:00 AM"]);
    expect(r.opciones.length).toBe(2);
  });

  it("propaga error si el engine devuelve no-OK", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    await expect(checkDisponibilidad("2026-06-15", 3)).rejects.toThrow(/availability-engine/);
  });

  it("rechaza inputs inválidos antes de llamar al engine", async () => {
    await expect(checkDisponibilidad("", 3)).rejects.toThrow();
    await expect(checkDisponibilidad("2026-06-15", 0)).rejects.toThrow();
    await expect(checkDisponibilidad("2026-06-15", -1)).rejects.toThrow();
    await expect(checkDisponibilidad("2026-06-15", 1.5)).rejects.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("pasa fecha y num_personas correctamente al engine", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hay_disponibilidad: false, opciones: [] }),
    });
    await checkDisponibilidad("2026-06-15", 4);
    const call = globalThis.fetch.mock.calls[0];
    expect(call[0]).toContain("/functions/v1/availability-engine/check");
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ fecha: "2026-06-15", num_personas: 4 });
    expect(call[1].method).toBe("POST");
  });
});
